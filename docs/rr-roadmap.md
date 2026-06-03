# RR / PRISM Roadmap

> 本文件只描述**阶段大致内容与边界**，不展开公式与字段。
> 每个阶段引用对应的设计文档（`docs/design/*.md`），实现细节看那里。

## 定位三层（贯穿所有阶段的边界）

| 层 | 回答的问题 | 粒度 | 设计文档 |
|---|---|---|---|
| **RR v1** | 这场数据产出如何 | 单场 | [rr-v1.md](design/rr-v1.md) |
| **RR v2-lite** | 这场里你的贡献值多少（含上下文） | 单场 | [rating-model.md](design/rating-model.md) |
| **PRISM** | 你是什么风格 | 跨场 cohort | [prism.md](design/prism.md) |

铁律：**不让任何一个数同时承担「单场表现 / 长期实力 / 风格 / 胜负贡献」四件事。**
公式所有权在 [`@rivalhub/rival-rating`](https://github.com/Starfie1d1272/rival-rating)；
导出端在本仓库 `python/src/cs2dak`；本 kit 的 TS 侧负责**信号派生 + 接线 + 锚定 + 展示**。

## 数据现状（55 场锦标赛，仅差总决赛）

- 55 场 demo 全部以 `cs2-demo-format/2.0` 干净导出，富事件 + 时空层齐全（见 [architecture](architecture.md)）。
- **per-match 的 RR v1 / v2-lite 现在就能跑全 55 场。**
- 跨场聚合层不存在 → 这是 PRISM 与赛季锚定的唯一结构性前置（阶段 2）。

---

## 阶段 0 — 信任地基（已完成）

让 v2 现有产物可信、可解释，不引入新能力。

- **missing vs zero**：context 分桶在数据源缺失时发 `null`（模型降级为乘子 1.0），不再混成零桶。
- **账户 breakdown 透传**：模型已算出的五账户贡献，落到 scoreboard / view-model（此前被丢弃）。
- **per-match 联赛锚定**：`computeAccountRatingsV2` 跑完整场后整体归一，`accountRR` 的 1.00 = 本场均值。

产出：`PlayerScoreboardRow` 新增 `accountBreakdown` / `accountContextStatus`；`accountRR` 语义变为锚定后。
详见 [rating-model.md](design/rating-model.md)。

## 阶段 1 — 接线已有真值 + 表达

仓库里**真数据被丢在桌上**，schema（cs2-demo-format v2.2.0）已保留、core 却没用。这一阶段零成本提精度。

- **用真值替换近似/占位**（fixture 已支持 TDD）：
  - `combatDeathCount`：现在用总 deaths 近似 → 改用 `player-stats.combatDeathCount` 真值。
  - `bombDeathCount`：现在硬写 `null` → 改用 `player-stats.bombDeathCount` 真值。
  - `wallbangKillCount` / `noScopeKillCount`：用 `player-stats` 真值，去掉 `penetratedObjects>0` 估算。
  - AWP/狙击判定：用 `kills.killerActiveWeapon` 而非武器名启发式。
  - 删除代码里"等 cs2dak v2 产出后填入"等**过时注释**——v2.2.0 早已产出。
- **表达去原创化**：v1 定位为兼容基线（box-score baseline），不承担原创叙事；v2 明确标 `lite / uncalibrated / per-match`。
- **`confidence` 字段**：数据完整度 + 样本量，前端据此显示"未启用 / 无样本 / beta"。
- 字段表达入口：[field-expression.md](design/field-expression.md)。
- **数据体检（导出器侧）**：已定位并修复当前 fixture（13:8 de_ancient）里的 2 个
  `kills.tick_outside_round`：导出器曾把 freeze 期前的 `world` self-death 当作有效 death/kills 统计。
  新 fixture 由修复后的导出器重导，QA error 为 0。

## 阶段 2 — 跨场聚合层（已完成骨架）

攒 55 场 → cohort，**让数据真正有意义**。这是 PRISM 与赛季锚定的共同前置，是一个新层（不属于单场 `analyzeDemoPackage`）。

- 跨场 cohort：把多场的选手信号汇总，做跨人 z-score（PRISM 才有意义）。
- 身份主键：默认按 `steamId64`，但支持外部 `identityMap` 归并到同一 `playerKey`，给 RivalHub 的 userId / Steam alias 对接预留正确边界。
- 把"per-match 锚定"升级为**赛季级锚定**（league mean 跨整季）。
- 先做数据质量体检：各指标分布、极值、缺失率（顺带验证阶段 1 的导出器问题是否普遍）。
- 设计入口：[cohort.md](design/cohort.md)。

## Phase D0 — Demo Lake 地基（阶段 R 前置）

建立职业 demo 的存储与入库管线，是冻结职业基准曲线的数据前置。
详见 [pro-baseline.md](design/pro-baseline.md)。

- `manifest.sqlite`：记录每张 map-demo 的事件/赛事/队伍/解析状态/checksum。
- `raw/dem/parsed` 三层目录：raw 存压缩档，dem 存解压后 .dem，parsed 存各事件 parquet。
- ingestion pipeline：download → extract → demoparser2 smoke test → manifest → parse parquet。
- **不做绕 Cloudflare 的全自动爬虫**；manifest URL 半自动维护（手动或 C9WIN/CS Demo Manager 辅助拉取）。

## Phase D1 — 职业样本 v0

采集第一批 100–200 张 map-demo，算出各账户分布，为 R1 提供数据。

- 数据源：**HLTV 职业 GOTV demo**（CS2 MR12 时代，2025–2026）。
- 赛事：Tier-1 LAN（Major、IEM、BLAST、ESL Pro League 等）；淘汰赛 > 小组赛 > 预选赛。
- 队伍：覆盖 HLTV Top 5/10/20/30，避免"职业均值 = 冠军队均值"偏差。
- 地图：优先 Mirage/Inferno/Nuke/Ancient/Anubis/Dust2/Train，补地图平衡再补队伍平衡。
- 排除：加时异常、技术重赛、过旧 CS:GO demo。

## 阶段 R — 评分参照系重设计（固定职业基准）★ 下一步重点

当前 RR v2 的归一化是**赛季相对**（在被分析这批人内部 z-score），导致分数不可移植、单 demo 无法绝对评分。
目标：换成**固定职业基准**——从大量职业 demo 冻结一条标准曲线，1.0 = 职业平均，任意 demo 对同一把尺子量。
玩家向整体方案见 [rating-model.md](design/rating-model.md)「当前方案 vs 未来方案」。

- **R0**：把 cohort z-score 换成 normalizer strategy 接口（`cohort_normalizer` / `frozen_pro_baseline_normalizer`），接口先用现有 55 场跑通。
- **R1**：用 Phase D1 职业样本算出五账户分布，percentile mapping / sigmoid 曲线，冻结进 `rr-v2-pro-baseline.json`。单 demo 即可出绝对 RR，不依赖 cohort。
- 归一化形状：percentile mapping 或 sigmoid（非裸 z-score），尾部天然饱和；职业均值 1.0，优秀段 1.2–1.35，极端值饱和 ~1.5–1.6。
- combat↔账户残差关系也从职业数据拟合、冻结（不再 per-cohort 拟合）。
- 评分变绝对可移植：RATING 用职业基准，PRISM 仍 cohort 相对（风格本就相对）。
- 天梯均值落 0.8–0.9 是有意为之（向职业看齐）；友好化放展示层，不污染模型。
- 基准曲线加版本标签（`pro_baseline_cs2_2025H2_v1`），经济/地图/枪械大版本更新时重新冻结。

边界：这是**权重校准（阶段 5）的前置**——在赛季相对模型上调权重会白费，先把参照系换成固定的。

## 阶段 3 — 富事件账户增强 + 包点目标

- **damage-context**：用 `victimHealthBefore` / `armorDamage` / `hitgroup` 做 damageByBuyDelta、overkill、有效 vs 浪费伤害、部位命中率。
- **包点目标**：`bombs.site` 已是 `"a"|"b"`，**包点归属零成本**，不需要地图多边形。
  > 订正：旧版本路线图曾假设"先标 polygon 才知道在哪个点"，是错的。polygon 只服务 mid/ramp 这类**非包点**区域（阶段 4）。
- **武器/经济**：用 `player-economies.primaryWeapon` / `startMoney` / `moneySpent` 做武器组合与起手枪经济纪律。

边界：先进**赛后复盘和 PRISM 风格轴**，不进 RR 总分。

## 阶段 4 — 地图语义层 + 空间分析（设计见 [map-control.md](design/map-control.md)）

`@cs2dak/maps` 现已补上 zone 几何（`zoneAt` / `pointInPolygon` / `ACTIVE_DUTY_MAPS`）。
24 场 spike 给出做这块的实证：被 v2 压低的是 Jame/sh1ro 这类「死亡不被换的独自控空间」选手，
Trade 账户看不见他们的控图价值——地图控制账户正是补这个缺口。

- **区域多边形标定**（唯一人工步骤）：`packages/maps/map-zones/<map>.json`，7 图（train 已出池）。
  格式 + 模板见 `packages/maps/map-zones/README.md` 与 `de_mirage.template.json`。
- **Area v1**：区域占有 / 首控时间 / 丢失时间 + `soloSpaceSeconds`（Trade 盲区代理）。
- **Utility Block v1**：smoke/molly 的封锁秒数（用 `grenades.destroyTick`）。
- **Aim v1**：用 `shots` 的 yaw/pitch/velocity 做急停、扫射、preaim（重，最靠后，不依赖 zones）。

## 阶段 5 — 权重校准 + Round Swing（远期）

- 200–500 场后，对照人工 MVP / 胜负 / 主观评分手调先验权重；先稳健回归，不急 ML。
- 1000+ 场后才考虑 Round Swing，且先导出特征表 + 简单 logistic win-probability，不一上来做复杂事件模型。

---

## 目标架构（end state）

最终想达到的形态，roadmap 各阶段都是朝它收敛：

```text
.dem
 └─ python/src/cs2dak ──► cs2-demo-format/2.0 ZIP（富事件 + 时空，已就位）
                                     │
              ┌──────────────────────┴───────────────────────┐
              ▼                                               ▼
   @cs2dak/core（单场）                          @cs2dak/cohort（跨场 · 新层）
   ├─ RR v1 / v2（含 damage-context、包点）        ├─ 整季 cohort 汇总
   ├─ 单场 PRISM 预览                              ├─ 跨人 z-score → PRISM（真）
   ├─ Area / Utility / Aim（经 maps 语义层）        ├─ 赛季级 league-mean 锚定
   └─ AnalysisBundle → DemoViewModel               └─ 选手赛季画像 / 排名
              │                                               │
              └───────────────► 产品适配（RivalHub / Insight Agent）◄───┘
```

四个关键终态：
1. **core 把富事件吃干净**：damage-context、包点目标、武器经济都进信号层。
2. **cohort 层存在**：PRISM 和赛季 RR 锚定从"单场预览"升级为"整季可比"。
3. **maps 有区域语义**：Area / Utility delay / Aim 落地，先服务复盘与 PRISM 风格轴。
4. **权重经过校准**：从未校准先验 → 赛事数据相对校准 + 对照验证，分数可对外。

---

## 现状速查

| 能力 | 状态 |
|---|---|
| RR v1（box-score） | ✅ 可用 |
| RR v2-lite 五账户 | ✅ 可用（权重为未校准先验） |
| buyDelta / manState context | ✅ 已实现并接线（阶段 0 补了 null 语义） |
| clutch 超额（实际−期望） | ✅ 已实现（无 shrinkage，见 rating-model.md） |
| per-match 锚定 | ✅ 阶段 0 完成 |
| 接线已有真值（combatDeath/bombDeath/wallbang/noScope 表达…） | ✅ 阶段 1 |
| confidence 字段 | ✅ 阶段 1 |
| 导出器回合边界体检 | ✅ 阶段 1（pre-freeze world self-death 已过滤，fixture QA=0） |
| 跨场 cohort 层（PRISM 真 + 赛季锚定） | ✅ 阶段 2 |
| Demo Lake（manifest + ingestion pipeline） | ⬜ Phase D0 |
| 职业样本 v0（24 张 Tier-1 LAN map-demo spike） | ✅ 已采集（`fixtures/output/pro-spike/`，扩样中） |
| **R0：FrozenProBaselineNormalizer（单 demo 绝对评分）** | ✅ rival-rating 实现 + 单测 + 端到端验证（待 re-pin 接线） |
| **R1：冻结职业曲线（权威 v1）** | 🟡 v0 provisional 已冻结；待扩样 + 尾部饱和 |
| damage-context / 包点目标 | ⬜ 阶段 3 |
| 地图语义层 zone 几何（zoneAt/pointInPolygon） | ✅ `@cs2dak/maps`（阶段 4 基础） |
| 区域多边形标定 / Area / Utility delay / Aim | ⬜ 阶段 4（标定待人工，计算设计已定，见 map-control.md） |
| 权重校准 / Round Swing | ⬜ 阶段 5 |
