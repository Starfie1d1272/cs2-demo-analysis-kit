# 教练工作台回合计划重构设计

日期：2026-06-18

## 目标

把教练工作台从“开局模式 + 单一进点时间桶”升级为面向备赛的回合计划分析，同时保持所有结论可回到 v3 ZIP 的真实字段和回放证据。

本设计只使用 `cs2-demo-format/3.0` 已提供的经济枚举：

```ts
type EconomyType = "pistol" | "eco" | "semi" | "force" | "full";
```

不得新增 `gun`、`half_buy`、`unknown` 等基础经济枚举，也不得根据产品文案改写 ZIP 原值。

## 已确认的产品口径

1. UI 一级入口使用“长枪局”，不使用“对长枪”。
2. `full` 完全按 ZIP 中的 `full` 使用，不单独识别转换局或反转换。
3. Anti-eco 是双方原生经济组合产生的备赛视图，不是新的基础经济类型。
4. 时间桶描述集体进点发生的时间，不代表战术启动时间。
5. “爆弹”“假打”“夹击”等名称必须有独立证据，不能只根据进点时间命名。

## 分层架构

### 1. 权威事实层

`TacticalRoundFact` 升级为 v6，直接保存当前分析主体和对手的 ZIP 原生经济：

```ts
interface TacticalRoundFact {
  analysisVersion: 6;
  ownEconomy: EconomyType;
  opponentEconomy: EconomyType;
  ownLoadout: TeamLoadoutSummary;
  opponentLoadout: TeamLoadoutSummary;
  // 其余 opening、entry、grenade、C4、combat 字段保持结构化保存
}

interface TeamLoadoutSummary {
  equipmentValue: number;
  moneySpent: number;
  primaryWeapons: Record<string, number>;
  armoredPlayers: number;
  helmetPlayers: number;
  defuseKits: number;
  grenades: Record<string, number>;
}
```

`ownEconomy` 和 `opponentEconomy` 必须直接读取 `rounds.json` 的 `teamAEconomy` / `teamBEconomy`。`TeamLoadoutSummary` 只汇总 `player-economies.json` 的现有字段。

删除 Studio 当前的 `economyTypeFor()` 二次多数投票以及缺失时回退 `full` 的行为。缺失数据应保留为无法分析状态，不得伪装成长枪局。

### 2. 备赛语境层

备赛入口是对原生双方经济的查询投影，不写回事实：

| UI 入口 | 判定 |
|---|---|
| 手枪局 | `ownEconomy === "pistol"` |
| 长枪局 | `ownEconomy === "full" && opponentEconomy === "full"` |
| Anti-eco | `ownEconomy === "full" && opponentEconomy` 为 `force`、`semi` 或 `eco` |
| 强起 | `ownEconomy === "force"` |
| 半起 | `ownEconomy === "semi"` |
| Eco | `ownEconomy === "eco"` |

强起、半起和 Eco 入口保留对手经济 badge 与筛选，不把对手经济压缩成新的枚举。`full` 不附加转换局或反转换语义。

### 3. 战术判断层

时间桶采用第二名队员进入目标包点时的回合剩余时间：

```ts
if (seconds > 100) return "rush";
if (seconds > 80) return "fast";
if (seconds > 55) return "execute";
if (seconds > 35) return "slow";
return "late";
```

展示名为：

| 字段 | 展示 |
|---|---|
| `rush` | `Rush A/B` |
| `fast` | `A/B 快攻` |
| `execute` | `A/B 执行` |
| `slow` | `A/B 慢打` |
| `late` | `A/B 压秒` |

时间桶只描述进点节奏。“A/B 爆弹”要求目标区域的烟、闪、火与进点时序形成可审查的道具包证据；阈值必须先通过真实 ZIP 报告校准。“假打”“转点”“夹击”“抱团下包”等判断统一返回：

```ts
interface TacticalInference {
  type: TacticalInferenceType;
  confidence: "low" | "medium" | "high";
  evidence: TacticalEvidenceRef[];
}
```

`TacticalEvidenceRef.type` 同步扩展为可引用 `grenade`、`site-entry`、`c4-route` 和 `combat`，每条引用包含 `matchId`、`roundNumber`、tick 范围及对应实体 ID。判断层不得只返回无法跳转到回放的文字理由。

