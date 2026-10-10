# Uploader 空启动挂起修复与证据边界

pywebview 6.2.1 的 `inject_pywebview → generate_js_object → get_functions` 对 JS API 的
公开属性执行 `getattr` 并递归枚举对象。`UploaderApi.window` 让它进入原生窗口的
`AccessibilityObject.Bounds`：桥接线程持有 GIL 等待 COM，而 WinForms UI 线程等待 GIL。
页面已经绘制不代表桥接 ready。修复只把四处窗口引用一致改为 `_window`，遵循该后端
忽略下划线属性的边界；14 个前端 API 不变，不重写应用架构。

## 已有用户实机证据

Windows 11 x64、Python 3.12.10、.NET 4.8.1、WebView2 154，在官方 v0.8.4 空目录启动也
重复挂起，发生在登录/选择 Demo/上传之前。调查副本只改四处引用，用户已验证两次恢复
Responding、桥接 ready、滚动、原生保存对话框/取消和正常关闭。这是用户提供的独立热补丁
调查证据，不能代替本 PR 新的构建验收；不需要提供私人全日志或内存转储。

官方 v0.8.4 commit：`8835374fd276e840f206354b7c1637bb35d8ca6a21de6`。
ZIP SHA-256：`793c2bc5ce4c6d9de0399405424f90bf2a224fdecf7071f31c6d27eb5febae89`；
EXE SHA-256：`09c86d08cbfebb7c26f1cccfefeb9ee91a705d383c825bc4019e1c2b50d8ed64`。
main 仍有该缺陷，但锁定 pythonnet 3.2.0；官方 v0.8.4 为 3.1.0。pywebview 均为 6.2.1。

## 自动化分别证明什么

- `test_uploader_webview_bridge.py` 驱动真实生产 main 的窗口绑定和当前 pywebview 的反射
  代码，只替换 native backend / JS 执行环境；证明不会读取原生 getter、保留前端 API 和
  文件打开/日志保存取消语义。这是无 GUI 回归，不是 Windows 实机证据。
- **Uploader Windows startup** workflow 从源码构建完整 PyInstaller onedir ZIP，连续两次
  启动新的空 LOCALAPPDATA。外部 Win32 `WM_NULL` 测消息响应，UI Automation 检查前端
  导出日志按钮 enabled（该按钮受 14-method bridge-ready 合同控制），再实际打开原生
  保存对话框、取消并正常关闭。保存 JSON 结果和该测试用户目录的应用日志。
- artifact：`uploader-startup-windows-review`。它来自 PR commit，沿用 main 的桌面版本号，
  不是历史官方 ZIP，也不创建 tag、Release 或 R2 发布。

Windows CI 结果须以对应 run 的成功状态和 JSON 为准，测试实现本身不代表通过。
授权、解析、匹配、完整上传仍未验收。另一台机器的 `Loader.Initialize` 失败没有本次
挂起线程证据，继续独立调查；本修复不宣称解决它。安装器交付保留在独立 PR #72。
