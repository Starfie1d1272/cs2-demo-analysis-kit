# RR / PRISM Roadmap

> 本文件只描述**阶段大致内容与边界**，不展开公式与字段。
> 每个阶段引用对应的设计文档（`docs/design/*.md`），实现细节看那里。

## 定位三层（贯穿所有阶段的边界）

| 层 | 回答的问题 | 粒度 | 设计文档 |
|---|---|---|---|
| **RR v1** | 这场数据产出如何 | 单场 | [rr-v1.md](design/rr-v1.md) |
| **RR v2-lite** | 这场里你的贡献值多少（含上下文） | 单场 | [rr-v2-lite.md](design/rr-v2-lite.md) |
| **PRISM** | 你是什么风格 | 跨场 cohort | [prism.md](design/prism.md) |

铁律：**不让任何一个数同时承担「单场表现 / 长期实力 / 风格 / 胜负贡献」四件事。**
公式所有权在 [`@rivalhub/rival-rating`](https://github.com/Starfie1d1272/rival-rating)；
导出端在本仓库 `python/cs2_demo_exporter`；本 kit 的 TS 侧负责**信号派生 + 接线 + 锚定 + 展示**。

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
详见 [rr-v2-lite.md](design/rr-v2-lite.md)。

## 阶段 1 — 接线已有真值 + 表达

仓库里**真数据被丢在桌上**，schema（cs2-demo-format v2.2.0）已保留、core 却没用。这一阶段零成本提精度。

- **用真值替换近似/占位**（fixture 已支持 TDD）：
  - `combatDeathCount`：现在用总 deaths 近似 → 改用 `player-stats.combatDeathCount` 真值。
  - `bombDeathCount`：现在硬写 `null` → 改用 `player-stats.bombDeathCount` 真值。
  - `wallbangKillCount` / `noScopeKillCount`：用 `player-stats` 真值，去掉 `penetratedObjects>0` 估算。
  - AWP/狙击判定：用 `kills.killerActiveWeapon` 而非武器名启发式。
  - 删除代码里"等 cs2-demo-exporter v2 产出后填入"等**过时注释**——v2.2.0 早已产出。
- **表达去原创化**：v1 定位为兼容基线（box-score baseline），不承担原创叙事；v2 明确标 `lite / uncalibrated / per-match`。
- **`confidence` 字段**：数据完整度 + 样本量，前端据此显示"未启用 / 无样本 / beta"。
- **数据体检（导出器侧）**：当前 fixture（13:8 de_ancient）QA 报 2 个 `kills.tick_outside_round`
  （第 3 回合有 kill tick 落在回合窗口外）——疑似 `python/cs2_demo_exporter` 的回合边界归属问题，需排查。

## 阶段 2 — 跨场聚合层（当前最高优先级 / 进行中）

攒 55 场 → cohort，**让数据真正有意义**。这是 PRISM 与赛季锚定的共同前置，是一个新层（不属于单场 `analyzeDemoPackage`）。

- 跨场 cohort：把多场的选手信号汇总，做跨人 z-score（PRISM 才有意义）。
- 身份主键：默认按 `steamId64`，但支持外部 `identityMap` 归并到同一 `playerKey`，给 RivalHub 的 userId / Steam alias 对接预留正确边界。
- 把"per-match 锚定"升级为**赛季级锚定**（league mean 跨整季）。
- 先做数据质量体检：各指标分布、极值、缺失率（顺带验证阶段 1 的导出器问题是否普遍）。
- 设计入口：[cohort.md](design/cohort.md)。

## 阶段 3 — 富事件账户增强 + 包点目标

- **damage-context**：用 `victimHealthBefore` / `armorDamage` / `hitgroup` 做 damageByBuyDelta、overkill、有效 vs 浪费伤害、部位命中率。
- **包点目标**：`bombs.site` 已是 `"a"|"b"`，**包点归属零成本**，不需要地图多边形。
  > 订正：旧版本路线图曾假设"先标 polygon 才知道在哪个点"，是错的。polygon 只服务 mid/ramp 这类**非包点**区域（阶段 4）。
- **武器/经济**：用 `player-economies.primaryWeapon` / `startMoney` / `moneySpent` 做武器组合与起手枪经济纪律。

边界：先进**赛后复盘和 PRISM 风格轴**，不进 RR 总分。

## 阶段 4 — 地图语义层 + 空间分析

`@cs2dak/maps` 当前只有标定常量 + world→radar。补区域语义后做空间分析。

- `map-zones/de_ancient.json`（非包点区域：mid / ramp / donut / cave …）。
- **Area v1**：区域占有 / 首控时间 / 丢失时间。
- **Utility Block v1**：smoke/molly 的封锁秒数（用 `grenades.destroyTick`）。
- **Aim v1**：用 `shots` 的 yaw/pitch/velocity 做急停、扫射、preaim（重，最靠后）。

## 阶段 5 — 权重校准 + Round Swing（远期）

- 200–500 场后，对照人工 MVP / 胜负 / 主观评分手调先验权重；先稳健回归，不急 ML。
- 1000+ 场后才考虑 Round Swing，且先导出特征表 + 简单 logistic win-probability，不一上来做复杂事件模型。

---

## 目标架构（end state）

最终想达到的形态，roadmap 各阶段都是朝它收敛：

```text
.dem
 └─ python/cs2_demo_exporter ──► cs2-demo-format/2.0 ZIP（富事件 + 时空，已就位）
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
| clutch 超额（实际−期望） | ✅ 已实现（无 shrinkage，见 rr-v2-lite.md） |
| per-match 锚定 | ✅ 阶段 0 完成 |
| 接线已有真值（combatDeath/bombDeath/AWP…） | ⬜ 阶段 1 |
| confidence 字段 | ⬜ 阶段 1 |
| 导出器回合边界体检 | ⬜ 阶段 1（QA 已报 tick_outside_round） |
| 跨场 cohort 层（PRISM 真 + 赛季锚定） | ⬜ 阶段 2 |
| damage-context / 包点目标 | ⬜ 阶段 3 |
| 地图语义层 / Area / Utility delay / Aim | ⬜ 阶段 4 |
| 权重校准 / Round Swing | ⬜ 阶段 5 |
