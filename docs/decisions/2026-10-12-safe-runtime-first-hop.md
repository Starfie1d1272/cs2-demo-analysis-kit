# 旧 runtime 首次安全升级

桌面仍按既有 Release workflow 发布完整 Studio runtime、Web Installer、Full ZIP、
macOS DMG 与独立 Uploader 制品，不缩成 frontend patch，不拆成仅 Uploader 发布。
所有版本、size、SHA-256、源码 provenance 和 GitHub/R2 渠道继续使用真实制品。

## 为什么不能添加 minimum 字段

真实 `v0.8.5` commit `6562abd058e4a4d5c2e606db4e859db55465a8df` 的 Python
`check_update` 只比较版本后原样返回 manifest。其 TS bridge 和 browser reader 仅按
`assets.web` → `assets.windows` 选择；UI 根据 asset 是否存在决定自动应用或手动
下载。旧版本不读兼容门槛，新增 minimum / disabled 字段无法禁止危险 relay。

## 两个入口与 native 能力

正式 CI 先生成 `latest-v2.json`，包含本次完整 runtime 真实元数据；同时生成旧
`latest.json`，使用同一真实版本和时间、明确的手动安装日志、真实 installer
元数据 `manualInstall`，其 `assets` 为空。旧入口没有自动应用资产，因此原版
Modal/Control 显示手动下载，去既有 Release 页面获取安装器。不是伪造空 hash、
无效 ZIP 或版本降级；完整二进制仍可正常分发。

新 native 与前端优先读取 `latest-v2.json`，保留 R2 → GitHub → ghproxy 顺序。
runtime 自动下载和应用额外要求真实 native 方法 `update_apply_runtime_safe`；
新前端在旧 Python runtime / web overlay 下不能回退到旧 `update_apply`。
新 native 保留旧方法供已安全安装后的旧前端兼容，两者执行同一新 checked relay。
Beta manifest 不切换入口，但新版前端同样不允许旧 native 进行 runtime 自动替换。

这会让旧 runtime 的首次升级改用安全安装器；升级后的正常自动更新继续可用。
旧下载消费者若需要 runtime 元数据，应迁移到 v2 或既有 install-manifest，而不是
假定 legacy manifest 永远含 `assets.windows`。

## 手动安装和恢复

旧版指引先关闭 Studio，运行本版 installer 并选择原目录。新版安装路径忽略
runtime 包内 userdata/assets/cache/updates，不覆盖已有 SQLite 和 ZIP；旧嵌套
runtime 根含持久目录时在任何删除/覆盖前阻止安装，并给出保留、备份与恢复步骤。
不自动合并数据库、不要求用户删除旧资料。具体保护来自前置安全 PR #101。

## 证据与门槛

`scripts/test-fixtures/legacy-*.txt` 是真实 tag 中 TS 两文件原文，SHA-256 在测试中
固定验证。`python/tests/legacy_update_v0_8_5.txt` 是同 tag 原样提取的版本函数、
manifest 常量及 check_update 方法（仅去类缩进），同样固定 hash。测试实际执行
这些原 reader，读取真实生成的双 manifest，断言旧入口没有自动资产且原始
合成 DB/ZIP 不变；再验证新版前端面对旧 native 会在下载前拒绝，安全 native
可下载和调用新方法。Windows CI 也执行此 gate 和真实目录锁迁移测试。

CI 对两个 manifest 版本、legacy 无应用资产、runtime 与 installer 的真实 R2
size/hash 均核对。新 endpoint 或原文 fixtures 未发布前不能以本地通过冒称生产已
切换；最终隔离 review、候选 main CI 和正式 tag 确认仍是发布前置门槛。
