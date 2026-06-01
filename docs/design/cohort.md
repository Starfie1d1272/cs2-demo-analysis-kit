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

### AccountSignalsV2

`AccountSignalsV2` 是原始计数 + `rounds` 分母，赛季聚合直接逐字段相加：

- kills / deaths / assists / damage / opening / multi-kill / clutch / objective / utility：相加。
- `rounds`：相加。
- context 分桶：某场为 `null` 表示数据源缺失，该场不计入；只要至少一场有真值就输出相加后的分桶，全部缺失才输出 `null`。
- context 状态升级为 `"available" | "partial" | "missing"`，用于 season row 展示。

### RRIndicators

`RRIndicators` 混有计数和 rate，不能直接平均。赛季聚合采用"先汇总计数，再重算 rate"：

- 计数类字段相加。
- `totalRounds` 相加。
- `kpr/dpr/apr/adr/*Rate/*PerRound/百分比` 由汇总后的计数和总回合重算。
- 真缺失字段保持 `null`；nullable count 字段只在至少一场有值时相加，否则仍为 `null`。

## 输出

`SeasonCohortBundle` 由 `@cs2dak/contract` 定义：

- `version`: `"cs2-demo-analysis-kit/season-0.1"`
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
