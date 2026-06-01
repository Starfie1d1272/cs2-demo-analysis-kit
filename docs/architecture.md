# Architecture / 架构

## English

This repository owns the **full pipeline** from a raw `.dem` file to product-ready
view models — exporter included. It is no longer "just the middle layer".

```text
.dem
  -> python/cs2_demo_exporter         (in-repo; demoparser2 → cs2-demo-format/2.0 ZIP)
  -> @cs2dak/core  (loads ZIP → DemoPackage)
       ├─ box-score / RR v1 / RR v2-lite / PRISM  (via @rivalhub/rival-rating)
       ├─ economy / kills / clutches / timeline / heatmap / QA
       └─ → AnalysisBundle → DemoViewModel
  -> React preview components / product adapters (RivalHub, CS2 Insight Agent)
```

### Components

| Component | Role |
|---|---|
| `python/cs2_demo_exporter` | **In-repo** `.dem → v2 ZIP` pipeline (demoparser2 + GUI + PyInstaller). Owns the export side. |
| `@cs2dak/contract` | Zod schemas + types; single source of truth for shapes. Re-exports `cs2-demo-format`. |
| `@cs2dak/core` | Deterministic analysis, RR/PRISM adapter, QA. No side effects. |
| `@cs2dak/maps` | Map calibration + world→radar transform. **No zone/polygon semantics yet.** |
| `@cs2dak/react` | Product-neutral preview components (consume `DemoViewModel` only). |
| `@cs2dak/cli` | Language-neutral integration surface. |

> ⚠️ Ownership note: the exporter lives **here**, in `python/cs2_demo_exporter`. The
> `EXPORTER_NAME = "CS2 Insight Agent"` string in the manifest is a legacy label, not
> a statement of ownership. CS2 Insight Agent is a **downstream consumer** and the
> source of raw `.dem` files — it does not own parsing anymore.

### The v2 ZIP is a rich event warehouse

The `cs2-demo-format/2.0` ZIP carries far more than a scoreboard. 15 files in three tiers:

- **Aggregates**: `match` `players` `rounds` `player-stats` `player-economies`
- **Events**: `kills` `damages` `blinds` `bombs` `grenades` `clutches`
- **Spatial / tick-level**: `shots` (per-shot yaw/pitch/velocity), `positions-1s` (1 Hz tracks), `replay` (~8 Hz tracks)

Events carry context fields beyond a scoreboard — e.g. `damages` has
`victimHealthBefore/After` / `armorDamage` / `hitgroup`; `kills` has `throughSmoke` /
`noScope` / `killerActiveWeapon`; `bombs` has an explicit `site: "a"|"b"`. Current
field expression is tracked in [design/field-expression.md](design/field-expression.md);
longer-term consumption is tracked in [rr-roadmap.md](rr-roadmap.md).

### Rating layers

Three rating layers answer three different questions and must never be merged into one number:

| Layer | Question | Granularity | Design doc |
|---|---|---|---|
| RR v1 | How did this match's stat line look? | per-match | [design/rr-v1.md](design/rr-v1.md) |
| RR v2-lite | How much was your contribution worth (with context)? | per-match | [design/rr-v2-lite.md](design/rr-v2-lite.md) |
| PRISM | What is your play style? | cross-match cohort | [design/prism.md](design/prism.md) |

Formula ownership stays in `@rivalhub/rival-rating` (the only implementation of
`computeRR` / `computeValueAccountsRR` / `computePrism`). This kit only derives
signals, wires the models, anchors, and shapes output.

> `analyzeDemoPackage` processes **one demo at a time**. Season-level PRISM and RR
> anchoring live in `@cs2dak/cohort`, which aggregates many demos and supports
> external identity maps for RivalHub user/Steam alias binding.

Consumers: RivalHub calls core/CLI, stores only the subset it needs, renders from
`DemoViewModel`. Standalone tools can import the TS packages or consume the JSON.

## 简体中文

