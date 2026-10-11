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
  -> @cs2dak/presentation (label wrappers + product-neutral view models)
       └─> @cs2dak/tournament (frozen Tournament facts -> cross-map analytics)
  -> @cs2dak/react / product adapters (RivalHub, CS2 Insight Agent)
```

### Components

| Component | Role |
|---|---|
| `cs2df` | Reference `.dem -> cs2-demo-format/3.x ZIP` exporter. Owns raw parsing and ZIP production. |
| `python/src/cs2dak` | Desktop launcher shell: pywebview GUI, DAK Studio bridge, PyInstaller packaging. Does not contain parser/exporter logic. |
| `@cs2dak/contract` | Zod schemas + types; re-exports `cs2-demo-format` instead of forking it. |
| `@cs2dak/core` | Deterministic single-match analysis, RR/PRISM signal derivation, QA. Includes the data-only frozen Tournament projection with explicit stable identities. No product side effects. |
| `@cs2dak/cohort` | Cross-match aggregation and identity merging. No product ranking rules. |
| `@cs2dak/maps` | Map calibration + world-to-radar transform + attack routes (`MapRoute`) + zone geometry (`zoneAt` / `pointInPolygon`) + callout mappings. |
| `@cs2dak/tournament` | Zero-runtime-dependency frozen sufficient-fact DTOs, identity-safe cross-map merge for 1.0 economy/team facts and 1.1 performance facts, denominator-aware rates, deterministic ordering, and invariant guards. |
| `@cs2dak/presentation` | Product-neutral view models, labels, stories, workspace composition, and label wrappers around the Core canonical Tournament projection. |
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

`@cs2dak/core` is the sole owner of DAK performance semantics. Its
`buildPlayerRoundPerformanceFacts()` converts the frozen event annotations into
player-round Assist, Damage, Opening, Trade, KAST, Clutch, Utility, Objective,
Weapon, and man-state facts. The same Core owner validates supplied cached facts against a private snapshot
of its own result, including identity, coverage, counts and paired opening duels;
exporter `playerStats` is not a comparison oracle or fallback. Its collateral
count remains an observed field consumed by the scoreboard and weapon highlights.
Opening FK/FD means the first valid enemy-player kill, ordered by round, tick and
original event order: teamkills, suicides and world deaths update death state but
do not receive opening credit. With no enemy kill, every player's FK/FD is zero.
This is an opening duel, not the first chronological death or a guaranteed 5v5.
Cohort, tournament, presentation, and Evidence adapters aggregate or project the
Core facts and do not recreate event rules. Source/fact signatures detect in-place mutations;
unchanged sources reuse the private owner snapshot. Previously serialized facts
without a registered snapshot require one canonical owner build. Fresh owner
results skip redundant validation. Large replay/shots/duels streams are excluded
from these signatures. Signatures stay private, are not a payload trust token,
and never replace source QA. Legacy ZIP/Evidence payloads remain
readable and immutable; historical parity diagnostics may still be displayed and
redacted, but new analysis does not emit the retired oracle diagnostics.

### Tournament frozen-fact boundary

Tournament analytics deliberately has a narrower runtime boundary than the general
presentation package:

```text
core single-map detection + explicit stable identities
  -> core canonical frozen-facts projection
  -> presentation label wrapper / direct Evidence producer
  -> @cs2dak/tournament frozen-fact merge
  -> DAK Studio / RivalHub consumers
