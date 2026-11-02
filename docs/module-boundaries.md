# DAK 模块边界

本文定义 DAK 的目标模块职责。重构、删除旧 API 和新增功能时，以本文为边界依据。

## 总体数据流

```text
.dem → cs2df → v3 ZIP → demo-io → DemoPackage → core canonical facts
                                            → tactics 空间 / 交战分析
core / tactics 结果 → analytics 信号与洞察 → rating 公式 → cohort 行聚合
pipeline 编排上述单场 / 跨场执行链
已有 UI 数据 → presentation 展示合同 / helper → react
冻结 Tournament facts → tournament → 产品结果
```

代码依赖方向是 `pipeline → analytics → presentation` 与 `react → presentation`。
展示消费者直接传已有模型；presentation/React 的传递依赖不得进入分析执行链。

## 模块职责

| 模块                     | 负责                                                            | 不负责                                      | 主要输出                    |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------- | --------------------------- |
| `cs2-demo-format`        | 定义 v3 DemoPackage 数据合同，解析并校验 v3 ZIP                  | 原始 `.dem` 解析、分析、评分、展示          | Schema、类型、ZIP parser、validator |
| `cs2df`                  | 将原始 `.dem` 确定性导出为合法 v3 DemoPackage                   | RR/PRISM、产品展示、业务持久化              | v3 ZIP、导出报告            |
| Python CLI / GUI         | 提供 cs2df 的本地 GUI / DAK Studio 桥 / 打包壳                  | 维护独立 parser/exporter、分析或展示实现    | GUI、Studio bridge、桌面应用 |
| `@cs2dak/contract`       | 定义原始输入与基础事实合同；从原版上游编译格式 schema/声明                 | 复制 `cs2-demo-format` schema、纯展示合同、实现分析逻辑 | Zod schema、TypeScript 类型 |
| `@cs2dak/demo-io` | ZIP 加载、流选择与输入诊断 | 事件归因、评分、UI | DemoPackage |
| `@cs2dak/rating` | RR/PRISM DTO 与原版公式接线 | Demo 解析、事实提取、空间分析 | 评分结果 |
| `@cs2dak/map-assets` | 地图数据与显式 Node/browser loader | 空间推导、评分、UI | nav/zone/route/grid/tri 输入 |
| `@cs2dak/tactics` | 空间与交战分析、地图职责、回合特征、战术聚类 | 评分公式、产品持久化 | 战术与机制结果 |
| `@cs2dak/core`           | 单场标准化、canonical performance/frozen Tournament facts、QA 和基础统计 | ZIP 加载、评分、地图/战术、跨场聚合、页面模型 | canonical facts            |
| `@cs2dak/cohort`         | 已有行的跨场身份归并、RR/PRISM 聚合与结果整形              | 单场解析、数据库、产品 UI                   | `SeasonCohortBundle`              |
| `@rivalhub/rival-rating` | RR、PRISM 及相关评分公式                                        | Demo 信号提取、持久化、展示                 | 评分结果                    |
| `@cs2dak/maps`           | 资产无关的地图标定、坐标变换、几何和查询算法 | 评分公式、产品 UI、战术结论、静态完整战术库 | 地图与空间能力              |
| `@cs2dak/tournament`     | frozen Tournament sufficient-fact DTO、identity-safe 跨图 merge、透明 performance aggregation、rate 与结构/引用/聚合安全校验 | Demo 解析/detection、Core semantic QA、RivalHub scope、数据库、React、评分公式 | `TournamentAnalytics`、`TournamentPerformanceAnalytics` |
| `@cs2dak/analytics` | 评分信号派生、经济/机制/队伍等领域洞察、已有结果投影与 Tournament adapter | 重写 Core 事件归因、文件/网络/数据库、React | 洞察、统计、View Models |
| `@cs2dak/pipeline` | 原始 DemoPackage → Core/tactics/analytics/rating/cohort 的单场与跨场执行编排 | 文件加载、持久化、权限、领域算法 | `MatchWorkspaceModel` |
| `@cs2dak/presentation` | 展示 schema、窄 View DTO、标签、格式、报告排版与纯结果投影 | 解析、事件检测、评分、经济统计、数据库、分析执行 | 产品中立 View Models |
| `@cs2dak/react`          | 渲染 presentation View Model 与 maps/calibration 坐标/level 投影                          | 数据库查询、分析、评分、产品业务规则        | React 组件与样式            |
| `@cs2dak/rivalhub-upload` | RivalHub 配对与 HTTP client、目标匹配、Evidence V1 producer；唯一共享上传语义 owner | 本地文件、UI、数据库、Library 持久化 | `rivalhub-demo-evidence/1` |
| Node CLI                 | 将 TypeScript 包接入本地文件系统和自动化流程                    | 复制核心分析逻辑                            | 命令行输出与文件产物        |
| DAK Studio（`apps/dak-studio`） | 本地 Demo 管理、导入、检索、比较和个人档案               | RivalHub 赛事业务、共享分析公式             | 独立本地产品                |
| RivalHub Demo Uploader（`apps/rivalhub-uploader`） | 原生多选 `.dem`、逐场上传编排、连接与错误指导 | 本地 Library、replay、赛事管理、Evidence 语义 | 上传桌面应用 |
| RivalHub                 | 赛事、赛季、身份、权限、持久化和公开展示                        | 复制 DAK 分析与评分逻辑                     | 赛事产品                    |
| CS2 Insight Agent        | 高光录制软件，复用本仓库 demo 展示模块                          | 复制 Demo 解析与评分逻辑                    | 产品                        |

