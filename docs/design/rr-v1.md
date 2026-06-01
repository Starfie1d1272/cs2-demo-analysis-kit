# 设计：RR v1（box-score 兼容基线）

> 定位：**稳定、可解释、玩家熟悉**的赛后基线分。不承担原创主张——原创放在
> [rr-v2-lite](rr-v2-lite.md) 和 [prism](prism.md)。
>
> 公式所有权：[`@rivalhub/rival-rating`](https://github.com/Starfie1d1272/rival-rating)
> 的 `computeRR`（model id `hltv-linear-v1`）。本 kit 只做信号派生 + 接线。

## 为什么用 HLTV 2.0 逆向公式

校赛平台第一目标不是理论最优，而是上线后玩家觉得"这个分像那么回事"。HLTV 2.0
逆向公式的优势是社区已长期训练过直觉：`1.00` 平均、`1.20` 很强、`0.80` 偏低。

> ⚠️ 叙事注意：v1 的核心公式来自 HLTV 2.0 社区逆向，**不要对外宣称"独立设计 / 不复刻 HLTV"**。
> v1 的价值是**兼容性与稳定性**，不是原创性。

## 链路

```
DemoPackage
  → buildPlayerIndicators()         [core] 派生 RRIndicators（扁平信号袋）
  → computeRR(ind, rrWeightsV1)     [rival-rating] → RRResult
  → rrToPercentile()                [rival-rating] 场内经验百分位
  → PlayerIndicatorRow.rr / .rrPercentile
  → buildScoreboard()               [core] → scoreboard.rr / .ratingSeed
```

### 信号派生（本 kit 的责任）

`buildPlayerIndicators(pkg, facts)` 把 `DemoPackage` 展开成 `RRIndicators`：
KPR / DPR / APR / ADR / KAST / 多杀 / 首杀首死 / 补枪 / 残局 1vX / 狙击 / 道具 / 经济回合分类。
真正无法从当前格式精确计算的字段（`awpDuelWinRate`、`roundSwing*` 等）填 `null`，对应权重设 0，零成本留空。

> ✅ v2.2.0 已有真值：`combatDeathCount`、`bombDeathCount`、`wallbangKillCount`
> 已接入 `RRIndicators`；`noScopeKillCount` / `throughSmokeKillCount` 等先在 scoreboard
> 表达。完整字段映射见 [field-expression.md](field-expression.md)。

### 公式三层（rival-rating 内，本文只述结构）

| 层 | 内容 | 现状 |
|---|---|---|
| Layer 1 | HLTV 2.0 逆向：`kast·c + kpr·c + dpr·c + impact·c + adr·c + intercept` | ✅ 生效 |
| eco 乘子 | 按回合类型分布加权，只作用于击杀项 | ⚠️ 当前系数全 1.0（待 ~50 场校准） |
| Layer 2 | Round Swing：`roundSwingCoef × swing × kpr` | ⚠️ coef=0，透明透传（待 ~1000 场） |

详细系数见 rival-rating 的 `weights/rr-v1.json` 与 `src/rr/compute.ts`。

## 锚定

v1 **不做显式锚定**：HLTV 公式的 `intercept` 已校准到联赛均值 ≈ 1.0，靠公式自带刻度。
（对比：[rr-v2-lite](rr-v2-lite.md) 的权重是未校准先验，所以必须显式 per-match 锚定。）

## 输出

| 字段 | 来源 | 含义 |
|---|---|---|
| `scoreboard.rr` | `round(RRResult.rr, 2)` | clamp 后的 RR 标量 |
| `scoreboard.ratingSeed` | `round(RRResult.rrBase, 2)` | 锚定/swing 前的基础分 |
| `scoreboard.rrPercentile` | `rrToPercentile` | 场内经验百分位 0–100 |
| `playerIndicators[].rr` | `RRResult` | 含 `breakdown`（各分项，可解释性） |

## 现状与 TODO

- ✅ Layer 1 可用，刻度对玩家直觉友好。
- ✅ 接线已有真值（combatDeathCount / bombDeathCount / wallbang；noScope 等在 scoreboard 表达）——roadmap 阶段 1。
- ⬜ 文案去原创化（roadmap 阶段 1）。
- ⬜ eco 乘子、Layer 2 待数据量校准后启用（见 [roadmap](../rr-roadmap.md) 阶段 5）。