```

`@cs2dak/tournament` owns the public `TournamentMapFacts` / `TournamentAnalytics`
1.0 surface and the additive `TournamentPerformanceMapFacts` /
`TournamentPerformanceAnalytics` 1.1 surface. The performance builder consumes
already-frozen player-round, objective, and weapon facts; it does not parse demos
or redetect events. It does not resolve RivalHub scope, access storage, or own
scoreboard/rating formulas. Entity keys are the only aggregation identity; display
labels are injected at the final projection step. Tournament validation is deliberately
limited to shape/count bounds, entity/reference integrity, duplicate detection,
and cross-row constraints required for deterministic aggregation. It never
re-derives Core semantics from other frozen fields: for example, it does not infer
`survived` from `deaths` or decide `clutch.won` from `teamWonRound` /
`survived`. Those semantic invariants belong to Core/Evidence QA. Its published
runtime contains compiled ESM and declarations, with no dependency on
`@cs2dak/core`, `@cs2dak/contract`, `@cs2dak/cohort`, maps, React, Zod, or RivalHub code.

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
| `@cs2dak/presentation` | 产品中立 View Model、标签、叙事、workspace 编排和 Core canonical Tournament adapter 的标签包装。 |
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

`@cs2dak/core` 是 DAK performance semantics 的唯一 owner。其
`buildPlayerRoundPerformanceFacts()` 将冻结的事件标注统一转换为 player-round
层的 Assist、Damage、Opening、Trade、KAST、Clutch、Utility、Objective、Weapon
与 man-state facts。supplied/cached facts 的校验复用同一 owner 的私有结果快照，检查结构、身份、覆盖、
统计守恒与成对 opening，不维护第二套事件计算器；`playerStats` 不再作旧口径对照或 fallback，仍保留合同读取和
尚未替代的 collateral 观察字段。FK/FD 指按回合、tick、原始事件顺序选择的首个
有效敌对击杀，成对归属胜者/死者；TK、自杀和 world 死亡只更新死亡/存活状态。
没有敌对击杀则全员 FK/FD 为零。这不是时间上的第一次死亡或保证 5v5 的对枪。
历史 ZIP/Evidence 及已有 QA warning 保持原样读取，不改写为重新验证通过；历史
parity 诊断继续脱敏显示，新分析不再生成这些旧 oracle 诊断。cohort、tournament、
presentation 和 Evidence 适配器只聚合或投影 Core facts，不重新实现事件规则。

### Tournament frozen-fact 边界

赛事统计的链路固定为：

```text
core 单场 detection + 显式稳定身份
  -> core canonical frozen-facts projection
  -> presentation 标签包装 / Evidence 直接消费
  -> @cs2dak/tournament frozen-fact merge
  -> DAK Studio / RivalHub consumer
```

`@cs2dak/tournament` 只拥有窄 public `TournamentMapFacts` / `TournamentAnalytics`
1.0 DTO 与 additive `TournamentPerformanceMapFacts` /
`TournamentPerformanceAnalytics` 1.1 merge；performance surface 只消费已冻结的
player-round、objective、weapon sufficient facts，不重新 detection。不解析 Demo、
不解析 RivalHub scope、不访问存储，也不拥有 scoreboard 或评分公式。聚合只认
entity key，display label 仅在最终 projection 注入。Tournament 的 fail-fast
只保护 shape/count、entity/reference、duplicate 与确定性聚合所必需的 cross-row
约束；不得从一个 frozen semantic 字段重新推导另一个字段，例如不得由 `deaths`
反推 `survived`，也不得由 `teamWonRound` / `survived` 重新裁决 `clutch.won`。
这些 semantic invariant 只属于 Core / Evidence QA。发布产物是编译后的 ESM +
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

### Stable identity compatibility (#69)

The canonical single-map adapter lives in the existing Core package and is exported
through its existing root/evidence entries; no package or subpath is added. Its
Tournament import is type-only. Tournament still owns the zero-runtime-dependency
DTOs and cross-map merge. Presentation retains its existing wrapper functions and
injects labels after identity has been established.

Frozen facts require complete stable team/player IDs and reject missing IDs or
identical teamA/teamB IDs. Consumers with authoritative event/roster identities
supply them explicitly. For unbound local Demos, the wrapper explicitly constructs
match-scoped observed team IDs and Steam player IDs: it preserves local use without
claiming that teams in different matches are the same real team. Equal display
names never establish that claim. Existing explicit player mappings remain valid.

`teamRenames` changes labels only. Consequently two different stable IDs renamed
to the same label remain separate; the same stable ID merges across maps even when
its label changes. Old manually constructed `TournamentFacts` must supply the IDs.
Studio derived cache moves from v5 to v6 and requires local facts backfill/reimport;
its persisted tournament result keys are invalidated too. Raw Demo packages and
immutable historical/remote evidence are not rewritten.
