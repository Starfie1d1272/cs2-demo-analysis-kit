# @cs2dak/presentation

## 4.0.0

### Major Changes

- 4e34b0f: 按基础事实、评分、跨场画像、地图算法与资产、战术、展示和执行编排重划公共边界；删除迁出的旧入口。

  - contract 只保留原始输入与基础事实合同；展示合同归 presentation，评分合同归 rating，跨场合同归 cohort，战术合同归 tactics，组合 AnalysisBundle 归 analytics。
  - core 保留 canonical facts/QA/frozen Tournament projection。ZIP loader 与诊断改从新包 demo-io 导入；空间、交战和聚类改从新包 tactics 导入；analyzeDemoPackage 改从 pipeline 导入。
  - 新包 rating 消费已提取信号并接线原版 RR/PRISM。analytics 派生信号；cohort 保留 buildSeasonCohortFromRows，原始 Demo 的 buildSeasonCohort 改从 pipeline 导入。
  - maps 只发布算法。getMapZones/getMapRoutes/getMapNav 与 callout-grid-node/callout-grid-browser/tri-assets 入口迁至新包 map-assets；buildRadarFieldGrid 接收 CompactNav 输入。
  - format 与原版 rival-rating 是精确 build-only 依赖；发布原源编译的 JS 和完整声明，保留源哈希、声明哈希、许可证与 provenance，消费者不安装上游源码包。
  - presentation 的领域计算移 analytics；删除 tournament-compat 和 buildMatchWorkspaceModel，原始 Demo 工作台入口为 pipeline.analyzeMatchWorkspace，已有结果入口为 analytics.buildMatchWorkspaceFromAnalysis。
  - React 提供 scoreboard/table/replay 子入口。独立回放只接 WorkspaceReplay/MapView；记分板使用窄 ScoreboardTableRow，rr/accountRR 可为 null。
  - workspace-0.2 必填 buyQuality、players.roundSummary、reportHighlights；地图图片 URL 由宿主通过 DemoViewOptions 注入，默认 null。
  - UI、基础事实与 cohort 的安装/声明闭包分别隔离分析执行、评分/地图以及 Demo/地图输入。

### Patch Changes

- b681fcf: 从击杀事件重派生六秒同队补枪，隔离旧 ZIP 的错误标记，统一回合统计、KAST、武器统计、空间豁免与回放展示；Core analysisVersion 升至 1.0.5，已有 ZIP 可直接重建事实。
- Updated dependencies [4e34b0f]
  - @cs2dak/maps@2.0.0

## 3.0.0

### Major Changes

- 770c4c4: 将单图 frozen Tournament economy/performance 数据投影收口到现有 Core，显示队名与昵称不再决定身份；Presentation 保留显示包装并直接消费同一投影。

  兼容性变化：手写 TournamentFacts 必须提供完整 stable team/player IDs；两个不同 ID 的同名队伍不再隐式合并。相同 ID 改名仍归并。未绑定本地 Demo 使用 match-scoped 观察身份；Studio 派生缓存需要本地回填。

### Patch Changes

- 31b461f: 公共包统一发布编译后的 ESM 与 declarations，保留既有 root/subpath API；React theme.css 继续公开并保留 CSS side effect。移除 tournament 发布产物中的测试文件，保持零 runtime dependency。真实 tgz 的逐包 Node ESM、strict NodeNext 与完整传递依赖 consumer gate 在 CI/publish 前执行；不修改分析算法、稳定身份或 UI。

  在 DAK build 中将精确的 cs2-demo-format@3.1.0 / @rivalhub/rival-rating@0.3.0 原版 registry 源码生成 ESM dependency 模块，仅重写 DAK 生成 JS 的依赖路径；保留模块身份、上游唯一语义 owner 与 MIT notices，声明引用相同精确版本。附源码哈希/原包 integrity/许可证 provenance，消除上游 source-only npm 入口造成的 Node 闭包阻塞，不修改原分析公式或 schema。
- a4c0760: 新增窄范围 Evidence QA 与 Tournament 适配入口，供共享 RivalHub 上传客户端使用。
- Updated dependencies [770c4c4]
- Updated dependencies [eaca7aa]
- Updated dependencies [ec2fbb0]
- Updated dependencies [770c4c4]
- Updated dependencies [126f3af]
- Updated dependencies [31b461f]
- Updated dependencies [0296acf]
- Updated dependencies [0166078]
- Updated dependencies [a4c0760]
- Updated dependencies [b1a9523]
  - @cs2dak/core@3.0.0
  - @cs2dak/maps@1.1.0
  - @cs2dak/contract@2.0.0
  - @cs2dak/cohort@2.0.3
  - @cs2dak/tournament@1.1.2

## 2.1.1

### Patch Changes

- 3a3307b: 统一 `dak-stable/3` 的赛事 offensive kill credit 为 enemy-player kill，排除 teamkill 对 K、HS、trade、multi-kill、KAST 和 weapon buckets 的污染，并为已知的 v3 `playerStats` 语义差异保留逐字段 parity 警告。
- Updated dependencies [3a3307b]
- Updated dependencies [9da18a7]
  - @cs2dak/core@2.0.2
  - @cs2dak/tournament@1.1.1
  - @cs2dak/cohort@2.0.2

## 2.1.0

### Minor Changes

- 532faf7: 收口 Core canonical player-round performance facts，并补齐冻结赛事事实的透明 Player / Team / Map performance analytics；所有 rate 保留 numerator/denominator，支持 overall/T/CT 与 identity-safe 跨图聚合。同步将 Core parity QA 纳入 Evidence 生成门禁，并失效旧 derived cache，避免旧语义继续进入确认数据链路。

### Patch Changes

- Updated dependencies [532faf7]
  - @cs2dak/core@2.0.1
  - @cs2dak/tournament@1.1.0
  - @cs2dak/cohort@2.0.1

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
