# RivalHub Integration / RivalHub 集成

RivalHub owns tournament business, identity mapping, permissions, persistence, and branded UI.
DAK owns reusable demo analysis, cross-match aggregation, and product-neutral presentation models.

## Recommended Pipeline

```text
RivalHub receives v2 ZIP
  -> validate and match ZIP to RivalHub match/map
  -> persist immutable import record and identity map
  -> @cs2dak/core analyzeDemoPackage
  -> @cs2dak/presentation buildMatchWorkspaceModel
  -> persist versioned analysis run and selected query projections
  -> @cs2dak/cohort buildSeasonCohort
  -> @cs2dak/presentation leaderboard/player/team/series models
  -> RivalHub routes, filters, voting, and branded UI
```

RivalHub may retain normalized `demo_*` rows for audit, filtering, and detailed queries. Those rows
are persistence projections, not owners of rating, aggregation, or presentation formulas.

## RivalHub Responsibilities

- Match a ZIP to a tournament match and map.
- Resolve Steam IDs and aliases to RivalHub users and teams.
- Store immutable imports, current analysis run, audit records, and manual corrections.
- Select season stages, qualification rules, rosters, and permissions.
- Render product pages and own MVP voting or final awards.

## DAK Responsibilities

- Validate and load the canonical `cs2-demo-format/2.0` package.
- Derive deterministic single-match facts, QA, RR inputs, and analysis bundles.
- Merge identities and aggregate season cohorts from externally selected demos.
- Build product-neutral match, leaderboard, player, team, series, and MVP recommendation models.
- Preserve missing values and analysis provenance.

## Migration Rule

New RivalHub pages should consume DAK contracts instead of adding aggregation SQL or rebuilding
RR/PRISM inputs. Existing duplicate logic should be removed after each page is switched. See
[RivalHub shared capability extraction](rivalhub-extraction.md) for the current ownership map.

---

RivalHub 负责赛事业务、身份映射、权限、持久化和品牌 UI；DAK 负责可复用 Demo 分析、
跨场聚合与产品中立展示模型。

推荐从导入链路建立版本化 analysis run，再按单场、排行榜、选手、队伍、系列赛顺序接入
DAK 模型。`demo_*` 明细表可以保留用于审计和查询，但不得继续拥有评分、聚合或展示公式。
