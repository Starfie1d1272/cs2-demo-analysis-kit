# Architecture / 架构

## English

DAK owns the product-neutral path from `cs2-demo-format/3.x` data to analysis results and reusable UI. Raw `.dem` parsing belongs to `cs2df`; this repository's Python package hosts the desktop bridge and packaging shell.

Consumers choose an entry based on the data they already have:

| Input | Entry | Responsibility |
|---|---|---|
| UI model | `@cs2dak/presentation` types + `@cs2dak/react` components | Display supplied results and emit interaction callbacks |
| DemoPackage + AnalysisBundle + canonical performance facts | `@cs2dak/analytics.buildMatchWorkspaceFromAnalysis` | Validate supplied facts and project a workspace with precomputed economy results |
| Raw DemoPackage | `@cs2dak/pipeline.analyzeMatchWorkspace` | Normalize, calculate canonical facts, run pipeline analysis, then project the UI model |
| v3 ZIP | `@cs2dak/demo-io.loadDemoPackageFromZip` followed by the appropriate entry above | Load the input data |
| Frozen Tournament facts | `@cs2dak/tournament` | Aggregate across maps using stable entity identities |

`presentation` owns UI schemas, narrow view DTOs, labels and display helpers. Its dependencies are maps and Zod. `react` consumes presentation and maps/calibration, with React peers and lucide-react. Neither package may depend, directly or transitively, on contract, Core, cohort, Tournament, analytics, pipeline, rating, tactics, demo-io, map-assets, rival-rating, cs2-demo-format or JSZip. Analytics consumes the display contract; display code never invokes analytics.

These are the current source boundaries. Registry publication and consumer verification require their own recorded evidence.

## 数据流与职责

```text
.dem → cs2df → v3 ZIP → demo-io → DemoPackage
                                       │
                    pipeline.analyzeMatchWorkspace
                       ├─ core：canonical facts / QA；rating：评分
                       └─ analytics：已有结果 → 工作台模型

已有单场 / 跨场事实 → analytics：洞察、统计、展示投影
冻结 Tournament facts → tournament：跨图聚合

已有 UI 数据 → presentation：展示合同 / 标签 / 格式 / 纯投影
                       → react：渲染 / 交互回调
                       → Studio 或外部产品
```

图中表示数据流。代码依赖方向为 `pipeline → analytics → presentation`，`react → presentation`；analytics 同时消费 core/cohort/tournament 等领域能力。展示侧调用方可以从已有 UI 数据开始。

| 包或组件 | 唯一职责 |
|---|---|
| `cs2-demo-format` / `cs2df` | 上游原始数据合同与 `.dem` 导出 |
| `python/src/cs2dak` | pywebview 桌面壳、Studio bridge、安装与打包 |
| `@cs2dak/contract` | 原始输入与基础事实合同；原版 format 仅为编译输入 |
| `@cs2dak/demo-io` | ZIP 加载、流选择和输入诊断 |
| `@cs2dak/rating` | RR/PRISM DTO 与原版公式接线；消费已提取信号 |
| `@cs2dak/map-assets` | 静态地图数据与 Node/browser 资产加载 |
| `@cs2dak/tactics` | 空间、交战、地图职责分析与战术聚类 |
| `@cs2dak/core` | 标准化、单场 canonical facts、QA、基础统计与单图 frozen Tournament projection |
| `@cs2dak/cohort` | 已有行的身份归并与 RR/PRISM 群体画像 |
| `@cs2dak/tournament` | 自有窄 DTO、透明 performance/economy 跨图聚合和聚合安全校验；零 runtime 依赖 |
| `@cs2dak/maps` | 资产无关的地图标定与空间算法 |
| `@cs2dak/analytics` | 跨域评分信号、领域洞察与已有结果到展示模型的投影；复用 canonical owner |
| `@cs2dak/pipeline` | 原始 DemoPackage 的单场分析、跨场 cohort 与工作台执行编排 |
| `@cs2dak/presentation` | 展示 schema、窄 View DTO、标签、格式、报告排版与纯结果投影 |
| `@cs2dak/react` | 渲染已有展示数据；导航、选取和证据跳转交由宿主回调 |
| `@cs2dak/rivalhub-upload` | 私有 RivalHub 配对、HTTP client 与 Evidence producer |
| Apps / CLI | 文件读取、持久化、缓存、权限及产品工作流 |

地图角色组件消费 `PlayerMapRoleProfileView` 等窄展示合同，雷达组件消费 `RadarFieldView`。领域事实仍由原 owner 定义；结构可赋值的领域结果可以直接作为展示输入，展示模块不 import 领域类型。

`@cs2dak/maps` 独立发布算法，map-assets 独立发布 nav/zone/route/grid 等数据与 loader。UI 使用 maps/calibration，安装闭包不含 map-assets。基础事实 core 也不依赖地图包或评分包。

## 消费方式

已有数据时，组件仅要求对应的展示模型：

```tsx
import type { MatchWorkspaceModel } from '@cs2dak/presentation';
import { MatchWorkspace } from '@cs2dak/react';
import '@cs2dak/react/theme.css';

export function MatchPage({ model }: { model: MatchWorkspaceModel }) {
  return <MatchWorkspace model={model} />;
}
```

已有原始 DemoPackage 时，由需要执行分析的宿主调用：

```ts
import { analyzeMatchWorkspace } from '@cs2dak/pipeline';

const model = analyzeMatchWorkspace(demoPackage, {
  radarImageUrl: '/my-assets/de_nuke.png',
  lowerRadarImageUrl: '/my-assets/de_nuke_lower.png',
});
```

