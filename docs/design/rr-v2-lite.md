# 设计：RR v2-lite（价值账户模型）

> 定位：**单场**、含上下文的贡献评分。v2 的原创主张所在。
> 注意："Account" 是**会计账本 / 价值账户**的隐喻（分类记账），**不是跨赛季玩家账号**。
>
> 公式所有权：[`@rivalhub/rival-rating`](https://github.com/Starfie1d1272/rival-rating)
> 的 `computeValueAccountsRR`（model id `value-accounts-v2-lite`），权重见
> `weights/rr-value-accounts-v2-lite.json`，模型叙述见该仓库 `docs/rr-v2.md`。
> 本 kit 负责**信号派生 + 接线 + 锚定 + 展示**。

## 核心主张：证据层与价值层分离

```
AccountSignalsV2  = 事实证据（发生了什么、在什么上下文里发生）   ← 本 kit 派生
weights JSON      = 价值判断（一次击杀值多少分）                ← rival-rating 拥有
computeValueAccountsRR = 可替换的解释器
```

好处：demo 解析成本高、调参成本低。证据层够原始，就能**不重跑 demo、只重算分**，
同一份数据跑多套权重对比、回滚、按赛事配不同 profile。

## 链路

```
DemoPackage
  → deriveAccountSignalsV2()              [core] 重建五账户证据 + context 分桶
  → computeValueAccountsRR(sig, weights)  [rival-rating] → RRResultV2（锚定前）
  → computeAccountRatingsV2() 内做 per-match 锚定   [core]
  → buildScoreboard()                      [core] → accountRR / accountBreakdown / accountContextStatus
```

## 五账户（`AccountSignalsV2`）

| 账户 | 记录什么 | accountWeight |
|---|---|---|
| Combat | K/D/A、有效伤害、多杀、首杀、爆头、穿墙 + 两个 context 分桶 | 1.0 |
| Trade | tradeKill / tradedDeath / untradedDeath / tradedOpeningDeath | 0.5 |
| Clutch | 1v1–1v5 各局面次数+胜负 | 0.4 |
| Utility | flashAssist / 致盲敌方秒 / 致盲队友秒 / 道具伤害 | 0.3 |
| Objective | 下包 / 拆包 / 下包转化获胜 | 0.1（刻意压低，噪声大） |

形状（lite 版，线性透明）：
`RR_raw = intercept + Σ_account accountWeight · accountRaw`，每个 `accountRaw` 是该账户信号的 per-round 加权和。

### Combat 的两个 context 乘子（v2 区别于 v1 的核心）

Combat 击杀项再乘 `combatContextFactor = buyDelta乘子 × manState乘子`：

- **`killsByBuyDelta`**（[core] `buildKillsByBuyDelta`）：按击杀时双方装备价值差分桶，
  阈值 ±1000。以弱打强 ×1.35，以强凌弱 ×0.8。
- **`killsByManState`**（[core] `buildKillsByManState`）：按击杀顺序重建存活人数差分桶。
  人数劣势击杀 ×1.2，人数优势 ×0.9。

乘子只作用于"已分类"的击杀（除以桶内总和而非 kills），分桶不完整也不会把乘子拖向 0。

### Clutch：实际 − 静态期望

`clutchExcess = Σ (won − count · expectation)`，期望表 `1v1=0.5 … 1v5=0.01`。
赢 1v3 贡献 +0.9，输 1v3 仅 −0.1，自动实现"赢难局加分多、输难局扣分少"。

> ⬜ 已知缺口：**无 shrinkage**。单场小样本里一个 1v3 仍可能偏噪声（目前只靠 `/rounds`
> 压制）。未来加 `excess × opportunities/(opportunities+k)`，见 [roadmap](../rr-roadmap.md) 阶段 4。

## missing vs zero（阶段 0 修复）

context 分桶区分两种状态，**这是 v2 可信展示的前提**：

| 状态 | 含义 | 评分 | 展示 |
|---|---|---|---|
| `null` | 数据源缺失（parser 未产出） | 乘子降级 1.0 | "未启用" |
| `{0,0,0}` | 源在，但该选手无相关样本 | 正常参与（和为 0） | "无相关样本" |
| 有分桶 | 采集且可用 | 正常修正 | 展示分桶贡献 |

判定（[core] `deriveAccountSignalsV2`）：
- `killsByBuyDelta` → `null` 当 `pkg.playerEconomies` 为空。
- `killsByManState` → `null` 当 `pkg.rounds` 为空。

下游 `accountContextStatus.{buyDelta,manState}` 读这两个分桶是否为 null，产出 `"available" | "missing"`。

## 锚定（阶段 0 新增）

`weights.anchor.mode === "league_mean"`：`computeAccountRatingsV2` 跑完整场所有选手后，
调 `computeLeagueMeanV2` 算均值，整体 `× (1/mean)`，使 `accountRR` 的 **1.00 = 本场均值**。

> ⚠️ 本层一次只处理单场，所以"联赛均值"= **per-match** 均值。真正的赛季级锚定需要跨场
> 聚合层（不属于单场 `analyzeDemoPackage`），见 [roadmap](../rr-roadmap.md) 阶段 2。
> 后果：当前 `accountRR` 是"场内相对位置"，跨场绝对可比性尚未建立。

## 输出（`PlayerScoreboardRow`）

| 字段 | 含义 |
|---|---|
| `accountRR` | 锚定后 RR，1.00 = 本场均值 |
| `accountRRRaw` | 锚定/clamp 前原始分（调试） |
| `accountCombatContextFactor` | combat context 乘子（1.0 = 未生效/降级） |
| `accountBreakdown` | 五账户加权贡献（和 = `accountRRRaw − intercept`），解释面板用 |
| `accountContextStatus` | `{ buyDelta, manState }` 可用性 |
| `confidence` / `fieldAvailability` | 单场数据源完整度；不参与 RR 公式 |
| `combatDeathCount` / `bombDeathCount` / `wallbangKillCount` / `noScopeKillCount` / `throughSmokeKillCount` | v2 ZIP 真实字段表达；公式是否消费由后续权重阶段决定 |

## 校准状态（务必知情）

权重是**凭游戏理解的未校准先验**，仅供管道跑通 + 相对排序。**信号更丰富 ≠ 权重更可信。**
当前分数只有更好的相对区分力，不是绝对准确——**别用它给选手发正式分**。
可信度三步：① 先验（现状）② ~50 场相对校准 + 联赛锚定 ③ ratingPro / 主观评分对照。

## 现状与 TODO

- ✅ 五账户、两个 context 乘子、clutch 超额、per-match 锚定、missing/zero 区分均已落地。
- ✅ `confidence` 字段（阶段 1）：表达数据源完整度，不参与公式。
- ⬜ 赛季级锚定（阶段 2）。
- ⬜ **damage-context**：用 `damages.victimHealthBefore` / `armorDamage` / `hitgroup` 做
  damageByBuyDelta、overkill、有效 vs 浪费伤害（阶段 3）；优先于 Round Swing。
- ⬜ **包点目标零成本**：`bombs.site` 已是 `"a"|"b"`，objective 账户可直接按包点细分，
  无需地图多边形（阶段 3）。
- ⬜ clutch shrinkage（阶段 5）。
