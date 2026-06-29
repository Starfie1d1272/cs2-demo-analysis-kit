# DAK Studio 分发架构

0.7.0 引入新的分发架构——从"一个大 zip 包罗万象"进化到三层分发 +
installer 预装资产 + health check 修复。

## 三层分发

| 产物 | 内容 | 受众 | 大小 |
|------|------|------|------|
| `DAK-Studio-Setup-X.Y.Z.exe` | 仅安装逻辑，联网拉取一切 | 默认推荐 | ~15MB |
| `dak-studio-windows-X.Y.Z-full.zip` | runtime + events + tris 预装 | 离线/手动 | ~400MB |
| `dak-studio-windows-X.Y.Z.zip` | 仅 runtime（无 events/tris） | 开发者 | ~80MB |

## 安装后目录结构

```
DAK Studio/
  dak-studio.exe / _internal/      # PyInstaller onedir runtime
  userdata/                         # 用户数据（运行期产生）
    studio.sqlite                   # 资料库 + facts
    demos/                          # 原始 ZIP
    backups/                        # 本机备份
    reports/                        # 导出报告
  assets/                           # 官方/外置可重下资产
    bundled-events/                 # 预装赛事包（installer 写入）
      iem-cologne-major-2026-stage3.zip
      iem-cologne-major-2026-playoff.zip
      manifest.json                 # 本地 eventsManifest（供前端发现）
    tris/                           # 碰撞几何 overlay
      de_ancient.tri ...
    install-manifest.json           # 安装时写入，供 health check 校验
  cache/                            # 可重建缓存、前端增量 overlay、日志
  updates/                          # 更新下载暂存
```

`userdata/` 只放用户资料库；官方资产、缓存和更新暂存按生命周期拆到 sibling
目录。升级自 0.7.x 时，启动迁移会把旧 `userdata/bundled-events`、
`userdata/tris`、`userdata/install-manifest.json`、`userdata/cache`、
`userdata/updates` 挪到新目录。

## Web Installer

`DAK-Studio-Setup-X.Y.Z.exe` 是 PyInstaller onefile（~15MB），仅包含：
- tkinter 极简 GUI
- `updater.download_with_fallback()` 下载逻辑
- 无 studio_web/、cs2df、awpy 等重依赖

安装流程：
1. 选择安装目录
2. 拉取 `install-manifest.json` 显示总大小
3. 下载 runtime zip → 解压
4. 下载 bundled events → 写入 `assets/bundled-events/`
5. 下载 required tris → 写入 `assets/tris/`
6. 写入 manifest、创建快捷方式
7. 启动 Studio

已存在且 hash 匹配的文件自动跳过（幂等安装）。

## install-manifest.json

Web Installer 和 health check 的共同输入，描述一次完整安装需要的所有资产。

Schema: `cs2-demo-analysis-kit/install-manifest-1.0`

关键字段：
- `channel`: `"stable"` | `"beta"` — installer/health check 按 channel 过滤
- `assetSet`: `"cologne-major-2026-full"` — 资产集标识，以后可做轻量集
- `runtime`: 核心运行时 zip 的 size/sha256/urls
- `bundledEvents[]`: 预装赛事包列表
- `requiredTris[mapName]`: 所需碰撞几何，含 `requiredBy` 字段说明被哪些赛事需要

由 `scripts/gen-install-manifest.mjs` 生成。上传到 R2 两个路径：
- `releases/vX.Y.Z/install-manifest.json`（versioned，可复现）
- `releases/install-manifest.json`（latest，installer 默认入口）

## Asset Health Check

Studio 启动时自动运行轻检查（存在 + size），不 hash 避免拖慢启动。

返回 `status`：
- `ok`: 资产完整，不显示横幅
- `not_installed`: `install-manifest.json` 不存在（老用户 auto-update 后首次启动）
  → 蓝色横幅 "可安装官方示例资产"
- `incomplete`: 资产缺失/size 不匹配 → 黄色横幅 "资产缺失，部分分析可能降级"
- `corrupt`: sha256 不匹配（仅 deep 模式检出）→ 红色横幅

修复：bridge `repair_assets(items)` → 批量下载 + sha256 校验。

## 旧版 auto-update 闭环

0.6.x 用户通过 in-app update 到 0.7.0 时：
- Auto-updater 只替换 runtime zip，不携带 bundled-events/tris
- 首次 0.7.0 启动 → `install-manifest.json` 不存在 → status=`not_installed`
- 显示 "安装 Cologne 示例资产" 横幅
- 用户点击 → 联网下载 → 写入 manifest → 完整体验

这是整个分发方案最关键的一环——不是锦上添花，而是必须闭环。

## R2 端点总览

| 路径 | 内容 | 缓存 |
|------|------|------|
| `releases/latest.json` | 更新 manifest | `max-age=300` |
| `releases/install-manifest.json` | 安装资产 manifest（latest） | `max-age=300` |
| `releases/<tag>/install-manifest.json` | 安装资产 manifest（versioned） | immutable |
| `releases/<tag>/dak-studio-windows-<ver>.zip` | Core runtime | immutable |
| `releases/<tag>/DAK-Studio-Setup-<ver>.exe` | Web Installer | immutable |
| `releases/<tag>/dak-studio-windows-<ver>-full.zip` | Full portable zip | immutable |
| `events/<slug>/<slug>.zip` | Event packages | immutable |
| `events/manifest.json` | Event package 清单 | `max-age=300` |
| `tris/<map>.tri` | 碰撞几何（per map） | immutable |
| `tris/manifest.json` | Tris 清单 | `max-age=300` |

## 与 auto-update 的边界

| | Auto-update | Web Installer |
|---|---|---|
| 触发 | Studio 内检查更新 | 用户下载 setup.exe |
| 替换内容 | 仅 runtime | runtime + events + tris |
| userdata 处理 | 保留 userdata/assets/cache/updates | installer 初次写入 assets |
| 适用对象 | 已有安装的老用户 | 全新安装 |

两者不互相替代——installer 做首次安装，auto-update 做运行时更新。
Health check 桥接两者：auto-update 后缺失资产 → health check 修复。

## 应用内更新包选择

应用内更新现在分两类：

| 类型 | 内容 | 适用 |
|---|---|---|
| `web` patch | `studio_web` 前端构建产物 | 只改 Studio 前端、TS 分析/展示代码时；已安装用户下载小包后刷新生效 |
| `runtime` zip | PyInstaller onedir runtime | 改 Python bridge、updater、installer、PyInstaller、依赖或未知路径时 |

判断规则在仓库根的 `release-update-policy.json`。workflow 默认自动判断；手动 beta workflow 可强制
`web` 或 `runtime`。未知路径默认 runtime，避免小包漏更新。
