# 仓库健康巡检（2026-11-01）

基线：main `304399c47ba5d52af0f4be6effb72bf2b9a9b85b`。本次范围为仓库结构与主要执行入口、发布/CI、全部开放 Issue 的正文与评论、旧 PR #6。属于静态巡检及已有交付证据复核，未逐行审计全部代码，未执行生产上传或完整桌面人工验收。

## 已确认的发布问题

[run 41302651413](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/actions/runs/41302651413) 第一次执行在 11:39:29.169 UTC 报告七包成功，11:39:29.743 UTC 开始对账时仍不可见；同一提交第二次执行成功。旧对账每包只查询一次且把所有查询错误当作版本缺失。

[PR #131](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/131) 增加共享 10 分钟预算、10 秒间隔、15 秒单请求超时和分类错误处理。确认版本才允许补 tag。10 项定向 HTTP 测试通过；真实 registry 只读查询 maps@2.0.0、analytics@1.0.2 成功。修复没有触发新 npm 发布；下一次实际发布的延迟场景仍需观察。

## 仍应处理的问题

### P1：赛事上传 Worker 的内存策略与上限冲突

`infra/event-upload-worker/wrangler.toml` 配置单包 536870912 字节（512 MiB），`src/index.ts:91` 先 `request.arrayBuffer()` 整包读取，之后才校验实际长度，再整包计算 SHA-256。超过内存预算的请求可能在返回预期 413 或写入 R2 前失败；并发请求还共享 isolate 内存。

[Cloudflare 官方限制](https://developers.cloudflare.com/workers/platform/limits/)（2026-11-01 查阅，页面更新 2026-10-29）为每 isolate 128 MB。官方建议使用流处理大请求。建议独立修复为有字节上限的流式隔离上传与完整性核验，或先明确收紧产品上传上限。此处已由源码与平台限制确认设计冲突，未对线上 Worker 做大文件压测，也未核对实际部署是否覆盖了仓库默认配置。

### P2：本地发布入口与正式发布政策分叉

根 `package.json` 的 `release:npm` 最后执行裸 `changeset publish`，没有 `--no-git-tag`，也没有调用 registry reconciliation；`docs/release.md` 同时称它为 release path 验证命令并说明会真实发布。正式工作流已明确使用 OIDC 和确认后补 tag。本地入口容易绕开这次等待策略，也可能提前创建本地 tag。建议单独将验证命令与真实发布入口命名、语义统一。本次只修正式 workflow 对账。

### P2：旧 PR #6 冲突且包含仍未落地的能力

[PR #6](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/6) 当前 `CONFLICTING` / `DIRTY`，head `406094f7056fe793c9b6822e2a1d0b2eaf1fcb01`；7 月 31 日的旧 CI 不能证明它兼容当前 main。共同祖先到 PR head 为 166 个文件、14943 行新增、381 行删除，含大量 HUD SVG。

初步能力核对：

| 能力 | 当前 main | 后续动作 |
|---|---|---|
| facts revision、全场 facts 重建、SQLite/IDB 存储适配 | 已有，入口见 library.ts、App.tsx、storage/ | 保留当前实现，逐项对照语义 |
| Evidence 返回上下文 | 已有 evidence-continuation.ts，当前是导航上下文 | 继续核对跨比赛/重启恢复要求 |
| producer manifest、finding snapshot、replay model cache / evidence focus | 旧 PR 对应文件存在，main 缺少同名模块；当前修复入口仍为 rebuild-facts | 评估独立能力差量，不能仅凭文件缺失判定所有等价功能缺失 |
| HUD/回放增强 | 旧 PR 含较大资源及组件变更 | 按现行 presentation/react 边界重新审阅 |

应先完成 #3 的完整 capability matrix，再提取有用差量和处理旧 PR。此次未合并、关闭或改写 #6。

## 全部开放 Issues

巡检开始时共 8 个开放 Issue、1 个旧开放 PR；本次另创建修复 PR #131。

| Issue | 当前核对结果 | 剩余动作 |
|---|---|---|
| [#3](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/3) 导入/发布可靠性与回放 | 当前 main 已有基础能力，#6 仍冲突 | 完整 capability matrix、50+ 场真实 corpus、重启/回滚与回放任务验收 |
| [#17](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/17) Coach 战术体系 | Map Book / Protocol / Play / Match Sheet 为产品扩展，现有模式与备战材料不能替代 | 保留产品 backlog，独立设计人工知识的存储与交互 |
| [#47](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/47) maps 发布合同 | compiled artifacts 与正式 maps@2.0.0 已交付，map-assets 已按新决定拆出；旧“不拆包/仍 source-only”描述过时 | 更新剩余验收口径；原指定 Node 24 registry 专项仍需明确证据，勿把本地其他 Node 版本或 tgz 检查等同 |
| [#49](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/49) 远端成功/本地关联 | main 有 localLink 独立诊断和 retryRivalHubLocalLink，后续评论记录 #93 已修复 | 原始 54/59 → 59/59 真实样本资格验证仍缺，不能由源码修复推断历史根因 |
| [#54](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/54) sufficient facts 扩展 | 属于新增领域语义；当前未发现 savedByTeammate / killsInRoundWins 命名实现 | 独立定义事件语义及 additive facts，产品 percentile/评分留在消费端 |
| [#64](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/64) package umbrella | #128/#129/#130 已完成新边界、版本与发布；旧七包/资产未拆/未发布状态需更新 | 更广外部消费者 seam、Windows/macOS 独立消费与真实浏览器矩阵仍需单独认证 |
| [#75](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/75) Loader.Initialize | 诊断、运行库预检、日志导出已交付 | 故障机器脱敏 inner exception 与环境证据缺失，根因仍未确认 |
| [#76](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/76) Windows 安装器 | 安装器、下载接线、默认日志已有；最新桌面 Release 为 v0.8.8 | 人工中断/权限/占用/缺运行库，以及授权→解析→匹配→上传→网站确认链路验收 |

Issue 的旧正文与后续评论存在时间差，应更新状态而保留历史记录。本次没有修改线上 Issue 或发送评论。

## 覆盖面与证据边界

- 公共包：复核现有 13 包发布白名单、依赖边界、编译/声明与真实 tgz consumer 门禁；本次前序重构已有三 fixture 输出对照及 registry React/pipeline 消费记录。
- Studio：读取应用导航与导入/重建入口、存储合同、Evidence continuation、RivalHub 本地关联修复；未声称逐页 UI 已验收。
- Uploader/Python：核对启动诊断、凭据与 updater/installer 入口及开放验收事项；Windows runner 成功不能替代故障机器复现。
- infra/scripts：检查赛事上传 Worker、发布与对账脚本、六个 workflow 的职责及近期运行状态。发现上述 Worker 内存冲突和本地发布入口分叉。
- CI：基线 main 的 CI run 41302633766 和 npm 发布 run 41302651413 均成功。public-package-smoke 默认 Linux，UI browser bundle 检查只证明打包闭包；跨浏览器交互仍需要实际验收。
- 本次仅新增/执行发布恢复相关 10 项定向检查，未本地重跑全仓测试。修复 PR 的最终 CI 结果以 PR checks 为准。

未发现新的包架构阻断项；这条结论限于上述覆盖面。下一优先事项是 Worker 上传内存问题，其后是关闭旧状态与补齐真实资格验证。
