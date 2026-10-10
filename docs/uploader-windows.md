# Windows RivalHub Demo Uploader 安装与诊断

推荐下载 `RivalHub-Demo-Uploader-Setup-X.Y.Z.exe`。它含完整应用，不在安装时下载应用包。
默认安装在 `%LOCALAPPDATA%\Programs\RivalHub Demo Uploader`，可直接编辑或选择路径。
欢迎 → 选择目录 → 安装进度 → 完成；完成页可选择启动。开始菜单快捷方式默认创建，
桌面快捷方式可选。启动使用快捷方式，不要把内部 EXE 拖出去。

## 系统和依赖

| 项目 | 随包 / 检测 | 操作 |
|---|---|---|
| 原生 Windows x64、Windows 10 1809+ / Windows 11 | 安装器平台限制 | ARM64 和更早系统未验收 |
| Python 3.12、VC/UCRT 与原生扩展 | PyInstaller 完整 onedir 随包 | 无需安装 Python；损坏时重运行安装器 |
| pythonnet / clr-loader 桥接 DLL | 随包 | 桥接 DLL 不包含完整 .NET 运行时 |
| .NET Framework 4.7.2+ | 安装和启动读注册表 Release >= 461808 | [微软 .NET Framework 4.8 安装/修复](https://dotnet.microsoft.com/en-us/download/dotnet-framework/net48)；现代 .NET SDK/Runtime 不能替代它 |
| Microsoft Edge WebView2 Evergreen Runtime | 检测用户/机器官方 `pv` 注册表值 | [微软下载页](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section)，选择 Evergreen Standalone Installer x64；安装 Edge 浏览器不等同于 Runtime |

4.7.2 是本安装器选择的 .NET Framework 支持基线。[pythonnet 官方说明](https://pythonnet.github.io/pythonnet/python.html)
描述 Windows 默认 netfx 以及 4.7.2+ 的建议。[WebView2 分发文档](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)
说明用户/机器检测和官方离线安装方式。检测存在不等于证明运行时健康；加载失败仍保存证据。
不自动盲装、不更改安全策略。完全离线的新机器应提前从官方准备系统运行时安装包。

## 升级、修复和卸载

- 原安装：相同版本重运行可恢复缺失应用文件，更高版本在原目录升级；拒绝降级。
- 改路径：先从 Windows「设置 → 应用」卸载，再选择新的空目录安装。
- 旧 ZIP / 陌生非空目录：拒绝接管，选择新的空目录。现有授权和资料仍沿用原用户目录。
- 资料、连接元数据和日志在 `%LOCALAPPDATA%\RivalHub Demo Uploader`；授权在 Windows
  凭据管理器。升级、卸载、重装保留它们；解除网站授权请使用应用已有断开连接功能。
- 卸载只处理安装记录中的应用文件和快捷方式，不递归清空目录。自行加入的陌生文件保留。
  有残留文件的目录不自动接管，重新安装请选择空目录。

ZIP 兜底仍为 `rivalhub-demo-uploader-windows-X.Y.Z.zip`，必须完整解压，在同一目录运行 EXE，
保留 `_internal`。安装器不能替已被单独拖出的 EXE 修复搜索路径；应使用安装后的快捷方式。

## 启动失败与挂起

启动日志为 `%LOCALAPPDATA%\RivalHub Demo Uploader\uploader.log`，滚动保留两份历史。
日志在导入 webview 前初始化，记录 Python / 包版本、平台、EXE / 工作目录 / runtime 路径、
关键 DLL 的大小和 SHA-256、系统运行时检测、完整 Python traceback 和 managed InnerException。
目录不可写时退回独立的系统临时日志目录，错误提示会显示实际位置。

启动异常提示日志位置；先保存日志和报错全文，再根据明确缺失提示从官方修复运行库。
重运行安装器可修复应用文件，但不保证解决未知机器上的 CLR 故障。
PyInstaller 在 Python 启动前就找不到 `python312.dll` 时，应用代码尚未执行，无法创建应用日志，
需同时保存系统弹窗和目录结构。已打开后未响应时，保留现场并记录版本、进程/线程、任务管理器
状态和日志；关闭进程会丢失挂起现场。该空启动挂起已由后续本机线程证据定位为公开 window 引用导致的桥接反射死锁，
最小源码修复和独立回归在 PR #73；本安装器分支同步该修复。详情见
[启动回归](uploader-startup-regression.md)。Loader.Initialize 报告仍独立待证。

## 构建与验收

Windows 安装 Inno Setup 6.4+（[官方](https://jrsoftware.org/isdl.php)），使用仓库冻结依赖：

```bash
bash scripts/package-uploader.sh
```

产物在 `python/dist/`：安装 EXE + 完整 ZIP。PR 的 **Uploader Windows installer** workflow
只构建并保存 Actions artifact，不创建 Release、不推 tag、不上传 R2。用
`uploader-windows-review` artifact 的当前版本安装器验收；较高版本 CI fixture 只用于安装版本
升级规则检查，不代表另一个真实应用版本。PR 审阅构建沿用 main 的桌面版本号，
但来自 PR commit（当前 pythonnet 3.2.0），不等同于已发布 v0.8.4 官方包（pythonnet 3.1.0）。
公开下载消费者应优先取 `assets.windowsInstaller`，再用 `assets.windows` ZIP 兜底；
其它仓库的官网消费代码不在本 PR 修改范围。

自动化负责：Windows 编译、中文/空格路径隔离新装、缺 DLL 修复、升级和拒绝降级、陌生目录
拒绝、快捷方式 TargetPath/WorkingDirectory、frozen 消息响应/前端 bridge ready/原生保存对话框及取消、卸载保留陌生文件/用户资料、
重装。`loaded` 只证明后端窗口加载事件，不能证明页面后续响应和实际网站授权/上传。
Linux pytest/静态检查不算 Windows 启动通过。

实机验收请在新的测试 Windows 用户或虚拟机做，不操作当前工作安装：

1. 普通权限新装，编辑中文/空格路径；检查欢迎/目录/进度/完成页和可选启动。
2. 开始菜单与可选桌面快捷方式启动，页面响应、浏览器授权、选择 Demo、正常退出。
3. 相同版本修复缺失 DLL；较高实际版本升级，授权/资料保留；运行中安装要求先正常退出，
   不强制终止上传；中断安装后可再次修复。
4. 陌生非空目录拒绝且原文件完整，移动安装需先卸载；取消安装不创建可用的部分安装。
5. 卸载、保留陌生文件与资料、重新安装后授权仍可读；桌面/开始菜单旧快捷方式正确移除。
6. 独立缺 .NET Framework / WebView2 的测试机验证精确官方指引；不得卸载工作机共享运行库。
   故障测试机核日志和内层异常完整，不要求关闭 Defender、SmartScreen 或其它安全策略。
7. 使用完整 ZIP 兜底启动；记录安装器来源/版本/哈希、Windows build、运行时版本与日志。

实机记录还需覆盖 UAC、目录权限、应用被占用、磁盘空间不足与安装中断等交互风险。
产物未签名，信任提示和杀毒误报仍需独立评估；本 PR 不承诺签名或生产验收。
