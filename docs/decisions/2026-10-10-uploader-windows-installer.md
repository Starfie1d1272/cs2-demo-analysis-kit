# Decision: Windows Uploader 离线标准安装器

Date: 2026-10-10

## Problem

ZIP 用户单独拖出 EXE 会丢失 onedir 依赖；启动 CLR 失败时，原入口不能留下足够日志。

## Previous Assumption

Windows Uploader 只有完整 ZIP；用户自行保持目录结构与检查系统运行时。

## New Evidence

v0.8.4（8835374）官方 ZIP 的现场检查为 40,005,693 字节、1702 项、CRC 正常，
包含 Python 3.12、VC/UCRT、Python.Runtime.dll、ClrLoader.dll、netstandard.dll。
该版本锁定 pythonnet 3.1.0，main 15f5e31 锁定 3.2.0；两者都是 pywebview 6.2.1 /
clr-loader 0.3.1。完整包在另一台 Windows 正常；有机器报告 `Loader.Initialize` 失败，
原因未定。另有页面打开后未响应的报告，后续本机取证证明是公开 window 引用导致桥接反射原生对象死锁；
最小源码修复单独在 PR #73，并同步到安装器分支。该挂起与 Loader.Initialize 仍无同因证据。

## Options Considered

- 继续 ZIP：不能防止只移动 EXE，也没有标准卸载。
- 复用 Studio 的联网 tkinter installer：需要新下载/修复状态，不适合完整的小型 Uploader。
- Mizar 风格 NSIS：可行，但要生成并维护删除清单和升级所有权规则。
- Inno Setup：新增单个构建工具，以原生安装身份、卸载记录、Restart Manager 完成标准安装。

## Decision

采用 Inno Setup 6.4+，按当前用户安装完整 PyInstaller onedir，固定 AppId；默认路径为
`%LOCALAPPDATA%\Programs\RivalHub Demo Uploader`，用户可修改。原安装在原目录升级/修复；
移动安装先卸载，陌生非空目录拒绝覆盖，不导入旧 ZIP 的所有权。卸载仅使用 Inno 原生记录，
不递归删除目录；现有用户资料和凭据存储保持原路径。安装目录增加的陌生文件会保留，
导致重新安装时需选择空目录或手动整理这些文件。

支持原生 Windows x64，Windows 10 1809+ / Windows 11；这是本安装器的支持范围，
不是 Python 或 WebView2 所有版本的理论最低要求。应用包携带 Python 和可随 PyInstaller
分发的运行库；检测 .NET Framework 4.7.2+ 和 WebView2 Evergreen Runtime，缺失时只提供
精确微软入口。4.7.2 是采用的支持基线，不声称 pythonnet 理论最低版本为 4.7.2。
不捆绑共享系统运行时、不自动联网安装、不降低安全策略。

Windows 显式加载 netfx，再启动 Edge Chromium。pywebview 6.2.1 的 winforms 后端先
`import clr`，失败后捕获异常并改为 coreclr 重试，会掩盖首次异常；提前加载 netfx
是为了保存该真实原因，不表示已修复某用户的 `Loader.Initialize` 故障。

现有 `assets.windows` ZIP 字段保持兼容，新 `assets.windowsInstaller` 字段提供推荐安装入口。
历史资产不删除，不增加自动更新器，当前 PR 不创建 tag、不发布、不合并。

## Why

安装数据库唯一 owner 是 Inno；诊断唯一 owner 是 Uploader Python 壳，核心、解析器和
Studio 更新机制不参与。复用现有前端与 onedir 构建，增加最少的本地安装行为。

## Reopen When

本机取证证明存在其它必要运行库或特定启动故障，或需要签名、企业部署、ARM64 支持时，
再基于证据决定，避免把当前两个未核实报告合并为同一个修复结论。
