# 产品集成 / Product Integration

本仓库（DAK = cs2-demo-analysis-kit）是**产品中立的 Demo 分析与展示能力层**，被多个产品消费：
RivalHub、CS2 Insight Agent，以及未来本仓库内的统一 Demo 分析工具。

> 边界铁律：产品负责赛事业务、身份映射、权限、持久化与品牌 UI；
> DAK 负责可复用的单场分析、跨场聚合与产品中立的 presentation 模型。
> 产品**不得**重建评分/聚合/展示公式，只消费 DAK 合同。

---

## 1. 通用消费链路

```text
v2 ZIP（cs2-demo-format/2.0，由 python/src/cs2dak 导出）
  → @cs2dak/core   analyzeDemoPackage      单场事实 / QA / RR 信号 / AnalysisBundle
  → @cs2dak/cohort buildSeasonCohort        跨场聚合（身份归并由产品传入 identityMap）
  → @cs2dak/presentation                    match / leaderboard / player / team / series 视图模型
  → 产品路由、筛选、投票与品牌 UI
```

CLI 路径（无需在产品里复刻分析模型）：

```bash
cs2dak analyze match.zip --out analysis-output
# → analysis-bundle.json + view-model.json + qa-report.json
```

---

## 2. CS2 Insight Agent

下游消费方，原始 `.dem` 的来源，但**不再拥有解析端**——exporter 在本仓库 `python/src/cs2dak`。
生成 v2 ZIP 后调用 `cs2dak analyze`，用 `analysis-bundle.json` / `view-model.json` 驱动本地预览。

---

## 3. RivalHub

### RivalHub 负责
- ZIP 与赛事比赛/地图的匹配；Steam ID / alias → RivalHub 用户与队伍。
- 不可变导入记录、当前 analysis run、审计、人工修正的持久化。
- 赛季阶段、资格规则、名单、权限。
- 页面路由、品牌 UI、MVP 投票与最终结果。

### DAK 负责
- 校验并加载 `cs2-demo-format/2.0` 包。
- 派生确定性单场事实、QA、RR 输入与 AnalysisBundle。
- 按外部 identityMap 归并身份、聚合赛季 cohort。
- 构建产品中立的 match / leaderboard / player / team / series / MVP 推荐模型。
- 保持缺失值为 `null`、保留分析 provenance。

### 迁移规则
新页面消费 DAK 合同，不新增聚合 SQL、不重建 RR/PRISM 输入；每切换一页就删除对应的重复逻辑。
`demo_*` 明细表可保留用于审计与查询，但不再拥有评分/聚合/展示公式。

### 已提炼到 DAK 的共享能力（唯一 owner）

| RivalHub 原能力 | DAK owner |
|---|---|
| `economy-conversion.ts` | `@cs2dak/core` `buildEconomyConversion` |
| `halfside-winrate.ts` | `@cs2dak/core` `buildTeamSideWinRates` |
| `weapon-stats.ts` / 武器榜 SQL | `@cs2dak/core` weapon highlights + `@cs2dak/cohort` |
| `player-demo-stats.ts` | `@cs2dak/cohort` + `@cs2dak/presentation` |
| `to-rr-indicators.ts` | `@cs2dak/core` `deriveRRIndicators` |
| 赛季评分重算 | `@cs2dak/cohort` `buildSeasonCohort` |
| 队伍首杀/残局摘要 | `@cs2dak/presentation` `buildTeamCohortSummary` |
| 地图标定 | `@cs2dak/maps` |
| 展示标签（武器/经济/side） | `@cs2dak/presentation` |

### RivalHub 接入前仍需完成
1. 为 RivalHub 设计版本化 analysis run 与派生产物持久化。
2. 从导入链路调用 DAK，而不是从 `demo_*` 表重新实现分析。
3. 按单场 → 排行榜 → 选手 → 队伍 → 系列赛顺序切换页面数据源。
