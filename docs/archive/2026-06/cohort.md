# 设计：跨场 cohort 聚合层

> 定位：**赛季级**聚合层。它让 RR v1 / RR v2 从"单场相对位置"升级为"跨场可比"，也让 PRISM 的 cohort 从场内 10 人升级为整季所有选手。

## 边界

`@cs2dak/cohort` 是纯函数层：

```
Array<{ matchId, pkg: DemoPackage }> + optional identityMap
  → @cs2dak/core 单场派生
  → 跨场按 playerKey 聚合
  → @rivalhub/rival-rating 公式
  → SeasonCohortBundle
```

它不做文件 I/O，不解析 `.dem`，不改 `@rivalhub/rival-rating` 公式，不碰 Python seam，也不直接读取 RivalHub 数据库。读 ZIP 目录、写 JSON、传入身份映射属于 `@cs2dak/cli` 或产品适配层。

## 身份归并

demo ZIP 只能可靠提供 `steamId64`，但比赛规则允许借用网吧账号。RivalHub 侧已经有 Steam alias / user 绑定，真正稳定的赛季身份应是网站的 `userId`，不是 demo 里的单个 SteamID。

因此 cohort 层使用 `playerKey` 聚合：

- 默认无外部身份时：`playerKey = "steam:<steamId64>"`，行为等同按 SteamID 聚合。
- 有身份映射时：调用方传入 `identityMap[steamId64] = { playerKey, userId, displayName }`。
- `playerKey` 是聚合主键；`steamIds` 保留该选手赛季内使用过的所有账号；`primarySteamId64` 仅作兼容和调试。

RivalHub 对接时由网站从 `users.steam64` 和 alias 绑定表生成 `identityMap`，本仓库只消费显式映射。这样借号规则可审计，也避免本 kit 反向依赖 RivalHub 数据库。

## 为什么优先做

PRISM 的 z-score 本质上要求 cohort；单场 `analyzeDemoPackage` 只能拿场内 10 人做相对比较，所以现在只是预览。赛季 RR 同理：per-match 锚定只能说明"这场里相对平均"，不能说明"整个锦标赛里相对平均"。

因此阶段 2 是当前最高优先级：它是 PRISM 真正可用、赛季排名可解释的共同前置。

## 聚合语义

### RRSignals

`RRSignals` 是六账户原始事实 + `rounds` 分母，赛季聚合直接逐字段相加：

- combat / trade / mapControl / utility / clutch / objective 的计数字段：相加。
- `rounds`：相加。
- nullable 空间/context 字段：某场为 `null` 表示数据源缺失，该场不计入；只要至少一场有真值就输出相加后的字段，全部缺失才输出 `null`。
- context 状态升级为 `"available" | "partial" | "missing"`，用于 season row 展示。

### RRIndicators

`RRIndicators` 混有计数和 rate，不能直接平均。赛季聚合采用"先汇总计数，再重算 rate"：

- 计数类字段相加。
- `totalRounds` 相加。
- `kpr/dpr/apr/adr/*Rate/*PerRound/百分比` 由汇总后的计数和总回合重算。
- 真缺失字段保持 `null`；nullable count 字段只在至少一场有值时相加，否则仍为 `null`。

## 输出

`SeasonCohortBundle` 由 `@cs2dak/contract` 定义：

- `version`: `"cs2-demo-analysis-kit/cohort-1.0"`
- `matchCount`
- `players`: 按赛季 `accountRR` 降序排列
- `weightsVersion`

每个 `SeasonPlayerRow` 包含：

- `playerKey`, `steamIds`, `primarySteamId64`, `externalUserId`, `name`, `teamKeys`
- `mapCount`
- `rrV1`, `rrV1Percentile`
- `indicators`: 赛季级 `RRIndicators`，用于调试、PRISM 解释和下游展示
- `accountRR`, `accountRRRaw`, `accountBreakdown`
- `accountContextStatus`
- `prism`
- `confidence`
- `perMatch`: 每场 RR 明细

## Confidence

先用可解释的轻量公式：

```
confidence = 0.7 * completeness + 0.3 * sample
sample = mapCount / (mapCount + 3)
completeness = availableContextDimensions / totalContextDimensions
```

context 维度先取 `killsByBuyDelta`、`killsByManState` 两项。`partial` 按 0.5 计，`missing` 按 0 计。这个字段只表达数据可信度，不参与 RR 公式。

## CLI

`@cs2dak/cli` 增加：

