# DAK 桌面 RC 准备（只读核对，2026-11-02）

基线 `a7bcde0af3a8253b8ca244bdcbb2d9c3a0f6b0c8`；此记录不发布、打 tag、改版本或上传 npm。最终候选需要先合流修复、审核完整差异、对最终 SHA 跑 CI，并完成 [W19 新一轮反例](2026-11-studio-workbench-acceptance.md#新一轮漏审反例矩阵2026-11-02基线-a7bcde0)。

- 目前根/private Studio 桌面版本为 `0.8.8`，最新 GitHub Release `v0.8.8` 指向 `3f99f4f148307331844bc02f07b7f41078d461d7`，非 prerelease，已包含 `dak-studio-0.8.8.dmg` 和独立 uploader DMG。它不是本轮新代码。上次成功 Release run [41134149432](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/actions/runs/41134149432) 是手动重试；不能据此证明本轮包。
- 现有 `release.yml` 只接受 `vX.Y.Z`，`sync-version.mjs` 只接受数字 `X.Y.Z`；`v0.8.9-rc.1` 不符合校验。普通 `v0.8.9` 发布会创建正式 GitHub Release，并更新 R2 的正式 latest/安装和 uploader manifest，不能把它当隔离 RC 静默执行。下一数字版可考虑 `0.8.9`，但最终版本与 changelog 需在修复合流后核对已有 tag 再定。
- Windows Beta Update 仅产 Windows 更新包，不构建 Mac DMG。当前已有 Mac 路径为 macOS runner 的 Release 构建，或在 macOS 执行 `scripts/package.sh` 的带源码 SHA/dirty 标识的本地构建；前者会发布正式渠道，后者需要可用 Mac 环境及后续安全交付产物。要同时满足“新 RC、Mac 可安装、不触碰正式渠道”，需要先审查并实现隔离的候选产物工作流/交付方式；目前仓库现有自动流程不能直接满足全部条件。
- Release workflow 声明桌面包 unsigned；Mac Gatekeeper 与实际架构、安装、启动、权限、更新和用户资料保留需在目标 Mac 实验，不能由 Linux CI 冒充。`.tri` 使用已有 R2 manifest、客户端按需下载；离线/资源不可用时相关能力降级，发行构建还需能获取非空 manifest。Release 同时构建 uploader 与 Windows 产物；不要只看到 Studio DMG 就认定整套发布完成。
- npm 是独立 Changesets/OIDC 版本流，与桌面 RC 不同步；是否发布新 API 由父线程在完整包审后决定。本任务未触发 npm、Release、Beta、tag、部署或版本同步。
