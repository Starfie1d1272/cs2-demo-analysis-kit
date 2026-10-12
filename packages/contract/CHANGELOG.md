# @cs2dak/contract

## 2.0.0

### Major Changes

- b1a9523: 共享 schema 升级到 Zod 4，保持原有稀疏指标字典与字段校验行为；使用新版稳定运行依赖，并验证分析、赛事与界面合同。

### Patch Changes

- 31b461f: 公共包统一发布编译后的 ESM 与 declarations，保留既有 root/subpath API；React theme.css 继续公开并保留 CSS side effect。移除 tournament 发布产物中的测试文件，保持零 runtime dependency。真实 tgz 的逐包 Node ESM、strict NodeNext 与完整传递依赖 consumer gate 在 CI/publish 前执行；不修改分析算法、稳定身份或 UI。

  在 DAK build 中将精确的 cs2-demo-format@3.1.0 / @rivalhub/rival-rating@0.3.0 原版 registry 源码生成 ESM dependency 模块，仅重写 DAK 生成 JS 的依赖路径；保留模块身份、上游唯一语义 owner 与 MIT notices，声明引用相同精确版本。附源码哈希/原包 integrity/许可证 provenance，消除上游 source-only npm 入口造成的 Node 闭包阻塞，不修改原分析公式或 schema。

## 1.1.0

### Minor Changes

- 91b33c8: 新增紧凑、可序列化的单场地图位置与队形事实合同，包含 replay/nav/callout/shots 的显式可用性状态，供公共 core 管道与产品消费者复用。
- 5a97456: 新增 CT player-round 轮转事实合同与提取器，记录开局责任位、接触区域、稳定跨区离位、同 tick 竞争名次、留守覆盖和死亡截尾；保留有符号接触时差与 `null/false` 语义，不生成 Anchor/Rotator 角色标签。
- 3356aec: 升级选手赛季画像到 `player-profile-0.2`，拆分 PRISM 行为倾向、效率、样本覆盖和可用性状态，并同步展示模型。
- b0544b1: 新增与正式职责并行的 T 方 Pack/Lurker 研究投影合同和冻结 15 特征聚合实现，模型输入保留冻结精度，同时保留 Flexible abstention、样本状态和外部验证限制。
- acb000b: 新增可移植的角色声明、观察性位置职责、独立 modifiers、武器职责与去重后的队伍地图矩阵合同；声明与自动推断保持独立。
- 5ed968a: 以 callout 倾向和默认站位为唯二静态地图语义，新增时间化战术空间内核、开局模式与跨回合战术聚类接口，并删除旧静态 contested/advanced 角色判断。统一回放回合边界与四阶段比赛时钟，支持按调用方设置 1:55/1:35 初始定位。
- 8c75daa: 分离开局默认职责窗口与全回合移动事实，补充经济资格、有效轨迹 AWP、开局队形、可观测 Support、完整比赛覆盖、样本加权角色、逐侧职责、地图候选审阅和产品中立位置显示。

## 1.0.0

### Major Changes

- d7ef15b: Establish strict module boundaries for the v2-only analysis pipeline.

  - Move view models, labels, and workspace composition into `@cs2dak/presentation`.
  - Add deterministic analysis and cohort provenance contracts.
  - Remove v1 normalization and obsolete React exports.
  - Keep leaderboard ordering outside cohort aggregation.

### Minor Changes

- 6bdce64: 提炼 RivalHub 可复用统计能力：新增队伍 T/CT 胜率、丰富逐武器击杀画像，并在选手与队伍展示模型中输出对应摘要。