```
cs2dak cohort <zip-dir> --out <season-cohort.json> [--identity-map <identity-map.json>]
```

CLI 读取目录下所有 `.zip`，按文件名排序，`matchId` 使用文件名 stem，调用 `buildSeasonCohort` 后写 JSON。`identity-map.json` 是一个 `steamId64 -> playerKey | { playerKey, userId, displayName }` 的映射文件。

## 账户归一化（z-score 标准化）

### 问题

六账户的 raw 量级天然差很大：combat 每回合发生（÷rounds 后仍 O(0.4)），
clutch/objective 是稀有事件（÷rounds 后 O(0.001)）。线性相加 `Σ accountWeight·raw`
时 combat 碾压其余四账户，`accountWeight` 先验（combat 1.0 / trade 0.5 / clutch 0.4 /
utility 0.3 / objective 0.1）形同虚设。

实测（55 场、57 人，修复前 accountBreakdown 跨选手 std）：
`combat 0.172 / trade 0.016 / clutch 0.004 / objective 0.001 / utility 0.011`
——trade/clutch/utility/objective 近乎死信号，v2 退化成纯 combat ≈ v1。

### 修复：标准化 + 残差化（公式归属 `@rivalhub/rival-rating`）

标准化与残差化本质都是 cohort 级操作（要有一群人才能定相对位置 / 拟合正交化）。这套**数学已迁入
rival-rating 的 `computeCohortAccountsRR`**（公式唯一真相源）；本 cohort 层只负责把
`std(rrV1)` 作为 `targetStd` 传进去。逻辑如下：

1. 反推每账户未加权 raw = `accountBreakdown[a] / accountWeight[a]`，跨选手 z-score → `z_a`。
2. **combat 作主干**（`zc = z_combat`）。
3. **其余账户残差化**（消除与 combat 的共线，避免双重计分）：
   `zr_a = standardize(z_a − corr(z_a, zc)·zc)`——只保留"超出你 fragging 水平的团队增量"。
4. `composite = w_combat·zc + Σ_{a≠combat} w_a·zr_a`。
5. `scale = std(rrV1)/std(composite)`；`accountRR = clamp(1.0 + scale·composite, ≥0.1)`；
   `accountBreakdown[a] = scale·w_a·used_a`。

当前 rr `0.2.0` 六账户已包含 `mapControl`。若 ZIP 还没有正式空间信号，
`mapControl` 和部分 utility spatial 字段保持 `null`，模型会把对应 raw 记为 0；
后续空间派生接入后无需再改评分接口。

### 为什么是残差化（55 场 ratingPro/WE 校准实证）

用桌面 `rival_rating_calibration.csv`（480 行 / 55 名 steam64 / 37 场的 OCR ratingPro + WE）
按 steam64 在赛季级做了真校准实验：

- **整体评分 ≈ combat**：combat 单独 corr(ratingPro)=0.90；ratingPro/WE 本身就是 combat 主导。
- **非 combat 账户信号弱且共线**：clutch 单独 corr 0.46 但与 combat 共线 0.56；trade 0.21 / utility 0.11 /
  objective −0.02（噪声）。
- **残差化后，正交团队增量对 ratingPro/WE 的边际预测力 ≈ 0**（残差 standalone corr 全部 ≈0）。

结论：**combat 是数据强制的主干；非 combat 权重是刻意的价值选择（识别团队贡献），ground truth 给不出授权。**
残差化保证这部分至少是"剔除 fragging 后的纯增量"、不双重计分，但它的大小由产品价值观决定，不是回归出来的。

代价（须知情）：`corr(accountRR, ratingPro)=0.68` < `corr(rrV1, ratingPro)=0.90`——v2 刻意加入的团队增量
相对 ratingPro 等同噪声，会把选手推离市场（ratingPro）排名。**信 v2 = 信"市场低估了团队价值"这个主张。**

> ⚠️ 范围：本修复在 **cohort（赛季）** 层。`@cs2dak/core` 的 **per-match** v2 仍是旧线性相加，
> 存在同样的 combat 碾压；per-match 残差化要用场内 10 人 cohort，留作后续（见 rating-model.md）。

> ⚠️ 仍未做的：① 残差化只对 combat 正交，账户间残余共线（trade↔clutch 等）未消，完整版需 Gram-Schmidt；
> ② 赛季级粒度 + 无 `match_id↔demo` 映射 → ratingPro 只能按 steam64 聚合；拿到 per-match 映射后可做更细校准。
