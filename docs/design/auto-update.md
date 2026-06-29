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
替换：runtime ──> StudioApi.update_apply ──> updater.apply_windows_update
      web patch ─> StudioApi.update_apply_web ──> cache/studio-web overlay + reload
                                                        runtime 解压旁目录 + 写接力 .bat + 退出进程
                                        ↓ .bat 接管
       等本进程退出 → 旧目录改名 → 新目录就位 → 搬回 userdata/assets/cache/updates → 重启 → 清理 → 自删
```

### 1. 检查（manifest 驱动）

- 客户端：[`apps/dak-studio/src/lib/update.ts`](../../apps/dak-studio/src/lib/update.ts)。
- 不再依赖 `api.github.com`。拉 `latest.json`，来源按优先级（`manifestSources()`）：
  1. **R2（自建，最高优先级）**：`https://dakupdate.starfie1d.top/releases/latest.json`；
  2. **GitHub Release 直连**：`https://github.com/<owner>/<repo>/releases/latest/download/latest.json`（权威源/兜底）；
  3. **ghproxy×3**：套在 GitHub URL 前的公共代理（最后兜底）。
- **失败转移**：按上面顺序尝试，单个 8s 超时切下一个。
- **兜底**：所有来源失败 → 退回 GitHub API（直连成功的网络仍可用），老发布（无 manifest）也能给出“去下载”链接。
- manifest 由发版 CI 生成：[`scripts/gen-update-manifest.mjs`](../../scripts/gen-update-manifest.mjs)（算 sha256/size，
  写 `asset.urls` 列表，顺序同样是 **R2 → GitHub → ghproxy**）。manifest 可同时包含
  `assets.web`（前端增量包，优先）和 `assets.windows`（完整 runtime zip，兜底）。
- 更新通道：stable 读 `releases/latest.json`；beta 读 `releases/beta/latest.json`，只走 R2，
  用于 Windows 真机测试。

#### R2 镜像（Cloudflare R2）

| 项 | 值 |
|---|---|
| bucket | `cs2dak-assets` |
| public base | `https://dakupdate.starfie1d.top`（自定义域，不用 r2.dev） |
| manifest 路径 | `releases/latest.json`（短缓存 `max-age=300`） |
| Windows zip 路径 | `releases/<tag>/dak-studio-windows-<version>.zip`（不可变，长缓存） |
| GitHub Secrets | `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` / `R2_ENDPOINT` |

发版 CI（[`release.yml`](../../.github/workflows/release.yml)）在 GitHub Release 之外，
用 `aws s3 cp --endpoint-url "$R2_ENDPOINT"` 把 zip 与 `latest.json` 同步到上述路径
（`aws-cli` v2 的 flexible checksum 设为 `when_required` 以兼容 R2）。
R2 上传路径与 manifest `asset.urls` 里的 R2 URL **必须一致**，否则客户端命中 404 才转移。
优先级：**R2 → GitHub Release（权威源）→ ghproxy（最后兜底）**。

### 2. 下载 + 校验（Python）

- [`python/src/cs2dak/updater.py`](../../python/src/cs2dak/updater.py) `download_with_fallback`：
  按 manifest 的 `asset.urls` 顺序尝试，下到 `updates/downloads/<name>.part`，
  校验 size + **sha256**（第三方代理不可信，校验是硬要求），通过后原子改名。
- 桥：`StudioApi.update_start/update_status`（后台任务 + 轮询，仿导出 job）。

### 3. 替换（Windows side-by-side 接力）

Windows 无法删除/覆盖正在运行的 exe。`apply_windows_update`：

1. 下载更新包到 `updates/downloads/`；
2. 写 `apply-update.bat`：等当前进程 PID 退出 → 旧目录改名 `*.old-<ts>` →
   新目录移到原位 → **从 `*.old` 搬回 `userdata/`**（便携式数据不能丢）→
   启动新 exe → 删旧目录 → 自删脚本；
