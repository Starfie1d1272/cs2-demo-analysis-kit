# @cs2dak/core

## 3.0.0

### Major Changes

- 0166078: 删除已完成迁移的 playerStats 旧口径对照、assertPlayerStatsParity/findPlayerStatsParityMismatches 公开 API 与专用 openingParity 元数据；新分析不再输出旧 parity 诊断。canonical FK/FD 保持首个有效敌对击杀的成对 opening-duel 定义，新增复用单一 Core owner 私有快照的 supplied facts 校验（结构、身份、覆盖、守恒及 opening 配对，不维护第二套事件计算器），保留真实源 QA、playerStats 合同读取和 collateral 观察字段。历史 ZIP/Evidence 不改写，历史诊断仍可安全读取。analysisVersion 升为 1.0.4，semantic profile 保持 dak-stable/3。

### Minor Changes

- 770c4c4: 将单图 frozen Tournament economy/performance 数据投影收口到现有 Core，显示队名与昵称不再决定身份；Presentation 保留显示包装并直接消费同一投影。

  兼容性变化：手写 TournamentFacts 必须提供完整 stable team/player IDs；两个不同 ID 的同名队伍不再隐式合并。相同 ID 改名仍归并。未绑定本地 Demo 使用 match-scoped 观察身份；Studio 派生缓存需要本地回填。
- 0296acf: 公开 richKillDiagnostics 计数与能力原因，与现有 richKills 可用性共用唯一判断，保持空事件和部分能力语义不变。

### Patch Changes

- 126f3af: 保留可选输入的缺失、主动跳过、损坏及读取失败诊断；上传阵容和目标选择的降级路径保留脱敏原因，诊断不改变解析、匹配或证据统计。

  JSON 解析诊断仅保留异常类别、固定原因类别与安全数字位置，不保留原文摘录、token 字符或异常链。
- 31b461f: 公共包统一发布编译后的 ESM 与 declarations，保留既有 root/subpath API；React theme.css 继续公开并保留 CSS side effect。移除 tournament 发布产物中的测试文件，保持零 runtime dependency。真实 tgz 的逐包 Node ESM、strict NodeNext 与完整传递依赖 consumer gate 在 CI/publish 前执行；不修改分析算法、稳定身份或 UI。

  在 DAK build 中将精确的 cs2-demo-format@3.1.0 / @rivalhub/rival-rating@0.3.0 原版 registry 源码生成 ESM dependency 模块，仅重写 DAK 生成 JS 的依赖路径；保留模块身份、上游唯一语义 owner 与 MIT notices，声明引用相同精确版本。附源码哈希/原包 integrity/许可证 provenance，消除上游 source-only npm 入口造成的 Node 闭包阻塞，不修改原分析公式或 schema。
- a4c0760: 新增窄范围 Evidence QA 与 Tournament 适配入口，供共享 RivalHub 上传客户端使用。
- b1a9523: 共享 schema 升级到 Zod 4，保持原有稀疏指标字典与字段校验行为；使用新版稳定运行依赖，并验证分析、赛事与界面合同。
- Updated dependencies [eaca7aa]
- Updated dependencies [ec2fbb0]
- Updated dependencies [770c4c4]
- Updated dependencies [31b461f]
- Updated dependencies [b1a9523]
  - @cs2dak/maps@1.1.0
  - @cs2dak/contract@2.0.0
  - @cs2dak/tournament@1.1.2

## 2.0.2

### Patch Changes

- 3a3307b: 统一 `dak-stable/3` 的赛事 offensive kill credit 为 enemy-player kill，排除 teamkill 对 K、HS、trade、multi-kill、KAST 和 weapon buckets 的污染，并为已知的 v3 `playerStats` 语义差异保留逐字段 parity 警告。

## 2.0.1

### Patch Changes

- 532faf7: 收口 Core canonical player-round performance facts，并补齐冻结赛事事实的透明 Player / Team / Map performance analytics；所有 rate 保留 numerator/denominator，支持 overall/T/CT 与 identity-safe 跨图聚合。同步将 Core parity QA 纳入 Evidence 生成门禁，并失效旧 derived cache，避免旧语义继续进入确认数据链路。

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