已有同一场比赛的 package、bundle 和 canonical facts 时，调用：

```ts
import { buildMatchWorkspaceFromAnalysis } from '@cs2dak/analytics';

const model = buildMatchWorkspaceFromAnalysis(pkg, analysisBundle, performanceFacts, options);
```

`options` 是可选的 `DemoViewOptions`，含 `radarImageUrl` / `lowerRadarImageUrl`；`buildDemoViewModel` 同样接受它。省略 URL 时默认 `null`。外部产品提供自己的资源地址，Studio 的相对图片路径在 `apps/dak-studio/src/lib/library.ts` 中组装。

该投影先交 Core 校验 supplied facts，再检查 package/bundle 的源 hash、schema、地图、tickrate、队伍元数据、canonical player-round 行及记分板 roster，防止组合错场数据。这是输入一致性检查，不提供鉴权或任意篡改检测。Core 按源与私有快照决定是否需要重建校验事实。

工作台合同为 `workspace-0.2`，必填 `buyQuality`、`players[].roundSummary` 和 `reportHighlights`；analytics 预计算后交给 UI，报告 helper 仅排版。

独立组件可从 `@cs2dak/react/scoreboard`、`@cs2dak/react/table`、`@cs2dak/react/replay` 导入。记分板消费窄 `ScoreboardTableRow[]`，`rr` / `accountRR` 可为 `null`。独立 `ReplayViewerProps` 的数据仅为 `WorkspaceReplay` 与 `MapView`，另有跳转和初始时钟选项；它不要求完整工作台。

## 原始数据与分析语义

`cs2-demo-format/3.x` ZIP 是 Python ↔ TypeScript 唯一接口。v2 输入会要求通过 `cs2df` 重新导出。

- 事件以 `playerIndex` 引用选手，通过 players/rounds 解析身份和阵营。
- replay/shots/duels 列式流按上游 `decodeDelta()` 解码；空间分析使用 replay 的 8 Hz 数据。
- 缺失派生值保持 `null`；不得补零来制造可用结果。
- 原始格式 schema 由 cs2-demo-format 拥有；展示 schema 描述 UI 输入，不重新定义 ZIP 格式。

Core 的 `buildPlayerRoundPerformanceFacts()` 是 Assist、Damage、Opening、Trade、KAST、Clutch、Utility、Objective、Weapon 和 man-state 语义的唯一 owner。`assertPlayerRoundPerformanceFacts()` 使用同一 owner 的私有快照检查身份、覆盖、统计守恒及成对 opening；源发生变化或反序列化事实没有可信快照时，调用 canonical owner 校验。

FK/FD 归属按回合、tick、原事件顺序选出的首个有效敌对击杀；TK、自杀和 world death 更新生存状态。无有效敌对击杀时，全员 FK/FD 为零。Exporter 的 playerStats 不作归因对照或 fallback；collateral 观察字段仍用于展示。

Cohort、Tournament、analytics 和 Evidence 适配器消费 canonical facts。Presentation/React 只展示结果。源签名保持私有，不能替代 source QA，也不能作为外部 payload 的信任凭据。历史 ZIP/Evidence 保持不可变，已有历史诊断可展示，新分析不生成已退役的 oracle 诊断。

## Tournament 与稳定身份

```text
core 单场 detection + 显式 stable identity
  → core canonical frozen-facts projection
  → analytics 标签与消费适配 / Evidence 直接消费
  → tournament 跨图聚合
  → 产品结果
```

Tournament 拥有 `TournamentMapFacts` / `TournamentAnalytics` 及 performance DTO 和聚合规则。它只检查 shape/count、实体引用、重复项与分母等聚合安全条件；事件语义由 Core/Evidence QA 裁决。不得由 `deaths` 反推 `survived`，或由 `teamWonRound` / `survived` 重新裁决 `clutch.won`。

Core 对 Tournament 的依赖仅用于 DTO/type。其 canonical projection 仍在 `core/src/tournament-facts.ts`；analytics 包装它并注入显示标签，Evidence 直接消费 Core adapter。

显式 stable team/player IDs 必须完整，teamA/B 不能使用相同 ID。聚合只认 entity key；显示名、昵称、logo 不决定身份。未绑定的本地 Demo 显式使用 match-scoped observed team IDs 与 Steam player IDs，只表达本场观察。`teamRenames` 只改变显示名，同名不会合并不同 ID。

## 评分所有权

| 层 | 含义 | 粒度 |
|---|---|---|
| RR v1 | 单场统计产出 | 单场 |
| RR 六账户 | 包含上下文的贡献 | 单场 / cohort |
| PRISM | 打法画像 | 跨场 cohort |

公式与基线由 `@rivalhub/rival-rating` 拥有，DAK 负责信号、接线和输出整形。RR 使用 frozen pro baseline（`1.0 = 职业基线`）；PRISM 的群体百分位不改变 RR 标尺。信号提取在 analytics，评分执行在 rating，完整调用链在 pipeline。Core 保持基础事实所有权。

机器依赖规则与发布产物要求见 [模块边界](module-boundaries.md)。

## 编译分发

contract 的 format 上游和 rating 的公式上游仅为精确 devDependencies。构建从固定 registry 源编译私有 JS/完整声明，校验源、声明和许可证哈希；消费者不安装这些源码包。外部 strict NodeNext 消费检查覆盖完整声明闭包，避免格式包的 parser/JSZip 传递进入基础事实消费路径。