3. detached 启动 .bat，然后销毁窗口退出，交给脚本接管。

**回滚**：旧目录改名失败/移动失败时把 `*.old` 改回原名再启动，保证不变砖。

### 4. `.tri` 资产外置（0.6.4 已去内置化，安装包 ~220MB → ~20MB）

- 静态服务 `/tris/` 支持 `assets/tris` **overlay**：外置/手动放置/下载的 `.tri`
  优先于打包内置（[`python/src/cs2dak/studio.py`](../../python/src/cs2dak/studio.py)
  `_StudioStaticHandler.translate_path`）。
- 桥：`tri_dir`（overlay 目录）/ `tri_present`（已有图）/ `tri_download`（按需下载，复用 updater）。
- **打包侧**：`package.sh` / `release.yml` **不再把 `.tri` 打进 onedir**。发版 CI 改为把
  awpy `.tri` 与清单同步到 R2：`tris/<map>.tri`（不可变长缓存）+ `tris/manifest.json`
  （短缓存，每图 `size` / `sha256` / `urls`，见
  [`scripts/gen-tris-manifest.mjs`](../../scripts/gen-tris-manifest.mjs)）；
  `aws s3 sync --size-only` 保证仅 awpy 更新时才真正再传 ~200MB。
- **按需下载（全在服务端，前端零改动）**：`_StudioStaticHandler.do_GET` 命中
  `/tris/<map>.tri` 且 overlay/内置都缺时，按 `TRIS_MANIFEST_URL` 拉清单 → 用
  `download_with_fallback` 下到 overlay（sha256 + size 校验，同图并行导入按文件名
  加锁去重）→ 再由 `translate_path` 的 overlay 命中提供。worker/主线程原有的
  `fetch('./tris/<map>.tri')` 不变；下载失败只降级（跳过静态墙体 LOS），不报错。
- **本地调试**：想要内置回退就手动把 `.tri` 放进 `studio_web/tris/`（overlay 优先，
  内置兜底）；dev（vite）仍走 `apps/dak-studio/public/tris/` 符号链接。

## 与 churn 拆分的协同

高频变更（前端 dist）与低频变更（Python 壳/依赖/`.tri`）已经拆开：
高频更新走 `dak-studio-web-<version>.zip`，解压到 `cache/studio-web` overlay；
低频变更继续走完整 runtime zip。`.tri` 与赛事包仍由独立资产 manifest 管理。

---

## ⚠️ 需要你决策/操作的事项

代码已就绪，但以下依赖你的账号/托管决策，**届时按需告诉我即可**：

1. **镜像站点** ✅ **已接入 Cloudflare R2**（`https://dakupdate.starfie1d.top`，最高优先级，
   见上「R2 镜像」表）。公共 ghproxy 仍保留为最后兜底。剩余只差发一次 tag 验证 R2 上传
   链路（见 [`release.md`](../release.md) 发版后验证清单）。
2. **Windows 真机冒烟测试**：接力替换（`apply_windows_update`）我无法在 macOS 验证。
   发一个测试 tag 出 0.7.0-rc，在 Windows 上装旧版 → 点“一键更新”，确认：下载进度正常、
   重启后版本号变了、`userdata`（资料库/身份归并）没丢。有问题把 `userdata/studio.log` 发我。
3. **`.tri` 资产托管** ✅ **已落地（0.6.4）**：发版 CI 把 awpy `.tri` 与
   `tris/manifest.json` 同步到 R2，客户端按需下载到 overlay。安装包 ~220MB → ~20MB。
   剩余只差发一次 tag 验证 R2 `.tri` 上传链路 + Windows 真机首次用某图时的按需下载。
4. **签名/公证（可选）**：Windows 代码签名能去掉 SmartScreen 警告、也让自动更新更可信
   （roadmap 0.7 已排）。需要证书（约 $200–400/年 OV，或 EV）。暂不做不影响功能。
