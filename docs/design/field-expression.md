# 设计：真实 ZIP 字段表达

> 定位：把 `cs2-demo-format/2.0` 真实 ZIP 中已经存在的字段，明确映射到当前分析输出。
> 本文件回答两个问题：哪些字段已经被消费，哪些字段只是设计好、留到后续阶段。

## 原则

- `@cs2dak/contract` 是输出形状的单一真相源。
- `@cs2dak/core` 只做字段派生与表达，不改 `@rivalhub/rival-rating` 公式。
- 真缺失保持 `null`；数据源缺失和真实 0 分开表达。
- 真实 ZIP 可直接给出的聚合真值优先于事件侧估算。

## 当前已接线

### player-stats.json

| 字段 | 当前表达 | 说明 |
|---|---|---|
| `combatDeathCount` | `RRIndicators.combatDeathCount`, `scoreboard.combatDeathCount` | 替代旧的总 deaths 近似。 |
| `bombDeathCount` | `RRIndicators.bombDeathCount`, `scoreboard.bombDeathCount` | 替代旧的硬写 `null`。 |
| `wallbangKillCount` | `RRIndicators.wallbangKillCount`, `scoreboard.wallbangKillCount` | 优先用真值；无 stats 时回退 `kills.penetratedObjects > 0`。 |
| `noScopeKillCount` | `scoreboard.noScopeKillCount` | `RRIndicators` 上游类型暂未包含该字段，先在 scoreboard 表达。 |
| `collateralKillCount` | `scoreboard.collateralKillCount` | 当前只表达，不进公式。 |
| `bombPlantCount` / `bombDefuseCount` | `scoreboard.bombPlantCount` / `scoreboard.bombDefuseCount` | Objective 真值表达。 |
| `enemyFlashDurationSeconds` / `teamFlashDurationSeconds` | `RRIndicators` 道具字段 | 优先用 player-stats 真值。 |
| `flashAssistCount` | `RRIndicators.flashAssistCount` | 优先用 player-stats 真值。 |

### kills.json

| 字段 | 当前表达 | 说明 |
|---|---|---|
| `throughSmoke` | `scoreboard.throughSmokeKillCount` | 当前只表达，不进公式。 |
| `noScope` | `scoreboard.noScopeKillCount` fallback | 无 player-stats 时回退事件侧计数。 |
| `killerActiveWeapon` | AWP/sniper 判定候选 | 真实样本里当前为实体 handle 数字，不是武器名；只有值像武器名时才使用，否则回退 `weapon`。 |
| `weapon` | AWP/sniper fallback | 当前 fixture 的可靠武器名来源。 |

### bombs.json

| 字段 | 当前表达 | 说明 |
|---|---|---|
| `site` / `siteId` | 设计已确认，阶段 3 接 objective site 细分 | 包点归属不需要地图 polygon。 |
| `plant_begin` / `dropped` / `picked_up` | timeline | 已进入事件时间线。 |

## Confidence

`PlayerScoreboardRow.confidence` 是单场输出可信度，不参与 RR 公式：

```
confidence = average(playerStats, economy, rounds, richKills, damages, bombs)
available = 1, partial = 0.5, missing = 0
```

`fieldAvailability` 同步输出每个源的状态。当前真实 fixture 中 `richKills = "partial"`，因为
`throughSmoke/noScope/penetratedObjects` 可用，但 `killerActiveWeapon` 是实体 handle 数字，不能当武器名使用。

## 已设计但未接线进公式

| 数据源 | 字段 | 阶段 | 用途 |
|---|---|---|---|
| `damages` | `victimHealthBefore`, `victimHealthAfter`, `armorDamage`, `hitgroup` | 阶段 3 | damage-context：有效/浪费伤害、部位命中、低血量收割。 |
| `bombs` | `site` | 阶段 3 | Objective 按 A/B 包点拆分。 |
| `player-economies` | `primaryWeapon`, `startMoney`, `moneySpent` | 阶段 3 | 武器/经济纪律、起枪质量。 |
| `shots` | yaw/pitch/velocity | 阶段 4 | Aim：急停、扫射、preaim。 |
| `positions-1s` / `replay` | 轨迹 | 阶段 4 | Area / Utility block / 空间复盘。 |

## 仍需上游确认

- `killerActiveWeapon` 当前像实体 handle，而不是规范武器名。core 已做防御性回退；如果 exporter 后续能输出稳定武器名，AWP/sniper 判定会自动优先使用它。
- `kills.tick_outside_round` 仍有 2 个 QA error，需单独判断是 exporter 回合边界归属问题还是 QA active window 过严。
