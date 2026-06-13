# 稳定性等级 / Stability Tiers

> 目的：让用户知道每个指标/模块「可信到什么程度」，并让我们在调整算法时不会让用户
> 误以为历史结果仍然完全可比。每次口径变更必须同步更新本表与 `analysisVersion`。

## 三个等级

| 等级 | 含义 | 对用户的承诺 |
|---|---|---|
| **Stable** | 口径已冻结，有 fixture 或验证集背书 | 可放心据此做结论；口径变更会走 major 提示 |
| **Beta** | 可用，逻辑成熟，但口径可能随验证集结果微调 | 可用于分析，留意版本说明里的口径调整 |
| **Experimental** | 仅供探索，样本/口径都可能大改 | 不要据此下定论；随时可能重写 |

UI 约定：Beta 指标在标题旁标 `Beta`，Experimental 标 `实验`；两者的 ⓘ 口径说明里
必须写明「样本数 / 数据完整性 / 是否依赖 `.tri` / 口径版本」。缺失值一律显示 `—`，不补 0。

## 模块与指标分级（0.5.0 基线）

### Stable

- **基础事实**：击杀、助攻、trade、HS、首杀/首死、残局 1vN（来自 v3 事件，确定性派生）。
- **ADR / KAST / K-D**：fixture 校验，口径冻结。
- **经济矩阵 / 手枪转化 / eco-semi 翻盘 / Buy Quality**：`@cs2dak/core` 经济模块，fixture 覆盖。
- **RR v1 单场数据线**：frozen pro baseline（`1.0 = 职业基线`），单场口径稳定。
- **2D 回放与 EvidenceLink**：回放帧、锚点、统计跳转——基础设施级。
- **QA 报告**：damage/freeze 伪影规则已冻结（见 `studio-redesign.md` §1）。

### Beta

- **对枪三分类**（`contested_duel` / `suppressed_kill` / `caught_off_guard`）：口径已冻结
  （`studio-redesign.md` §4），但**晋升 Stable 的闸门是人工验证集**（见下）。
- **枪法机制**：首发命中 / 扫射 / 急停 / TTK / one tap / 开枪节奏——clean gunfight gate 已定，
  样本门槛严格，但跨地图/跨段位的稳健性仍需验证集背书。
- **反应时间 / 预瞄**：依赖 `.tri` BVH 静态 LOS；有 `.tri` 走精确口径，无 `.tri` 退化为窗口
  起点（UI 须如实标注）。退化口径与精确口径的差异尚未系统量化。
- **Flash Value / 负收益队闪**：净致盲价值口径稳定，转化击杀归因仍偏保守。
- **Lineup Library**：跨场聚类 + callout 提取可用；effect position 的 zone 归属仅部分地图
  完整，几何降维仍在改进。
- **跨场 RR / PRISM（cohort）**：依赖外部 identityMap 质量；身份归并错误会污染聚合。
- **队伍对比**：消费 cohort，随上游 Beta 指标浮动。

### Experimental

- **Pattern Finder（8a）**：当前只回答「开局 15/20/30s 站位」，无中期动线，教练视角不可用。
  0.6 完整战术路线重写前视为占位骨架。
- **Anti-strat 报告文本**：首版 Markdown，结论强度受 Pattern Finder 限制。
- **BP / Veto 建议表**：ban/pick 纯统计建议未实现；现有仅录入/展示。

### 不做（已决策，非分级）

- 回放实时经济/致盲面板（无产品价值）。
- 回合 swing / 动量曲线（缺校准样本，待资料库规模上来再立项）。
- A/B/C 固定联赛基线 percentile（本地工作台无稳定样本池）。

## 晋升闸门

| 指标 | 当前 | 晋升条件 |
|---|---|---|
| 对枪三分类 | Beta | 100–300 片段人工验证集，记录 precision/recall 与主要误判类型，留回归测试 |
| 枪法机制 | Beta | 同上验证集 + 跨地图稳健性抽查 |
| 反应/预瞄 | Beta | `.tri` 精确 vs 退化口径差异量化 |
| Lineup zone 归属 | Beta | 全地图 zone 多边形标定完成 |
| Pattern Finder | Experimental | 0.6 完整战术路线落地（`studio-redesign.md` §8） |

> 对枪验证集是 0.5/0.6 的关键工程债：没有它，对枪实验室再复杂，用户也无从判断可靠性。
