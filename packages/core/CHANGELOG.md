# @cs2dak/core

## 2.0.0

### Major Changes

- 3982a44: 将默认位置语义从 `DefaultAnchor` 统一迁移为 `DefaultPositionGroup`，更新地图查询、战术 facts、跨场聚类和展示标签的公共字段与 API；保留既有七图 callout 归并内容，不提供旧命名兼容 alias。

### Minor Changes

- bda7474: 新增 `extractMatchMapIntelligenceFacts` 与共享 tactical 的组合 facade：从 v3 `DemoPackage` 输出紧凑的逐回合位置、队形、delayed convergence 和 AWP 观测事实；缺失 replay、nav、callout 或 shots 时保留明确 availability 与 null/unknown 状态，原始 replay frame 与末帧保枪近似不进入公共 API。
- 5a97456: 新增 CT player-round 轮转事实合同与提取器，记录开局责任位、接触区域、稳定跨区离位、同 tick 竞争名次、留守覆盖和死亡截尾；保留有符号接触时差与 `null/false` 语义，不生成 Anchor/Rotator 角色标签。
- 5ed968a: 以 callout 倾向和默认站位为唯二静态地图语义，新增时间化战术空间内核、开局模式与跨回合战术聚类接口，并删除旧静态 contested/advanced 角色判断。统一回放回合边界与四阶段比赛时钟，支持按调用方设置 1:55/1:35 初始定位。
- 8c75daa: 分离开局默认职责窗口与全回合移动事实，补充经济资格、有效轨迹 AWP、开局队形、可观测 Support、完整比赛覆盖、样本加权角色、逐侧职责、地图候选审阅和产品中立位置显示。

### Patch Changes

- Updated dependencies [3982a44]
- Updated dependencies [91b33c8]
- Updated dependencies [5a97456]
- Updated dependencies [3356aec]
- Updated dependencies [b0544b1]
- Updated dependencies [acb000b]
- Updated dependencies [5ed968a]
- Updated dependencies [8c75daa]
  - @cs2dak/maps@1.0.0
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
