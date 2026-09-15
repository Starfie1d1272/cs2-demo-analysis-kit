# Architecture / 架构

## English

This repository owns the product-neutral analysis pipeline from a `cs2-demo-format/3.x` ZIP to reusable view models. Raw `.dem` parsing is delegated to [`cs2df`](https://pypi.org/project/cs2df/), the reference exporter for `cs2-demo-format` v3. The Python code in this repo is now only a desktop/Studio shell around that exporter.

```text
.dem
  -> cs2df (PyPI; demoparser2 -> cs2-demo-format/3.x ZIP)
       └─ python/src/cs2dak  (GUI / DAK Studio bridge / packaging shell)
  -> @cs2dak/core  (loads v3 ZIP -> DemoPackage -> AnalysisBundle)
       ├─ normalize / economy / kills / clutches / timeline / heatmap / QA
       ├─ box-score / HLTV baseline / RR six-account / PRISM  (via @rivalhub/rival-rating)
       └─ replay / shots / duels decoding through cs2-demo-format helpers
  -> @cs2dak/cohort       (cross-match aggregation + identity map)
  -> @cs2dak/presentation (single-map adapters + product-neutral view models)
       └─> @cs2dak/tournament (frozen Tournament facts -> cross-map analytics)
  -> @cs2dak/react / product adapters (RivalHub, CS2 Insight Agent)
```

### Components

| Component | Role |
|---|---|
| `cs2df` | Reference `.dem -> cs2-demo-format/3.x ZIP` exporter. Owns raw parsing and ZIP production. |
| `python/src/cs2dak` | Desktop launcher shell: pywebview GUI, DAK Studio bridge, PyInstaller packaging. Does not contain parser/exporter logic. |
| `@cs2dak/contract` | Zod schemas + types; re-exports `cs2-demo-format` instead of forking it. |
| `@cs2dak/core` | Deterministic single-match analysis, RR/PRISM signal derivation, QA. No product side effects. |
| `@cs2dak/cohort` | Cross-match aggregation and identity merging. No product ranking rules. |
| `@cs2dak/maps` | Map calibration + world-to-radar transform + attack routes (`MapRoute`) + zone geometry (`zoneAt` / `pointInPolygon`) + callout mappings. |
| `@cs2dak/tournament` | Zero-runtime-dependency frozen sufficient-fact DTOs, identity-safe cross-map merge for 1.0 economy/team facts and 1.1 performance facts, denominator-aware rates, deterministic ordering, and invariant guards. |
| `@cs2dak/presentation` | Product-neutral view models, labels, stories, workspace composition, and single-map Tournament fact adapters. |
| `@cs2dak/react` | Product-neutral preview components that consume presentation contracts only. |
| `@cs2dak/cli` | Language-neutral filesystem/automation wrapper around TypeScript packages. |
| `apps/dak-studio` | Local demo library and analysis workbench. Stores ZIP bytes locally; `.dem` import is exported through `cs2df`. |

### The v3 ZIP seam

`cs2-demo-format/3.x` ZIP is the only Python/TypeScript seam. v2 packages are not supported at runtime; loaders fail fast and ask the user to re-export with `cs2df`.

The v3 package includes:

- **Aggregates**: `match`, `players`, `rounds`, `player-stats`, `player-economies`
- **Events**: `kills`, `damages`, `blinds`, `bombs`, `grenades`, `clutches`
- **Columnar/tick-level streams**: `shots`, `replay`, optional research `duels`

Important v3 semantics:

- Events reference players by `playerIndex`; consumers resolve player/team/side through `players.json` and `rounds.json`.
- `positions-1s.json` is gone; spatial consumers read the 8 Hz replay stream and `place` column.
- Columnar streams are delta encoded; consumers use `decodeDelta()` from `cs2-demo-format`.
- Missing derived data remains `null`, not coerced to `0`.

### Tournament frozen-fact boundary

Tournament analytics deliberately has a narrower runtime boundary than the general
presentation package:

```text
core single-map detection
  -> presentation legacy adapter / Evidence producer
  -> @cs2dak/tournament frozen-fact merge
  -> DAK Studio / RivalHub consumers
```

`@cs2dak/tournament` owns the public `TournamentMapFacts` / `TournamentAnalytics`
1.0 surface and the additive `TournamentPerformanceMapFacts` /
`TournamentPerformanceAnalytics` 1.1 surface. The performance builder consumes
already-frozen player-round, objective, and weapon facts; it does not parse demos
or redetect events. It does not resolve RivalHub scope, access storage, or own
scoreboard/rating formulas. Entity keys are the only aggregation identity; display
labels are injected at the final projection step. Its published runtime contains
compiled ESM and declarations, with no dependency on `@cs2dak/core`,
`@cs2dak/contract`, `@cs2dak/cohort`, maps, React, Zod, or RivalHub code.

### Rating layers

Three rating layers answer three different questions and must never be merged into one number:

| Layer | Question | Granularity |
|---|---|---|
| RR v1 | How did this match's stat line look? | per-match |
| RR six-account | How much was your contribution worth with context? | per-match / cohort |
| PRISM | What is your play style? | cross-match cohort |

Formula ownership stays in `@rivalhub/rival-rating`. This kit only derives signals, wires the models, anchors, and shapes output. Production RR uses a frozen pro baseline so single-match and cohort views share one scale (`1.0 = pro baseline`).

## 简体中文

本仓库拥有从 `cs2-demo-format/3.x` ZIP 到产品级 View Model 的产品中立分析管道。原始 `.dem` 解析交给 [`cs2df`](https://pypi.org/project/cs2df/)（`cs2-demo-format` v3 参考导出器）。本仓库 Python 代码现在只保留桌面 GUI / Studio 桥 / 打包壳层。

```text
.dem
  -> cs2df（PyPI；demoparser2 -> cs2-demo-format/3.x ZIP）
       └─ python/src/cs2dak  （GUI / DAK Studio 桥 / 打包壳）
  -> @cs2dak/core  （加载 v3 ZIP -> DemoPackage -> AnalysisBundle）
       ├─ 标准化 / 经济 / 击杀 / 残局 / 时间线 / 热力图 / QA
       ├─ box-score / HLTV baseline / RR 六账户 / PRISM（经 @rivalhub/rival-rating）
       └─ replay / shots / duels 通过 cs2-demo-format helper 解码
  -> @cs2dak/cohort       （跨场聚合 + identity map）
  -> @cs2dak/presentation （单图适配 + 产品中立 View Model）
       └─> @cs2dak/tournament （frozen Tournament facts -> 跨图分析）
  -> @cs2dak/react / 产品适配层（RivalHub、CS2 Insight Agent）
```

### 组件

| 组件 | 角色 |
|---|---|
| `cs2df` | `.dem -> cs2-demo-format/3.x ZIP` 参考导出器，拥有原始解析和 ZIP 生产。 |
| `python/src/cs2dak` | 桌面壳：pywebview GUI、DAK Studio 桥、PyInstaller 打包；不再包含 parser/exporter 实现。 |
| `@cs2dak/contract` | Zod schema + 类型；re-export `cs2-demo-format`，不 fork 合同。 |
| `@cs2dak/core` | 单场确定性分析、RR/PRISM 信号派生、QA；无产品副作用。 |
| `@cs2dak/cohort` | 跨场聚合与身份归并，不拥有产品排行榜规则。 |
| `@cs2dak/maps` | 地图标定、world-to-radar 转换、进攻动线、zone 几何与 callout 映射。 |
| `@cs2dak/tournament` | 零 runtime 依赖的 frozen sufficient-fact DTO、identity-safe 跨图 merge、透明 performance aggregation、rate、确定性排序与 invariant guard。 |
| `@cs2dak/presentation` | 产品中立 View Model、标签、叙事、workspace 编排和 Tournament 单图 fact adapter。 |
| `@cs2dak/react` | 只消费 presentation 合同的产品中立组件。 |
| `@cs2dak/cli` | TypeScript 包的文件系统/自动化入口。 |
| `apps/dak-studio` | 本地 Demo 库和分析工作台；本地保存 ZIP 字节，`.dem` 导入通过 `cs2df` 导出。 |

### v3 ZIP seam

`cs2-demo-format/3.x` ZIP 是 Python/TypeScript 的唯一接口。v2 包不做运行时兼容；loader 会直接提示用 `cs2df` 重导。

v3 包包含：

- **聚合量**：`match`、`players`、`rounds`、`player-stats`、`player-economies`
- **事件**：`kills`、`damages`、`blinds`、`bombs`、`grenades`、`clutches`
- **列式 / tick 级流**：`shots`、`replay`、可选 research `duels`

关键语义：

- 事件通过 `playerIndex` 引用玩家；消费者经 `players.json` 和 `rounds.json` 推导 player/team/side。
- `positions-1s.json` 已删除；空间消费者改读 8 Hz replay 流和 `place` 列。
- 列式流为 delta 编码；消费者使用 `cs2-demo-format` 导出的 `decodeDelta()`。
- 缺失派生数据保持 `null`，不得伪造为 `0`。

### Tournament frozen-fact 边界

赛事统计的链路固定为：

```text
core 单场 detection
  -> presentation legacy adapter / Evidence producer
  -> @cs2dak/tournament frozen-fact merge
  -> DAK Studio / RivalHub consumer
```

`@cs2dak/tournament` 只拥有窄 public `TournamentMapFacts` / `TournamentAnalytics`
1.0 DTO 与 additive `TournamentPerformanceMapFacts` /
`TournamentPerformanceAnalytics` 1.1 merge；performance surface 只消费已冻结的
player-round、objective、weapon sufficient facts，不重新 detection。不解析 Demo、
不解析 RivalHub scope、不访问存储，也不拥有 scoreboard 或评分公式。聚合只认
entity key，display label 仅在最终 projection 注入。发布产物是编译后的 ESM +
declaration，runtime 不依赖 `@cs2dak/core`、`@cs2dak/contract`、`@cs2dak/cohort`、
maps、React、Zod 或 RivalHub。

### 评分三层

三层评分回答三个不同问题，绝不能合并成一个数：

| 层 | 回答的问题 | 粒度 |
|---|---|---|
| RR v1 | 这场数据产出如何 | 单场 |
| RR 六账户 | 这场/赛季里你的贡献值多少（含上下文） | 单场 / cohort |
| PRISM | 你是什么风格 | 跨场 cohort |

公式所有权在 `@rivalhub/rival-rating`。本 kit 只做信号派生、模型接线、锚定与输出整形。生产 RR 统一使用 frozen pro baseline（`1.0 = 职业基线`），单场与 cohort 视图共用同一标尺。
