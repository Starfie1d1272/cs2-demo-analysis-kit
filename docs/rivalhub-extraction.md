# RivalHub 共享能力提炼状态

本文记录 RivalHub Demo 体系中可复用能力迁入 DAK 后的唯一 owner。产品查询、身份和页面逻辑不在此迁移。

## 已由 DAK 覆盖

| RivalHub 原能力 | DAK owner | 处理 |
|---|---|---|
| `economy-conversion.ts` | `@cs2dak/core` `buildEconomyConversion` | 已由标准 `EconomyPoint[]` 直接派生 |
| `halfside-winrate.ts` | `@cs2dak/core` `buildTeamSideWinRates` | 已改为直接消费标准 `DemoPackage.rounds` |
| `weapon-stats.ts`、武器榜 SQL | `@cs2dak/core` weapon highlights + `@cs2dak/cohort` | 保留 counts，跨场求和后在 presentation 重算比例 |
| `player-demo-stats.ts` | `@cs2dak/cohort` + `@cs2dak/presentation` | 使用真实回合数，缺失保持 null |
| `to-rr-indicators.ts` | `@cs2dak/core` `deriveRRIndicators` | 不再允许产品重建评分输入 |
| 赛季评分重算 | `@cs2dak/cohort` `buildSeasonCohort` | 身份映射由产品传入 |
| 队伍首杀与残局摘要 | `@cs2dak/presentation` `buildTeamCohortSummary` | 从累计 counts 重算比率 |
| 地图标定 | `@cs2dak/maps` | RivalHub 不维护第二份标定 |
| 展示标签 | `@cs2dak/presentation` | 武器、经济、side 标签统一 |

## 明确保留在 RivalHub

- ZIP 与比赛、地图记录的匹配。
- Steam alias、用户和队伍身份映射。
- 数据库存储、导入审计、覆盖确认和人工修正。
- 赛季阶段、位置、资格门槛和权限筛选。
- 页面路由、品牌 UI、MVP 投票与最终结果。

## 当前结论

RivalHub 中现有、产品无关且可直接复用的纯统计逻辑已经完成第一轮提炼。后续发现新的共享指标时，
仍应先在 DAK 中明确唯一 owner、公共输入和输出，再由 RivalHub 接入。

## RivalHub 接入前仍需完成

1. 为 RivalHub 设计版本化 analysis run 与派生产物持久化。
2. 从导入链路调用 DAK，而不是从 `demo_*` 表重新实现分析。
3. 按单场、排行榜、选手、队伍、系列赛顺序切换页面数据源。