DAK Studio 拥有本地 I/O、存储查询、页面组合与产品领域状态和用户资料；共享事实、算法与可复用展示原语仍归各公共包。纯函数或纯展示本身不决定公共 API。

## 工作台交付边界（2026-11）

本轮是产品重组与已拆包后的边界收尾，不再造 SDK；[决策](decisions/2026-11-01-studio-workbench-delivery.md) 和 [#133](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/133) 是目标与实施顺序，未完成事项不是现状。

- W20 已合 [#157](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/157)：单场 facts 编排归 pipeline、投掷姿态归 tactics；App 封装本地存储与身份键。
- W03 已合 [#159](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/159)：通用受控控件在 react，Studio 整页和状态在 App；公共破坏按 major 迁移，不留 shim。
- W21 [#154](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/154) 将跨场数学归 analytics、空间聚合归 tactics，本地范围/存储查询和缓存归 App queries，删除旧 facade。W22 [#155](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/155) 分清组合根、metadata 与 I/O hooks。
- W07 [#139](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/139)、W09 [#144](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/144)、W12 [#142](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/142) 分别收口范围/context、观察及材料 owner，按任务删除旧 Home/Coach 总页与双写；有限迁移保护用户资料，facts/cache 可重建但不能连带删除资料。

下表保留历史功能归属，不代表旧页面结构是目标导航。

## DAK Studio 八模块归属

| Studio 模块 | 唯一职责 | 共享逻辑 owner |
|---|---|---|
| 资料库 | 本地 ZIP/.dem 导入、标签、重导、检索 | Studio 本地适配；ZIP 加载属 demo-io，格式 schema 属 contract |
| 比赛工作台 | 单场回合、回放、地图、经济与 RR 解释入口 | `@cs2dak/pipeline` / `@cs2dak/analytics` 生成模型；`@cs2dak/react` 渲染通用控件；Studio 组合整页与状态 |
| 个人实验室 | 选手档案、趋势、武器分布、证据跳转 | `@cs2dak/cohort` + `@cs2dak/analytics` |
| 对枪实验室 | duels/mechanics 信号聚合、三分类对枪、TTK、机制画像（含 .tri LOS 反应时间/预瞄） | `@cs2dak/tactics` + `@cs2dak/analytics` |
| 道具实验室 | 跨场 Flash Value、负收益队闪、道具证据 | `@cs2dak/analytics` |
| 经济与节奏 | 经济矩阵、手枪转化、eco/semi 翻盘 | `@cs2dak/tournament`（单图事实由 Core canonical adapter 生成） |
| 赛事中台 | 跨队横向对比、地图盘面、武器榜、报表 | `@cs2dak/cohort` + `@cs2dak/analytics` + `@cs2dak/tournament` |
| 教练工作台 | pattern/playbook/anti-strat 的本地查询与编排 | `@cs2dak/maps` 算法 + `@cs2dak/map-assets` 数据 + `@cs2dak/tactics` 特征与聚类 + `@cs2dak/analytics` 展示投影 |

RR 口径统一使用 `@rivalhub/rival-rating` 的 frozen pro baseline：单场和跨场聚合都以
`1.0 = 职业基线` 为同一标准；cohort 层只做身份归并、信号汇总和展示模型整形。
PRISM 风格、强弱项等“相对当前范围”的判断可以继续使用 cohort 百分位，但不得改变 RR 标尺。

## 强制规则

1. 每项共享逻辑只能有一个 owner；消费者不得复制实现。
2. 产品和 UI 可以依赖共享模块；共享模块不得反向依赖产品或 UI。
3. v3 ZIP 是 Python / cs2df 与 TypeScript 分析层之间的唯一接口。
4. `cs2-demo-format` 是 DemoPackage 合同的唯一真相源。
5. `@rivalhub/rival-rating` 是评分公式的唯一真相源。
6. 缺失数据保持 `null`；不得为了展示、聚合或兼容伪造为 `0`。
7. Apps 和 CLI 只能负责适配与编排，不能成为共享逻辑 owner。
8. View Model 不包含数据库、权限或产品路由语义。
9. 当前任务确需调整边界时，允许重构和删除旧 API；先检查调用方并完成必要迁移，不为错误职责边界长期维护兼容层。不把该许可视为清理所有旧 API 或发布不兼容版本的授权。
10. 跨模块行为必须由公开合同和 fixture 验证，不依赖内部文件结构。
11. `@cs2dak/tournament` 自己拥有窄 public DTO；不得把 `@cs2dak/contract` 的 DemoFormat、Zod 或 RR 依赖拖入其 runtime。1.1 performance surface 只消费已冻结的 player-round/objective/weapon sufficient facts，不重新 detection。Tournament 的 fail-fast 只保护 shape/count、entity/reference、duplicate 与 denominator/cross-row aggregation safety；不得从一个 frozen semantic 字段重新推导或否定另一个字段（例如用 `deaths` 推导 `survived`，或用 `teamWonRound` / `survived` 裁决 `clutch.won`）。这类 semantic QA 只属于 Core / Evidence producer。
12. `@cs2dak/cohort` 保留 RR/PRISM 所需的 `RRIndicators` 信号投影；它不替代 `@cs2dak/tournament` 的透明 performance owner。Analytics 负责证据/视图模型的输出整形，但不得重新实现 Core 的事件归因。
13. `@cs2dak/core` 的 `buildPlayerRoundPerformanceFacts` 是 Assist、Damage、Opening、Trade、KAST、Clutch、Utility、Objective、Weapon 和 man-state 的唯一 analytical owner。`playerStats` 不再作为旧 aggregate 对照或事实 fallback；仅保留合同读取及尚未替代的 collateral 观察字段。`assertPlayerRoundPerformanceFacts` 复用同一 owner 的私有结果快照验证 supplied facts 的结构、身份、覆盖、统计守恒及成对 opening；未登记或源变化时仅调用 canonical owner 重建，不能维护第二套事件计算器。fresh facts 不重复校验，真实源 QA 仍保留。旧 `buildPlayerRoundFacts` / utility projection 只能从 canonical facts 投影，不能形成第二套 producer。

## 边界变更规则

新增或移动功能前，必须先回答：

1. 哪个模块是该功能的唯一 owner？
2. 它消费什么公共合同，输出什么公共合同？
3. 哪些模块明确不得实现它？

先从代码、公共合同与本表确定答案，这是实现前的技术判断，不要求用户逐项确认。
若仍存在会改变产品目标或公共合同语义的未授权取舍，给出证据与选项，只暂停相关
实现；继续独立的调查、验证或修复。授权范围内的技术归属可自主决定并记录依据。

14. `core/src/tournament-facts.ts` 是单图 frozen Tournament economy/performance projection 的唯一 owner，只以 type import 消费 Tournament DTO。显式 stable team/player ID 必须完整，teamA/B 相同 ID 明确拒绝；显示队名、昵称、logo 不生成或决定 ID。Evidence 直接消费 Core data adapter，再按 target entry ID 查询 Tournament 结果，不通过 Presentation ViewModel 回查。未绑定的本地 Demo 使用显式 match-scoped observed ID，只表示本场观察，不能据同名跨图认定同队；Analytics adapter 在身份确定后注入标签，Studio `teamRenames` 不改变 frozen identity。

Calibration-only 消费者优先使用 `@cs2dak/maps/calibration`；root 聚合空间能力。两者由同一 maps owner 实现，当前 Active Duty 与 checked-in spatial coverage 分别由 `ACTIVE_DUTY_MAPS` / `SPATIAL_ASSET_MAPS` 表达。maps 仅发布算法；空间数据和 loader 在 map-assets 独立安装，UI/基础事实不依赖它。

## 可执行 package graph 与发布合同

`pnpm check:package-boundaries` 同时检查 production TypeScript/TSX 的 import、re-export、dynamic import、require、import type 与 manifest dependencies/peers/optional dependencies。测试文件与 test-fixtures/__tests__ helper 可使用跨层 fixture，不进入生产 graph（生产代码不得 import 测试 helper）；跨包相对路径、未声明依赖、计算出来的模块入口与不在下表中的外部依赖均拒绝。`scripts/check-package-boundaries.mjs` 是机器规则，下表记录当前允许方向（不要求每个允许方向都有 runtime import）：

| 包 | 允许的依赖 |
|---|---|
| contract | Zod；cs2-demo-format 仅精确 build-only 输入 |
| maps | 无 npm 依赖 |
| map-assets | maps；Node 专用 loader 可用 Node builtins |
| core | contract；tournament **仅 DTO/type** |
| rating | Zod；rival-rating 仅精确 build-only 输入 |
| cohort | rating、Zod |
| tactics | contract、core、maps、map-assets、Zod |
| demo-io | contract、core、JSZip；允许 Node builtins |
| tournament | **无 runtime/peer/optional 依赖，也不 import 外部 DTO** |
| presentation | maps、Zod |
| react | presentation、maps、lucide-react；React/React DOM peers |
| analytics | contract、core、rating、cohort、tactics、maps、map-assets、tournament、presentation、Zod |
| pipeline | contract、core、rating、cohort、tactics、demo-io、maps、map-assets、tournament、analytics、presentation |
| rivalhub-upload（private） | contract、core、demo-io、tournament、Zod |

Core 的 tournament manifest dependency 是外部声明解析所需的 DTO 合同，不允许变成运行时 aggregation。React 的 props/type 由 presentation 拥有，地图投影使用 maps/calibration。presentation/React 的源码、声明和安装闭包均不得依赖 contract、core、cohort、tournament、analytics、pipeline、rivalhub-upload、rating、tactics、demo-io、map-assets、cs2-demo-format 或 JSZip。私有 uploader 直接消费 Core canonical facts；禁止回读 presentation。

十三个公共包的发布合同为 dist ESM/declarations，显式 exports 与有限 files；React 的 theme.css 保持原公开入口，复制到 dist 并标记 CSS side effect，其余包 sideEffects=false。现有 private CLI/uploader/apps 保持 private。DAK 自身模块不 bundle；React 原有省略扩展名的相对路径只在生成的 JS/declaration 中补 `.js`。build configs 排除测试，typecheck configs 继续检查测试源码。

`pnpm check:package-consumers` 重建公共库、实际 pack 十三个 tgz，逐包在仓外临时目录只安装该 root 与所需 peers；npm overrides 将每条传递 DAK dependency 固定到本次对应 tarball。它验证完整声明依赖闭包、公开 JS 入口实际 import/call、strict NodeNext（skipLibCheck=false），禁止 workspace link、源码/测试泄漏与额外 DAK 包，并记录真实 compressed/unpacked bytes。外部依赖按对应 manifest 安装；UI consumer 另检查安装树与 JS/declaration 无分析依赖，并将全部 root exports 以 browser 平台打包检查；仓库只提供编译器工具，不提供 TS paths/aliases。

maps/map-assets 专项 gate 检查两包入口、JSON 公开出口、loader 与卸载资产包后的算法隔离。Node/strict TS 和浏览器 bundle 检查各自覆盖不同边界，均不能替代正式 registry 发布后的消费验证或浏览器交互验收。

DAK build 从精确固定的 cs2-demo-format@3.1.0 和 rival-rating@0.3.0 原版源生成私有 vendor ESM 与完整声明；这些源码上游只允许精确 devDependencies。所有 JS/d.ts 引用改指配套 vendor 入口，消费者无需安装上游源码包。TypeScript CLI 递归发射固定源清单的声明，JSON 权重由原数据生成类型，声明相对入口统一为 NodeNext 可解析的 `.js`。源哈希、声明哈希和许可证一并记录；不改写公式或格式语义。基础事实安装闭包必须只含 core/contract/tournament/Zod，UI 闭包只含展示和算法能力。

编译入口变化需要冷启动先构建依赖闭包：`pnpm build:packages` 用于公共库准备，CI 在 typecheck/fast tests 前执行；desktop/web-patch/uploader 的独立 build 递归包含对应 app dependencies。typecheck 的 rootDir 与发布 build 均为 src，保持 dist 声明路径一致。开发 dev 入口先准备公共产物；修改共享源码后需重跑 build:packages。构建器直接用 Node 调用已安装 tsc，避免 Windows pnpm shim 启动差异。诊断/发布 provenance 语义保持原 owner。

路径归属使用原生 path.relative/isAbsolute，覆盖 Windows path.win32 回归；Windows startup CI 实跑 graph gate。全包 tgz gate 默认要求 Linux；`--local-platform` 显式在当前主机运行并打印平台，`--skip-build` 使用已构建产物。各平台结果分别记录，macOS 通过不代替 Linux/Windows 验证。

## UI 消费入口

- 已有 UI 数据：从 `@cs2dak/presentation` 取类型/schema，从 `@cs2dak/react` 取组件与 `theme.css`。
- 已有原始 DemoPackage：由宿主调用 `@cs2dak/pipeline.analyzeMatchWorkspace(input, options?)`。
- 已有同场 package、AnalysisBundle 与 canonical facts：调用 `@cs2dak/analytics.buildMatchWorkspaceFromAnalysis(pkg, bundle, facts, options?)`；supplied facts 仍交 Core 校验。

`workspace-0.2` 展示模型必填 `buyQuality`、`players[].roundSummary` 与 `reportHighlights`，领域结果由 analytics 预计算，presentation/report 只排版。工作台投影检查 hash/map/tickrate/team、canonical player-round facts 和 roster 的输入一致性；该检查不承担鉴权或通用篡改检测。

`DemoViewOptions` 由宿主注入 radarImageUrl/lowerRadarImageUrl，省略时为 null；Studio 图片路径属于 library 层。独立组件入口为 react/scoreboard、react/table、react/replay。ReplayViewer 的数据合同仅为 WorkspaceReplay/MapView；ScoreboardTableRow 是窄输入，rr/accountRR 可为 null。组件发出交互回调，宿主处理导航与持久化。analytics/pipeline 的 API 直接由各自包导出，presentation 不转发分析 API。实际用法见 [架构](architecture.md)。