证据不足时展示基础执行名或“未识别打法”，不输出确定性战术名称。

### 4. 聚类层

聚类身份拆分为三个正交部分：

```text
economyContextKey = ownEconomy + opponentEconomy
openingPatternKey = map + side + coarseSignature + detailedSignature
executionKey      = targetSite + entryStructure + tempo + supportedInferences
```

查询时先按 UI 经济入口分区，再在分区内按开局结构和执行结构聚类。经济不进入 `OpeningPattern`，但不同经济组合的样本、胜率和战术名称不得混算。

聚类 ID 使用稳定的结构化序列化生成，展示名不参与 ID。Playbook 名称和 playlist 继续使用稳定 fingerprint，并为旧 fingerprint 提供一次迁移，避免重建 facts 后丢失人工命名。

## UI 设计

Pattern Explorer 一级入口：

```text
手枪局 | 长枪局 | Anti-eco | 强起 | 半起 | Eco
```

卡片名称由“经济语境 + 战术判断”组合：

```text
长枪局 · A 爆弹
Anti-eco · 对强起 · B 慢清
强起 · B 快攻
Eco · A 抱团下包
```

对手经济作为 badge 和筛选展示，例如“对手全枪全弹”，不使用“对长枪”作为入口或卡片标题。其中“慢清”“爆弹”“抱团下包”只有在判断层提供证据时才出现。否则使用 `A/B 执行`、`A/B 快攻` 等时间事实名称。

右侧证据区展示：

- 双方原生经济类型与装备总值；
- 第二人进点时间及时间桶；
- 目标区域道具组成和时序；
- 开局结构、入口结构与 C4 路线；
- 自动判断的置信度与证据入口。

左侧模式列表移除独立 `68vh` 上限，与中间回放区域等高，列表内容在自身区域滚动。

## 模块所有权

- `@cs2dak/core`：从结构化输入派生 loadout、节奏和战术判断。
- `@cs2dak/cohort`：按经济语境、开局和执行结构聚类并计算统计。
- `@cs2dak/presentation`：备赛入口投影、中文名称和 Coach View Model。
- `apps/dak-studio`：事实持久化、查询编排、筛选与 UI，不拥有共享判断公式。
- `@cs2dak/contract`：继续 re-export `cs2-demo-format`，不 fork 经济类型。

## 数据迁移

1. `TACTICAL_FACT_VERSION` 从 5 升到 6。
2. 旧 facts 不做字段猜测，Studio 明确提示重建。
3. 重建前保存 Playbook 名称和 playlist fingerprint。
4. 重建后按旧结构 fingerprint 映射到新聚类；存在一对多时保留旧名称作为候选，不静默覆盖。

## 验证

### 事实一致性

- 对当前 10 个 fixture ZIP 的每个回合断言 `ownEconomy` / `opponentEconomy` 与 `rounds.json` 完全一致。
- 断言 loadout 汇总等于 `player-economies.json` 对应五名玩家之和。
- 禁止缺失经济回退为 `full`。

### 判断与聚类

- 为五个时间边界分别覆盖等号和相邻秒数。
- 证明相同开局在不同经济组合下保留相同 opening identity，但进入不同备赛分区。
- 没有目标道具证据时不得命名为“爆弹”。
- CT 与 T 的经济语境相对于当前分析主体正确翻转。

### UI

- 六个一级入口的样本数总和等于可分析回合数，且互斥。
- 卡片、证据表和回放选中回合保持同步。
- 左栏和回放底部对齐，长列表在左栏内部滚动。

## 实施顺序

1. 修复事实经济来源并升级 v6。
2. 生成真实 ZIP 的双方经济、装备和道具时序报告；该报告是爆弹等判断阈值进入实现前的人工审核检查点。
3. 落地备赛入口投影和新时间桶。
4. 校准并实现有证据的战术判断。
5. 重构 cohort 聚类与 presentation 命名。
6. 重构 Pattern Explorer、Playbook 和 Anti-Strat。
7. 迁移持久化名称与 playlist，并完成 fixture/UI 验证。
