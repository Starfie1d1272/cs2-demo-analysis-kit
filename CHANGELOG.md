# Changelog

DAK Studio 桌面应用及 `@cs2dak/*` 分析管道面向用户的变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循 [Semantic Versioning](https://semver.org/)。

> 0.1.3 起面向 Studio 用户维护。`@cs2dak/*` npm 包版本由 changesets 独立管理（见各包的 CHANGELOG.md）；本文件聚焦 DAK Studio 桌面应用变更。

## [0.1.4] — 2026-06-10

### 修复

- **数据库持久化**：pywebview 默认 `private_mode=True` 导致 Windows 下 IndexedDB 存临时目录、重启丢失。现显式 `private_mode=False` + `storage_path` 落盘到 `%APPDATA%/DAK Studio/userdata/`（macOS 为 `~/Library/Application Support/DAK Studio/userdata/`）。

## [0.1.3] — 2026-06-10

### 修复

- **桌面导入按钮回归**：0.1.2 互斥替换导致原生对话框不可用时零导入途径。现改为双按钮共存（「导入 .dem」原生对话框 + 「导入 ZIP」文件选择），互不替代。
- **拖入 .dem 全平台可用**：Windows pywebview 拖入的 File 无 `pywebviewFullPath`，新增 `export_dem_bytes` API 回退字节传输，拖入不再要求文件系统路径。

### 新增

- **C4 掉落标记**：2D 回放中 C4 掉落地面后以半透明闪烁标记显示位置，直至被捡起或安放。
- **道具飞行轨迹尾迹线**：2D 回放中随播放逐帧延伸的 SVG 虚线，颜色与对应道具落点一致。

### 移除

- 回放模块入口与 Fact 栏中的「含拆弹器状态」/「无拆弹器状态」占位文案（该状态已通过玩家 token 上的 kit/c4 标签表达）。

## [0.1.2] — 2026-06-10

### 变更

- **Release 只发 DAK Studio**：不再产出 `cs2dak` 独立导出器 DMG/zip（Studio 自带 exporter bridge）。本地需纯导出器时 `PACKAGE_EXPORTER=1 bash scripts/package.sh`。
- **内置示例换为职业局**：FURIA vs Vitality de_mirage（之前为 NJU 校赛 demo）。
- **修复按钮文字换行**：CSS `white-space: nowrap` + `flex-shrink: 0`。
- **README 以 Studio 为主导重写**：下载入口优先，功能表格，管道图保留。

## [0.1.1]

### 修复

- vitest 4 根治 CI worker RPC 超时。

## [0.1.0] — 2026-06-08

### 新增

- DAK Studio 首个桌面版本：pywebview 壳 + React 前端 + Python exporter bridge。
- 资料库：IndexedDB 本地存储，导入 .dem（自动转 v2 ZIP）/ v2 ZIP，标签检索，全窗口拖拽。
- 比赛工作台：回合浏览、经济面板、武器统计、对位矩阵、地图图层、8Hz 2D 回放。
- 选手档案：个人 RR 拆解、回合事实、跨场趋势。
- 开局动线：跨场走位与道具习惯（按地图聚合）。
- 排行榜：跨场 RR/PRISM 指标对比。
- 启动时自动检测 GitHub Release 更新。

## 历史版本

[0.2.0]、[0.2.1] 为 npm 包层级的废弃 tag，未对应 Studio 桌面版本。

[0.1.4]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.1.4
[0.1.3]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.1.3
[0.1.2]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.1.2
[0.1.1]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.1.1
[0.1.0]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.1.0
