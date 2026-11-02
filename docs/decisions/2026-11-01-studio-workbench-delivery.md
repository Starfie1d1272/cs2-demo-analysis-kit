# Decision: Studio 工作台交付与领域边界

Date: 2026-11-01

## Problem / Previous Assumption

旧产品计划以 Home、Coach 总页和全局上下文组织任务；旧 PR #6 又把 producer、证据、回放和存储迁移放在同一分支。包拆分后仍有 App 与公共包边界待收口。

## New Evidence / Options Considered

[总包 #133](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/133) 基于代码核定了 22 项；[PR #6 差量审计](../audits/2026-11-01-pr6-capability-reconciliation.md) 区分了已存在、替代和暂不做的能力。整体合并旧分支会覆盖后续重构；另造 SDK 或 producer 平台也不是完成用户任务的前提。

## Decision

- 产品固定为工作台、比赛、分析、战术与训练四入口，低频管理放页脚；同一人无需选择角色。页面帧各有 context，范围、焦点和来源往返由 Studio 持有。
- 这是产品重组与已拆包后的边界收尾，不是新 SDK。pipeline 编排单场计算，tactics 拥有姿态与空间算法，analytics 拥有跨场数学；Studio 拥有存储查询、I/O、页面组合和产品领域。可复用展示原语归 presentation/react，整页产品组合留 App。
- 保存分析是保存查询，重开时运行当前数据；结果导出才冻结当次结果、来源和局限。人工笔记、战术、安排与自动观察是不同领域，不建通用 Finding 仓库。用户资料与可重建 facts/cache 分开；历史资料只经明确、幂等的有限迁移处理。
- 不整体合并或批量 cherry-pick #6，保留原 head 与讨论；能力由审计中具体 issue 替代，暂不做的部分不宣称交付。关闭动作由统一收口处理。
- 阶段顺序以 [#133 第 5 节](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/133) 为唯一索引：基础边界与导航，查询和运行时，产品壳、证据与材料，再完成分析、讲解及三角色验收。每项只迁当前调用方并删除被替代的旧入口，不保永久 shim。

## Why / Reopen When

保持成熟能力可达、保护用户资料，并让每种事实、状态和算法有唯一 owner。新方案需以真实用户任务、性能或数据证据重新提出；桌面发布资格与长语料验证继续由 [#3](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/3) 跟踪。
