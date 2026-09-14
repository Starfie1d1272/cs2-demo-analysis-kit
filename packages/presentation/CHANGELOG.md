# @cs2dak/presentation

## 2.0.0

### Major Changes

- 3982a44: 将默认位置语义从 `DefaultAnchor` 统一迁移为 `DefaultPositionGroup`，更新地图查询、战术 facts、跨场聚类和展示标签的公共字段与 API；保留既有七图 callout 归并内容，不提供旧命名兼容 alias。

### Minor Changes

- 3356aec: 升级选手赛季画像到 `player-profile-0.2`，拆分 PRISM 行为倾向、效率、样本覆盖和可用性状态，并同步展示模型。
- 3030168: 新增声明与自动推断并存的地图角色画像和队伍职责矩阵 builder；headline 直接输出连续倾向分，位置重叠保持为中性 concentration 证据。
- 5ed968a: 以 callout 倾向和默认站位为唯二静态地图语义，新增时间化战术空间内核、开局模式与跨回合战术聚类接口，并删除旧静态 contested/advanced 角色判断。统一回放回合边界与四阶段比赛时钟，支持按调用方设置 1:55/1:35 初始定位。
- 8c75daa: 分离开局默认职责窗口与全回合移动事实，补充经济资格、有效轨迹 AWP、开局队形、可观测 Support、完整比赛覆盖、样本加权角色、逐侧职责、地图候选审阅和产品中立位置显示。

### Patch Changes

- b5b67ec: 保持 Tournament legacy View Model 与 public export 兼容，并将跨图 frozen-facts 聚合收敛到 `@cs2dak/tournament`。
- Updated dependencies [bda7474]
- Updated dependencies [3982a44]
- Updated dependencies [91b33c8]
- Updated dependencies [5a97456]
- Updated dependencies [3356aec]
- Updated dependencies [b0544b1]
- Updated dependencies [acb000b]
- Updated dependencies [316a5da]
- Updated dependencies [5ed968a]
- Updated dependencies [8c75daa]
  - @cs2dak/core@2.0.0
  - @cs2dak/maps@1.0.0
  - @cs2dak/cohort@2.0.0
  - @cs2dak/contract@1.1.0

## 1.0.0

### Major Changes

- d7ef15b: Establish strict module boundaries for the v2-only analysis pipeline.

  - Move view models, labels, and workspace composition into `@cs2dak/presentation`.
  - Add deterministic analysis and cohort provenance contracts.
  - Remove v1 normalization and obsolete React exports.
  - Keep leaderboard ordering outside cohort aggregation.

### Minor Changes

- 6bdce64: 提炼 RivalHub 可复用统计能力：新增队伍 T/CT 胜率、丰富逐武器击杀画像，并在选手与队伍展示模型中输出对应摘要。

### Patch Changes

- Updated dependencies [d7ef15b]
- Updated dependencies [6bdce64]
  - @cs2dak/contract@1.0.0
  - @cs2dak/core@1.0.0
