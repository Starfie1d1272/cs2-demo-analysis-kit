# @cs2dak/react

## 1.1.2

### Patch Changes

- Updated dependencies [3a3307b]
  - @cs2dak/presentation@2.1.1

## 1.1.1

### Patch Changes

- Updated dependencies [532faf7]
  - @cs2dak/presentation@2.1.0

## 1.1.0

### Minor Changes

- c037715: 新增 `PlayerMapRoleProfilePanel` 与 `TeamMapRoleMatrixPanel` 纯展示组件，复用 DataTable、MetricInfo、EvidenceLink 与 EmptyState 展示倾向分、观察性职责与位置 concentration。
- 5ed968a: 以 callout 倾向和默认站位为唯二静态地图语义，新增时间化战术空间内核、开局模式与跨回合战术聚类接口，并删除旧静态 contested/advanced 角色判断。统一回放回合边界与四阶段比赛时钟，支持按调用方设置 1:55/1:35 初始定位。
- 8c75daa: 分离开局默认职责窗口与全回合移动事实，补充经济资格、有效轨迹 AWP、开局队形、可观测 Support、完整比赛覆盖、样本加权角色、逐侧职责、地图候选审阅和产品中立位置显示。

### Patch Changes

- Updated dependencies [3982a44]
- Updated dependencies [91b33c8]
- Updated dependencies [5a97456]
- Updated dependencies [3356aec]
- Updated dependencies [b0544b1]
- Updated dependencies [acb000b]
- Updated dependencies [3030168]
- Updated dependencies [5ed968a]
- Updated dependencies [b5b67ec]
- Updated dependencies [8c75daa]
  - @cs2dak/maps@1.0.0
  - @cs2dak/presentation@2.0.0
  - @cs2dak/contract@1.1.0

## 1.0.0

### Major Changes

- d7ef15b: Establish strict module boundaries for the v2-only analysis pipeline.

  - Move view models, labels, and workspace composition into `@cs2dak/presentation`.
  - Add deterministic analysis and cohort provenance contracts.
  - Remove v1 normalization and obsolete React exports.
  - Keep leaderboard ordering outside cohort aggregation.

### Patch Changes

- Updated dependencies [d7ef15b]
- Updated dependencies [6bdce64]
  - @cs2dak/contract@1.0.0
  - @cs2dak/presentation@1.0.0