本仓库拥有从原始 `.dem` 到产品级 view model 的**完整管道**——**导出器也在内**。
它已经不只是"中间层"了。

```text
.dem
  -> python/cs2_demo_exporter         (本仓库内；demoparser2 → cs2-demo-format/2.0 ZIP)
  -> @cs2dak/core  (加载 ZIP → DemoPackage)
       ├─ box-score / RR v1 / RR v2-lite / PRISM  (经 @rivalhub/rival-rating)
       ├─ 经济 / 击杀 / 残局 / 时间线 / 热力图 / QA
       └─ → AnalysisBundle → DemoViewModel
  -> React 预览组件 / 产品适配层（RivalHub、CS2 Insight Agent）
```

### 组成

| 组件 | 角色 |
|---|---|
| `python/cs2_demo_exporter` | **本仓库内**的 `.dem → v2 ZIP` 管道（demoparser2 + GUI + PyInstaller），拥有导出端。 |
| `@cs2dak/contract` | Zod schema + 类型，形状的单一真相源；re-export `cs2-demo-format`。 |
| `@cs2dak/core` | 确定性分析、RR/PRISM 适配、QA。无副作用。 |
| `@cs2dak/maps` | 地图标定 + world→radar 转换。**尚无区域/多边形语义。** |
| `@cs2dak/react` | 产品中立的预览组件（只消费 `DemoViewModel`）。 |
| `@cs2dak/cli` | 跨语言集成入口。 |

> ⚠️ 归属订正：导出器在**本仓库** `python/cs2_demo_exporter`。manifest 里的
> `EXPORTER_NAME = "CS2 Insight Agent"` 是遗留标签，不代表归属。CS2 Insight Agent 是
> **下游消费方**和原始 `.dem` 的来源，已不再拥有解析。

### v2 ZIP 是一个富事件仓库

`cs2-demo-format/2.0` ZIP 远不止 scoreboard。15 个文件分三档：

- **聚合量**：`match` `players` `rounds` `player-stats` `player-economies`
- **事件**：`kills` `damages` `blinds` `bombs` `grenades` `clutches`
- **时空 / tick 级**：`shots`（每发 yaw/pitch/velocity）、`positions-1s`（1 Hz 轨迹）、`replay`（~8 Hz 轨迹）

事件里带着大量 context 字段——例如 `damages` 有
`victimHealthBefore/After` / `armorDamage` / `hitgroup`；`kills` 有 `throughSmoke` /
`noScope` / `killerActiveWeapon`；`bombs` 直接带 `site: "a"|"b"`。当前字段表达见
[design/field-expression.md](design/field-expression.md)，后续消费计划见
[rr-roadmap.md](rr-roadmap.md)。

### 评分三层

三层评分回答三个不同问题，**绝不能合并成一个数**：

| 层 | 回答的问题 | 粒度 | 设计文档 |
|---|---|---|---|
| RR v1 | 这场数据产出如何 | 单场 | [design/rr-v1.md](design/rr-v1.md) |
| RR v2-lite | 这场里你的贡献值多少（含上下文） | 单场 | [design/rr-v2-lite.md](design/rr-v2-lite.md) |
| PRISM | 你是什么风格 | 跨场 cohort | [design/prism.md](design/prism.md) |

公式所有权在 `@rivalhub/rival-rating`（`computeRR` / `computeValueAccountsRR` /
`computePrism` 的唯一实现）。本 kit 只做信号派生、模型接线、锚定与输出整形。

> `analyzeDemoPackage` 一次只处理一场 demo。PRISM 的跨人 z-score 和赛季级 RR 锚定由
> `@cs2dak/cohort` 聚合多场 demo 完成；RivalHub 的 userId / Steam alias 绑定通过
> 外部 identity map 接入。

消费方：RivalHub 调 core/CLI，只存需要的子集，基于 `DemoViewModel` 渲染。独立工具可
直接 import TS 包或消费 JSON。
