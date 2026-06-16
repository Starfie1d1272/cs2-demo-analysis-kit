# 自动更新与资产分发（Windows）

> 0.7.0 基础设施。面向 Windows（CS2 仅 Windows 可玩，桌面端只发 Windows）。
> 目标：国内可达的更新检查 + 应用内一键更新，替代“手动下 zip 解压覆盖”。

## 为什么

旧机制两个痛点：

1. **检查更新打 `api.github.com`** —— 国内常被墙/限流，侧栏“新版本”提示经常出不来。
2. **更新只能手动覆盖** —— 用户下整包 zip、解压、覆盖 onedir 里成千上万个小文件，慢且易出错（文件占用、Defender 逐个扫描）。

## 架构

```
检查：客户端 ──(镜像顺序失败转移)──> latest.json manifest
       update.ts                       releases/latest/download/latest.json
                                        ↓ 命中且版本更高
下载：UpdateControl ──桥──> StudioApi.update_start ──> updater.download_with_fallback
       (前端)                (Python)                   镜像顺序试 + .part 暂存 + sha256 校验
                                        ↓ ready
替换：UpdateControl ──桥──> StudioApi.update_apply ──> updater.apply_windows_update
                                                        解压旁目录 + 写接力 .bat + 退出进程
                                        ↓ .bat 接管
       等本进程退出 → 旧目录改名 → 新目录就位 → 搬回 userdata → 重启 → 清理 → 自删
```

### 1. 检查（manifest 驱动）

- 客户端：[`apps/dak-studio/src/lib/update.ts`](../../apps/dak-studio/src/lib/update.ts)。
- 不再依赖 `api.github.com`。拉 `latest.json`（发版作为 Release 资产，挂稳定地址
  `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`）。
- **镜像失败转移**：`MANIFEST_MIRRORS`（直连 + 几个 ghproxy 前缀）按顺序尝试，单个 8s 超时切下一个。
- **兜底**：所有镜像失败 → 退回 GitHub API（直连成功的网络仍可用），老发布（无 manifest）也能给出“去下载”链接。
- manifest 由发版 CI 生成：[`scripts/gen-update-manifest.mjs`](../../scripts/gen-update-manifest.mjs)（算 sha256/size，写二进制镜像 URL 列表）。

### 2. 下载 + 校验（Python）

- [`python/src/cs2dak/updater.py`](../../python/src/cs2dak/updater.py) `download_with_fallback`：
  按 manifest 的 `asset.urls` 顺序尝试，下到 `userdata/updates/<name>.part`，
  校验 size + **sha256**（第三方代理不可信，校验是硬要求），通过后原子改名。
- 桥：`StudioApi.update_start/update_status`（后台任务 + 轮询，仿导出 job）。

### 3. 替换（Windows side-by-side 接力）

Windows 无法删除/覆盖正在运行的 exe。`apply_windows_update`：

1. 解压更新包到 `userdata/updates/extract/`；
2. 写 `apply-update.bat`：等当前进程 PID 退出 → 旧目录改名 `*.old-<ts>` →
   新目录移到原位 → **从 `*.old` 搬回 `userdata/`**（便携式数据不能丢）→
   启动新 exe → 删旧目录 → 自删脚本；
3. detached 启动 .bat，然后销毁窗口退出，交给脚本接管。

**回滚**：旧目录改名失败/移动失败时把 `*.old` 改回原名再启动，保证不变砖。

### 4. `.tri` 资产外置（瘦安装包地基）

- 静态服务 `/tris/` 支持 `userdata/tris` **overlay**：外置/手动放置/下载的 `.tri`
  优先于打包内置（[`python/src/cs2dak/studio.py`](../../python/src/cs2dak/studio.py)
  `_StudioStaticHandler.translate_path`）。
- 桥：`tri_dir`（overlay 目录）/ `tri_present`（已有图）/ `tri_download`（按需下载，复用 updater）。
- **现状**：`package.sh` 仍内置 `.tri` 作回退，无回归。overlay 让未来“去内置化”
  （安装包瘦 ~200MB）可平滑切换：停止内置后，首次用某图时按需下到 overlay。

## 与 churn 拆分的协同（后续）

把高频变更（前端 dist）与低频变更（Python 壳/依赖/`.tri`）拆开后，
高频更新可走更轻的前端热更新包（几 MB，走 CDN），全量 app 更新变罕见——
镜像失败转移这条重路径只在依赖变更时才走。前端热更新尚未实现，是 0.7 后续项。

---

## ⚠️ 需要你决策/操作的事项

代码已就绪，但以下依赖你的账号/托管决策，**届时按需告诉我即可**：

1. **镜像站点（最关键）**。当前内置的是公共 ghproxy 兜底（`ghfast.top` / `gh-proxy.com` /
   `ghproxy.net`），这些域名**经常失效或限速**，不能长期依赖。建议二选一或都做：
   - **自建 CDN/对象存储**：把 `latest.json` 和 Windows zip 也镜像一份到国内可达的存储
     （Cloudflare R2 出口免费但国内时通时不通；国内 OSS/COS 最稳但要备案+按量付费）。
     给我 base URL，我把它加进 `MANIFEST_MIRRORS`（前端）和 `BINARY_MIRROR_PREFIXES`
     （`gen-update-manifest.mjs`），直连优先、镜像兜底。
   - **确认 ghproxy 域名**：如果你有长期稳定的代理域名，告诉我替换掉默认列表。
2. **Windows 真机冒烟测试**：接力替换（`apply_windows_update`）我无法在 macOS 验证。
   发一个测试 tag 出 0.7.0-rc，在 Windows 上装旧版 → 点“一键更新”，确认：下载进度正常、
   重启后版本号变了、`userdata`（资料库/身份归并）没丢。有问题把 `userdata/studio.log` 发我。
3. **`.tri` 资产托管（可选，后续）**：若要去掉内置 `.tri` 瘦身，需要把 `.tri` 包传到某处
   并提供一个 `tris-manifest`（每图 URL + sha256）。现在不做也不影响——内置回退还在。
4. **签名/公证（可选）**：Windows 代码签名能去掉 SmartScreen 警告、也让自动更新更可信
   （roadmap 0.7 已排）。需要证书（约 $200–400/年 OV，或 EV）。暂不做不影响功能。
