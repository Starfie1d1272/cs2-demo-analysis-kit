# RR 评分模型（设计 + 实现映射）

> 本仓库 RR 的**唯一**设计文档。合并自旧 `rating-model` / `rr-v1` / `prism` /
> `map-control` / `rating-signal-implementation`（已归档）。
>
> 公式所有权在外部仓库 [`@rivalhub/rival-rating`](https://github.com/Starfie1d1272/rival-rating)
> （`src/types/accounts.ts` 定 schema、`weights/*.json` 定权重、`src/rr/` 算分）。
> 本 kit 只做**信号派生 + 接线 + 锚定 + 展示**。
> 阶段顺序见 [rr-roadmap.md](../rr-roadmap.md)。

---

## 0. 定位三层（别让一个数同时承担四件事）

| 层 | 回答 | 粒度 | 现状 |
|---|---|---|---|
| **RR v1** | 这场数据产出如何 | 单场 | ✅ box-score 基线 |
| **RR 六账户** | 你这场/赛季贡献多少（含上下文） | 单场 / cohort | ✅ 可用；空间账户 = shadow |
| **PRISM** | 你是什么风格 | 跨场 cohort | ✅ 接线（跨场聚合后才严肃） |

铁律：不让任何一个数同时承担「单场表现 / 长期实力 / 风格 / 胜负贡献」。

---

## 1. RR v1（box-score 兼容基线）

**定位**：稳定、可解释、玩家熟悉的赛后基线分；不承担原创主张。核心来自 **HLTV 2.0 社区逆向公式**
（model id `hltv-linear-v1`），价值是兼容性与稳定性——`1.00` 平均、`1.20` 很强、`0.80` 偏低。

> ⚠️ 叙事：不要对外宣称"独立设计 / 不复刻 HLTV"。v1 = 兼容基线。

链路：`buildPlayerIndicators()` [core] 派生 `RRIndicators` → `computeRR()` [rival-rating] → `scoreboard.rr`。
无法精确计算的字段（`awpDuelWinRate` / `roundSwing*`）填 `null`、对应权重 0。
v1 不显式锚定（HLTV intercept 已自带 ≈1.0 刻度）。

---

## 2. RR 六账户（主角）

把贡献拆成六个账户，各管一类行为，按先验权重合成。**让玩家看懂分靠什么挣的。**

```text
RR = 1.00×Combat + 0.40×Trade + (MapControl) + 0.25×Utility + 0.30×Clutch + 0.10×Objective
```

| 账户 | 奖励 | 先验权重 |
|---|---|---:|
| **Combat** | 击杀/伤害/不送/首杀/多杀（纯武器对抗） | 1.00 |
| **Trade** | 补枪、被有效换、死亡可交易性 | 0.40 |
| **MapControl** | 站位/枪线/路线压力创造的**有效空间** | 0.00 shadow → 0.15 → 0.20–0.25 |
| **Utility** | 闪/烟/火/雷的**实际效果** | 0.25 |
| **Clutch** | 残局相对静态期望的超额胜率 | 0.30 |
| **Objective** | 下包/拆包/下包转化 | 0.10 |

### 2.1 Combat（权重 1.0，主干）

```text
原始分 = 0.55×KPR − 0.35×DPR + 0.003×ADR + 0.3×(首杀−首死)/r + 0.4×多杀回合/r + 0.05×穿墙/r
```
击杀项再乘"打架背景"乘子（只作用于击杀）：装备以弱打强 ×1.35 / 以强凌弱 ×0.8；人数劣势 ×1.2 / 优势 ×0.9。
缺导出数据时乘子 = 1.0（不降权）。**有效武器伤害按剩余血量 cap，排除道具/火/炸弹/世界伤害**（与 Utility 去重）。

### 2.2 Trade（权重 0.4）

```text
原始分 = 0.6×补枪/r + 0.3×被成功换/r − 0.25×有效未交易死亡/r
有效未交易死亡 = deaths − tradedDeaths − strategicIsolationDeathCredits
```
`strategicIsolationDeathCredits` 是 Trade 盲区的**闭环修正**（见 §3.3），不是 MapControl 的附属小项——
它抵扣"独控/断后/封路而死、队友够不到"的孤立死亡，避免系统性低估被动 AWP / lurk / anchor。

### 2.3 Clutch（权重 0.3）

```text
净超额 = Σ(实际赢 − 遇到次数 × 期望胜率)，期望：1v1=.5 1v2=.25 1v3=.1 1v4=.04 1v5=.01
clutchScore = 净超额 × clutchCount/(clutchCount+5)   // 小样本收缩
```
奖励"该赢的赢、能偷的偷"，输难局几乎不罚。**不重复奖励残局击杀**（已在 Combat 计）。

### 2.4 Utility（权重 0.25）

结果型（已可用）：`flashAssists`、`effectiveEnemyFlashSeconds`、`teamFlashSuppressionSeconds`（负）、`utilityDamage`。
空间型（actual-effect，见 §3）当前 = shadow null。

### 2.5 Objective（权重 0.1，故意压低）

`plants` / `defuses` / `plantsConverted`（下包后本队赢）。下包常是战术链末端，噪声大，权重最低。
包点归属零成本（`bombs.site` 已是 `"a"|"b"`），不需要多边形。

---

## 3. 空间账户（MapControl + UtilitySpatial）：严格化目标 ★

> **当前状态**：route-callout **proxy 实现已移除**，MapControl/UtilitySpatial 一律发 `null`（shadow，
> 不污染 RR 总分）。`@cs2dak/maps` 的几何地基（route / zone / nav / visibility-BVH / tri）**保留**，
> 作为下方严格重建的底座。本节是重建的**权威目标设计**（吸收自 RR 空间信号设计稿）。

### 3.0 核心原则

1. MapControl 奖励的是**有效空间压力**，不是"独自站位时间"。
2. UtilitySpatial 奖励**实际道具效果**，不是"道具落点看起来高级"。
3. **raw evidence 可以宽，official feature 必须窄**：

```text
Raw Evidence（复盘/shadow，宽）
  → phase / side / objective / utility gates
  → official scoring features（窄）
  → cap + per-round normalize + cohort z + Combat 残差化
  → RR account score
```

4. CT 默认包点站位 ≠ first control；CT 默认架点 ≠ denial（除非敌方已形成路线压力）。
5. T post-plant 也能 denial retake route——denial 不硬编码 CT。
6. save / exit / freeze 阶段默认不进 official。
7. 数据不足返回 `null`，绝不返回 `0`。

### 3.1 回合阶段模型（前置）

每个 tick 标注 `RoundPhase`：`freeze | default | take | execute | postPlant | retake | save | exit | clutch`。
official scoring 排除 `save / exit / freeze`（仍可进 review 层）。

### 3.2 Official MapControl（5 指标，替换旧 proxy）

| 新指标（official） | 替换的旧 proxy | 关键 gate |
|---|---|---|
| `activeSoloPressureSeconds` | `uniqueStrategicControlSeconds` | **ablation**：移除该玩家后团队 frontier/choke/flank 控制确实丢失；且有敌方压力、objective 相关、非 save |
| `firstMeaningfulControlEvents` | `firstControlEvents` | T 首次拿中立/关键 index；CT 仅**前压**到 baseline 以下才算，默认包点不触发 |
| `sidePhaseAwareDenialSeconds` | `routeDenialSeconds` | 必须 `enemyPressurePresent`；强度 = LOS×proximity×objective×phase；双方对称（T 可 denial retake） |
| `nonUtilityAssistedAdvanceUnits` | `teammateAdvanceUnits` | frontier 推进；若发生在己方 utility 生效窗口内则 ×0.4（价值让给 Utility） |
| `strategicIsolationDeathCredits` | （旧写死 null） | 见 §3.3，**接进 Trade** |

`MapRoute` 需补 baseline 元数据：`tBaselineMaxIndex` / `ctBaselineMinIndex` / `neutralIndexRange` / `keyIndex`；
无 baseline 的 route 不进 official，只生 raw。

### 3.3 strategicIsolationDeathCredits（Trade 闭环，P2 最高优先）

> **状态：✅ 已落地（in-repo，无需改 rival-rating）。** `core/spatial/mapcontrol.ts`
> `buildOfficialMapControl` 派生 `activeSoloPressureSeconds`（callout-based MVP ablation +
> 同线敌方施压 + official phase + per-round cap 8s）与 `strategicIsolationDeaths`；
> `signals.ts` 接进 `trade.strategicIsolationDeaths`，rival-rating 的
> `effectiveUntradedDeaths = deaths − tradedDeaths − strategicIsolationDeaths` 自动激活。
> 可观测（有 positions+routes）→ 0 或正 credit；不可观测 → null。

对每次**未被交易**的死亡，回看前 8–10s：若有 `activeSoloPressure` / `sidePhaseAwareDenial` /
刚完成 `firstMeaningfulControl`，且非 save/exit、死亡位置 objective 相关 → 给 0~1 连续 credit
（0 = 普通白给全额受罚；1 = 明确战略孤立基本不罚）。接入：`effectiveUntradedDeaths = deaths − tradedDeaths − credits`。
**只在 Trade 抵扣，不在 MapControl 重复加分**，避免"先扣再补"的解释混乱。

### 3.4 Official UtilitySpatial（5 指标，actual-effect）

> **状态（SP3 v2，2026-06-06）**：zone 多边形 **4/7 图** + nav 拓扑 + tri-BVH 静态视线（4 图本机已下载）
> → `core/spatial/{utility,utility-geometry}.ts` 落地**全部 5 项**几何 actual-effect。
> 手雷归属率 94–98%。进 review/shadow，**未进 RR 评分**（待职业样本校准）。
> 诊断：`pnpm analyze:spatial-coverage`（看覆盖）/ `analyze:utility-rr-impact`（看 RR 影响）。
>
> **tri 仅分析侧加载**（207MB，按需）：production `deriveRRSignals` 不传 tri → 两项 LOS 发 null。

| 指标 | 状态 | actual-effect 判定 |
|---|---|---|
| `actualIncendiaryPathDelaySeconds` | ✅ 强 | 火落通行要道且敌人在场 × 燃烧时长 × 角色权重（缺 destroyTick 按 7s 兜底）。分布最好（%zero 11%） |
| `actualIncendiaryDisplacementEvents` | ✅ 改善 | 敌人火前在 zone、火后 4s 内离开**或掉血**（放宽 1Hz 采样窗口，%zero 74→47%） |
| `actualSmokeSightlineDenialSeconds` | 🟡 LOS | tri-BVH：敌人对 site 静态可见且烟切断该枪线 × 队友利用。**dust2 偏低**（objective 选点被墙挡） |
| `actualSmokeProtectedCrossings` | 🟡 LOS | 队友穿越时被烟挡住敌方原本可见枪线。信号偏弱（~1/场） |
| `actualSmokeIsolationSeconds` | ⚠️ 拓扑敏感 | nav 绕路代价（屏蔽烟覆盖 nav 区后 enemy→site 多走多远）× 时长。**概念弱点：烟只挡视线不挡移动**，开阔图（mirage）绕路恒 0；仅 choke 图出值。候选改造：改为 vision-based 或与 sightline 合并 |

**手雷归属（doc §18，已落地）**：`effectPosition → zoneAt`（不再用"最近 player 的 lastPlaceName" proxy）。
**几何地基**：`utility-geometry.ts`（segment-sphere 相交、nav Dijkstra 绕路、多边形质心），纯函数已单测。

**RR 影响实测（4 图 16 场，shadow 实验性接入 utility 账户）**：道具空间净 ΔRR 很小（mean 0.011，
p90 0.025，无人 >0.05）；远小于 Trade 闭环（孤立死亡，mean 0.033）。corr(ΔRR, 烟火数)=0.27——
nav 绕路把"奖励投掷量"变成"奖励有效封锁"，方向对但被 isolation 拓扑缺陷拉低。结论：**道具空间是
小幅精修，正式进 RR 价值有限，优先级低于 Trade 闭环与 MapControl**。

### 3.5 Cap / 标准化 / 残差化 / Evidence Quality

- **Cap**：per-round（soloPressure ≤ 8s、denial ≤ 10s）+ per-match（≤ rounds×系数），防保守站位刷秒。
- **标准化**：统一转 per-round → cohort z-score。
- **Combat 残差化**：`mapControlResidual = raw − β·combatZ − …`；MVP 简化：advance/firstControl 同 tick 伴随本人击杀则 ×0.5。
- **Evidence Quality**（0~1）：positions1s/routes/zones/nav/staticLos/phase 各加权；< 0.6 不进 official，只进 shadow。

### 3.6 权重 ramp（不要从 proxy 直接进 0.20）

```text
阶段一  MapControl 0.00（official shadow only）          ← 当前
阶段二  strict gates 稳定 → 0.15
阶段三  职业样本验证通过 → 0.20–0.25
```

> 注：上述新 schema（`MapControlSignalsV2` / `UtilitySpatialSignalsV2` + 字段重命名 + 权重）
> 属 `@rivalhub/rival-rating`，是**跨仓库**改动；本 kit 侧负责派生新 official 信号并接线。

---

## 4. PRISM（八维风格画像）

**风格指纹，不是评分。** 跨场 cohort 计算。双编码：雷达图**形状 = 风格**（八轴半径），**颜色 = 水平**（RR 百分位），互不干扰。
八轴：`firepower / opening / clutch / sniping / survival / utility / trading / entry`，对立角色放对角。
每轴 `axis_z = α·z(participation) + (1−α)·z(efficiency)`（α 高 ≈ 纯风格标签，α 低 ≈ 纯水平）+ 冷启动收缩 `z·n/(n+k)`。

> ⚠️ `computePrism` 接整季 cohort 做跨人 z-score；单场只是预览（基准只有场内 10 人）。
> `opening/entry` 去重叠需阶段 4 地图语义层。

---

## 5. 信号 → 评分接线

```text
v2 ZIP → deriveRRSignals(pkg)            [core/signals.ts]
  ├─ buildKillsByBuyDelta / buildKillsByManState        Combat context（缺源发 null）
  ├─ buildTradedOpeningDeaths                            Trade
  ├─ buildObjectiveSignals                               Objective
  ├─ buildUtilitySignals                                 Utility 结果型
  └─ mapControl / utilitySpatial = null                  空间账户 shadow（待 §3 重建）
  → RRSignals[]
  → computeAccountRatingsV2(pkg)         [core/signals.ts]
      ├─ computeRRSixAccounts            单场 raw
      ├─ computeCohortAccountsRR         跨选手 z → Combat 残差化 → 先验加权
      └─ AccountRatingResult[]           → scoreboard.accountBreakdown / accountRR
```

工程归属：信号派生在 `core/signals.ts`；几何资产在 `@cs2dak/maps`；schema/公式/权重在 `@rivalhub/rival-rating`；
产品只消费 `RRSignals` 与 scoreboard，不碰原始事件。

---

## 6. 归一化：当前 vs 未来（1.0 代表谁）

- **当前 — 赛季相对（cohort z-score）**：1.0 = 被分析这批人的均值。问题：不可移植、单 demo 无法绝对评分。
  因权重是未校准先验，必须显式 **per-match 锚定**（`computeAccountRatingsV2` 整场归一）。
- **未来 — 固定职业基准（冻结曲线）★**：1.0 = 职业平均。从大量职业 demo 冻结 percentile/sigmoid 曲线，
  任意 demo 对同一把尺子量、可移植、单 demo 即可绝对评分；尾部天然饱和。天梯均值落 0.8–0.9 是有意为之
  （友好化放展示层，不污染模型）。基准加版本标签（`pro_baseline_cs2_2025H2_v1`）。

---

## 7. Null 策略与校准状态

- `null` = 数据不可观测（模型降级为乘子 1.0，不奖不罚）；`0` = 可观测但无贡献。绝不把 null coerce 成 0。
- **校准状态（务必知情）**：当前权重是凭游戏理解的**先验**，非数据回归。55 场 NJU + OCR ratingPro/WE 验证显示
  整体高度由 Combat 主导，团队账户的独立增量对市场分预测力弱——RR 强调团队是**刻意价值主张**，暂无外部背书。
  **别用于正式定级，先作参考与讨论。**
