# 教练工作台回合计划重构设计

日期：2026-06-18

## 目标

把教练工作台从“开局模式 + 单一进点时间桶”升级为面向备赛的回合计划分析。每个战术名称都必须能回到 v3 ZIP、人工地图语义或可审查的派生证据；证据不足时宁可降级为事实描述或“未识别打法”，不能用一个时间桶替代战术判断。

## 已确认口径

1. UI 一级入口使用“长枪局”，不使用“对长枪”。
2. 基础经济严格使用 ZIP 原生枚举 `pistol | eco | semi | force | full`。
3. `full` 完全按 ZIP 原值使用，不识别转换局或反转换。
4. Anti-eco 是 `full` 对 `force | semi | eco` 的查询视图，不是新的基础经济类型。
5. 第二人进点时间只描述集体进点节奏，不生成主战术名称。
6. T 和 CT 使用不同的战术词汇，不能把“爆弹、夹击”等 T 方术语套到 CT。

## 真相源与证据等级

### S0：Demo 原始事实

唯一跨语言真相源是 `cs2-demo-format/3.0` ZIP：

- `rounds.json`：双方经济、阵营、胜负、结束原因；
- `player-economies.json`：金钱、装备价值、武器、护甲、拆包器和冻结期道具；
- `replay.json`：位置、视角、生命、护甲、当前武器、place、闪白和 flags；
- `grenades.json`、`bombs.json`、`kills.json`、`damages.json`、`blinds.json`：事件 tick、参与者和位置；
- `shots.json`、`duels.json`：可选增强证据，不能假定所有 ZIP 都存在。

经济事实必须直接读取 `rounds.json`。不得从五名玩家的个人经济重新投票，也不得在缺失时回退为 `full`。

### S1：地图语义真相

地图语义由三个现有资产共同提供，各自职责不同：

1. `callout-names.ts`：人工维护的中文名和有序 `tendency`。`tendency[0]` 是主要 A/B/Mid 方向，可用于粗粒度区域统计；完整 tendency 才是多方向和过渡区的全部语义。
2. `default-positions.ts`：T/CT 默认位 anchor，负责判断默认站位、开局结构和离开默认位后的推进。
3. `callout-grid`：由 110 场 demo 的坐标与 place 多数表决生成，负责世界坐标到 callout 的近似查询，尤其补全道具 effectPosition 和缺失 place。查询结果必须保留 exact/nearby、confidence、samples 和 distance。

`targetRegionFromCallout()` 当前确实使用人工 `tendency[0]`，数据来源可以信任。需要降级的是“单值 primary region 直接代表本回合战术意图”这一用法，而不是人工 tendency 本身。

### S2：派生事实

由 S0 与 S1 确定性派生，包括：开局连续位置段、默认位分布、前压、进点顺序、C4 停留段、道具时序簇和交火接触。派生事实只回答“发生了什么”。

### S3：战术推断

Rush、爆弹、夹击、假打、转点、慢清、抱团下包等属于推断层。每项推断必须包含置信度和证据引用，并允许没有 primary plan。

## 统一地图语义

core 使用统一地图语义接口，不在不同判断函数里重复压缩 callout：

```ts
interface MapSemantics {
  calloutLabel(mapName: string, callout: string): string;
  calloutTendencies(mapName: string, callout: string): readonly TacticalRegion[];
  primaryCalloutRegion(mapName: string, callout: string): TacticalRegion | null;
  nearestCalloutFromPoint(mapName: string, point: Vec3): LocatedCallout | null;
  defaultAnchorOf(mapName: string, side: Side, callout: string): string | null;
}

interface LocatedCallout {
  callout: string;
  label: string;
  tendencies: readonly TacticalRegion[];
  primaryRegion: TacticalRegion | null;
  origin: "replay-place" | "grid-exact" | "grid-nearby";
  confidence: number;
  samples: number | null;
  distance: number | null;
}
```

来源与语义分开保存：`origin` 说明 callout 如何取得，`tendencies` 说明人工地图语义。已知 replay place 的位置来源可信度为 1；grid 结果沿用资产自身的 confidence、samples 和 distance。

多 tendency callout 不得同时给 A、B、Mid 重复加一票。`primaryRegion` 只参与开局粗统计；C4、道具和转点推断保留完整 tendencies。单段无法消歧时保持 ambiguous，并结合前后明确段、包点事件和队伍行为处理。

## v6 事实结构

`@cs2dak/core` 从 `DemoPackage` 派生产品中立的单回合战术事实，Studio 只负责持久化：

```ts
interface RoundTacticalFactsV6 {
  analysisVersion: 6;
  matchId: string;
  mapName: string;
  roundNumber: number;
  side: Side;
  teamKey: TeamKey;
  ownEconomy: EconomyType;
  opponentEconomy: EconomyType;
  ownLoadout: TeamLoadoutSummary;
  opponentLoadout: TeamLoadoutSummary;
  opening: OpeningControlFact;
  pressure: OpeningPressureEvent[];
  entries: { a: SiteEntryFact; b: SiteEntryFact };
  c4: C4TimelineFact | null;
  utility: UtilityPlanFact;
  combat: CombatContactFact;
  plant: TacticalPlantFact | null;
  planCandidates: TacticalPlanInference[];
  primaryPlan: TacticalPlanInference | null;
}
```

### 经济与装备

`ownEconomy` / `opponentEconomy` 根据当前 teamKey 直接选择 `round.teamAEconomy` / `round.teamBEconomy`。loadout 只汇总对应五名玩家的 `equipmentValue`、`moneySpent`、武器、护甲、拆包器和道具，不反推出新经济类型。

备赛入口是查询投影：

| UI 入口 | 判定 |
|---|---|
| 手枪局 | `ownEconomy === "pistol"` |
| 长枪局 | `ownEconomy === "full" && opponentEconomy === "full"` |
| Anti-eco | `ownEconomy === "full" && opponentEconomy` 为 `force`、`semi` 或 `eco` |
| 强起 | `ownEconomy === "force"` |
| 半起 | `ownEconomy === "semi"` |
| Eco | `ownEconomy === "eco"` |

### 开局控图

保留现有 `buildPlayerTacticalSegments()`、`deriveOpeningPattern()` 和 `deriveOpeningPressure()`，并移动到 core 的标准派生链路。开局窗口默认冻结结束后 30 秒，但作为明确参数保存。

`OpeningControlFact` 保存区域人数、默认 anchor 人数、stacked/split/balanced、完整证据和唯一 dominantRegion。只有某区域人数严格高于其他区域时才产生 dominantRegion；并列或没有明确区域时为 null。dominantRegion 表示开局主要控制方向，不表示最终打点。

### 进点结构

保留每名玩家首次进入 A/B 包点的 tick、进点前最后一个非包点 callout 和进点顺序，并增加：

- `distinctEntryCallouts`：不同入口 callout；
- `entrySpanSec`：首名到最后一名进点的时间跨度；
- `firstEntryRemainSec` / `secondEntryRemainSec`：只作为节奏证据。

不同 callout 不一定代表不同物理入口。在没有人工入口等价表前，“两个不同 entryCallout”只能提供中等置信夹击证据；不能仅凭字符串不同输出高置信“夹 A/B”。

### C4 阶段化轨迹

删除 `startRegion`、`endRegion`、`rotated` 这种由首尾 callout 直接生成的强结论，改为：

```ts
interface C4TimelineFact {
  raw: Array<{
    tick: number;
    carrierIndex: number;
    location: LocatedCallout;
  }>;
  dwells: Array<{
    startTick: number;
    endTick: number;
    durationSec: number;
    callouts: string[];
    tendencies: TacticalRegion[];
    resolvedRegion: TacticalRegion | null;
    carrierIndices: number[];
  }>;
  dominantEarlyRegion: TacticalRegion | null;
  dominantLateRegion: TacticalRegion | null;
  plantSite: "a" | "b" | null;
  plantTick: number | null;
}
```

连续位置先压缩为 dwell。短暂路过、多 tendency 过渡区和换持包者不会单独产生方向结论。只有持续停留达到校准阈值，且明确区域 dwell 对其他方向有足够优势时，才产生 early/late dominant region。转点由推断层结合 C4 dwell、人员投入、道具、进点和下包判断。

### 道具包事实

每颗道具保留 throw/effect tick、位置、callout、完整 tendencies、grid 来源质量和投掷者。道具簇按“共享 tendency + 生效时间接近”聚合，而不是按单个 primary targetRegion 聚合。

grid exact 和高质量 nearby 可参与强判断；低 confidence、低 samples 或距离过远的 nearby 只显示为提示。具体质量阈值和时间窗口先由真实 ZIP 报告给出，再进入实现。

### 交火事实

必选数据使用 kills、damages、blinds 派生首次接触 tick、区域、人数和结果。shots/duels 存在时增强反清、架枪和下枪判断；缺失时相关标签降低置信度或不输出。

## 战术判断通则

```ts
interface TacticalPlanInference {
  type: TacticalPlanType;
  confidence: "low" | "medium" | "high";
  score: number;
  evidence: TacticalEvidenceRef[];
}
```

`TacticalEvidenceRef` 扩展为 position、dwell、transition、grenade、site-entry、c4-route、combat 和 bomb，可定位 match、round、tick 范围及实体 ID。UI 中每个判断都能跳到对应回放证据。

以下规则描述 v1 语义。数值阈值先作为候选，由真实 fixture 报告校准；必须条件和禁止条件不因校准改变。

## T 方战术判断

### Rush A/B

**含义**：冻结结束后立即集中冲击一个包点。

**必须条件**：目标点明确；第二名队员在 1:40 前进入；至少三名队员在短时间内进入同一包点。

**加强证据**：开局人员集中在该方向；C4 early/late dwell 与目标点一致；进点跨度短。

**降级条件**：只有第二人早进点，但其他人没有同步，显示“早期进点”证据而不叫 Rush。多方向试探或 C4 明显不同行时不输出 Rush。

### A/B 爆弹

**含义**：预设道具包与集体进点形成同一轮包点执行。

**必须条件**：目标方向存在时间聚集的有效道具簇；至少包含烟和闪，且总量达到经数据校准的最低值；道具生效窗口与进点相邻；至少两人真实进点。

**加强证据**：火或雷补齐道具包；多名投掷者参与；C4 late dwell 或实际下包与该点一致；grid 落点质量高。

**降级条件**：单颗烟、方向模糊或低质量 grid 落点只能显示“目标区道具”；有进点但道具不足显示基础事实，不叫爆弹。第二人进点处于某个时间桶不构成爆弹证据。

### 夹 A/B

**含义**：至少两条物理入口在接近的时间共同进入同一包点。

**必须条件**：同一包点至少三名进点者；入口来自至少两个可区分入口；首末进点时间跨度不超过校准阈值。

**加强证据**：两路均有多名队员；C4 与目标点一致；入口道具有明确分工。

**降级条件**：只有两个不同 callout 字符串、但尚未证明是两个物理入口时最高为中置信；同一路径上相邻 callout 不得误判为夹击。

### 假打 A 真打 B

**含义**：A 出现有意制造的道具或人员暴露，但主力和 C4 从未真正投入 A，随后直接完成 B 的真实执行。

**必须条件**：假方向存在成组道具或明确人员暴露；假方向真实进点人数很少；另一点至少两人进点或完成下包；C4 late dwell 与真实点一致。

**加强证据**：C4 没有在假方向形成有效 dwell；假方向道具由少数队员完成；真实方向进点同步。

**排除条件**：C4 和主力先在假方向持续停留后再离开，应归入“假打 A 转 B”或“控 A 追 B”，不能叫直接真打。

### 假打 A 转 B

**含义**：队伍和 C4 曾真实投入 A 方向，制造压力或尝试执行，之后整体转向 B。

**必须条件**：C4 在 A 方向形成持续 dwell；A 有道具、人员投入或接触；后段 C4、多人进点或下包明确转到 B。

**加强证据**：A 未下包；人员从 A 方向连续迁移到 B；B 最终形成集体进点。

**降级条件**：只有 C4 首尾 primary 不同不算转点；短暂路过多 tendency 区域不算 A 投入。

### 控 A 打 A / 控 B 打 B

**含义**：开局主要控制某方向，经过中期发展后仍在同一方向完成实际进点。

**必须条件**：opening dominant region 明确；不是 Rush；最终多人进点、C4 late dwell 或下包与开局方向一致。

**加强证据**：默认位驻留和中期推进连续；没有另一点的强假打或转点证据。

**命名优先级**：如果同时满足爆弹或夹击，应显示更具体的“爆弹/夹击”，控 A 打 A 只作保守标签。

### 控 A 追 B / 控 B 追 A

**含义**：开局主要控制一个方向，但没有足够假打证据，最终根据局势打向另一点。

**必须条件**：opening dominant region 与最终多人进点/C4 late dwell/下包方向不同；最终方向明确。

**排除条件**：如果原方向存在成组假动作，使用“假打 A 真打 B”；如果 C4 和主力在原方向形成持续投入，使用“假打 A 转 B”。该名称用于避免把普通控图后的选择夸大成预设假打。

### Anti-eco A/B 慢清

**含义**：`full` 对低经济时，以分段推进和清理近点风险为主，而非直接集体撞点。

**必须条件**：经济语境属于 Anti-eco；路径上存在多个有意义的停留/推进段；最终目标方向明确。

**加强证据**：视角、shots/duels 或接触数据表明队员逐段处理近点；开局分散后再收拢；早期没有无补枪单人死亡。

**降级条件**：只有进点较晚只能叫“慢速推进”，不能叫“慢清”。缺少 shots/duels 时，“慢清”最高为中置信。

### 低经济抱团下包

**含义**：T 方在 eco、semi 或 force 下集中行动，以进入包点并尝试下包为主要可观察结果。

**必须条件**：低经济语境；开局或早期动线集中；C4 与目标方向一致；存在 plant_begin、实际下包或明确多人进点。

**加强证据**：C4 全程随主力；进点跨度短；没有另一方向投入。

**降级条件**：没有下包尝试且目标点不明确，只显示“低经济抱团”。

### 低经济抱团下枪

**含义**：低经济队伍集中寻找与对方接触、争取武器收益，但没有明确下包投入。

**必须条件**：低经济语境；队伍集中；较早发生多人接触；没有 plant_begin、下包或明确包点执行。

**加强证据**：shots/duels 显示共同接触；击杀后武器使用发生可解释变化。

**降级条件**：ZIP 没有 shots/duels 或武器收益证据时，只能输出“疑似抱团找枪”，不能断言主观意图。

### 默认控图

**含义**：队伍按多个默认 anchor 展开，在开局窗口没有明确集体打点。

**必须条件**：多个默认 anchor 有稳定 dwell；opening 为 split/balanced；开局阶段没有 Rush 或早期集体进点。

**说明**：默认控图是开局状态，可以与后续爆弹、夹击、转点同时存在。UI 应显示“开局：默认控图”，而不是拿它覆盖最终主战术。

### 未识别打法

没有候选达到中置信时不生成主战术名。卡片展示经济语境、开局结构和事实 badge，不用时间桶拼接一个似是而非的名称。

## CT 方战术判断

### 默认防守

CT 队员主要驻留在该地图已核实的 CT 默认 anchor，人数分布没有显著偏离地图常规结构，也没有 deep pressure。它是 CT 的保守兜底标签。

### 重防 A/B

某点开局人数显著高于该地图的 CT 默认结构，并持续达到 dwell 阈值。不能硬编码“3 人就是重防”，因为不同地图的常规 A/B 人数不同；必须以 `default-positions.ts` 和真实分布报告为基线。

### 前压 A/B/中路

一名或多名 CT 离开本方默认 anchor，进入前方区域；进入对方默认位覆盖区域为强前压证据。单人短暂探身只显示前压事件，多人或长 dwell 才形成回合标签。

### 防 Rush

这是“预置应对”标签，不等同于“对手本回合 Rush”。必须同时有对手高置信 Rush，以及 CT 在对应入口预先形成多人站位、早期道具或交叉火力证据。若只有对手 Rush 而 CT 被动接触，显示“遭遇 Rush”，不声称 CT 预设防 Rush。

### 回防 A/B

目标点被 T 方控制或 C4 已下包后，原本不在该点的存活 CT 连续向目标点移动并重新进入。回防方向由包点事件和 CT 轨迹共同确定，不能根据回合末尾位置单独判断。

### 保枪

C4 已下包或目标点已失守，存活 CT 在可回防窗口内没有持续接近目标点，并在远离目标区的位置存活到回合结束。由于主观意图不可直接观察，默认显示“疑似保枪”；只有时间、距离和生存结果同时支持时才提高置信度。

## 时间证据

第二人进入目标包点的回合剩余时间保留五档：

```ts
if (seconds > 100) return "rush";
if (seconds > 80) return "fast";
if (seconds > 55) return "execute";
if (seconds > 35) return "slow";
return "late";
```

这些内部字段只生成 `1:43 第二人进点`、`早期集体进点`、`常规窗口进点`、`慢速进点`、`压秒进点` 等证据 badge。除 Rush 还需满足集中、C4 同向和多人进点外，时间档不直接生成“快攻、执行、慢打、压秒”等主名称。

## 主标签选择

候选推断按“证据具体性 + 置信度”选择 primary plan：

1. Rush、爆弹、夹击；
2. 假打真打、假打转点；
3. 控图同向打、控图追另一点；
4. Anti-eco 慢清、低经济抱团下包、疑似抱团找枪；
5. CT 重防、前压、防 Rush、回防、疑似保枪；
6. 默认控图/默认防守；
7. 未识别。

更具体的标签覆盖保守标签，但所有成立的候选仍保存在 `planCandidates` 中供证据区展示。confidence 为 low 的候选不成为主标签。

## 聚类

聚类身份保持正交：

```text
economyContextKey = ownEconomy + opponentEconomy
openingPatternKey = map + side + coarseSignature + detailedSignature
executionKey      = supported primary plan + target + entry structure
```

时间桶和低质量提示不进入稳定 ID。展示名不参与 ID。Playbook 名称和 playlist 使用稳定 fingerprint；v5 重建为 v6 时按旧结构 fingerprint 迁移，存在一对多时不静默覆盖。

## UI

一级入口：

```text
手枪局 | 长枪局 | Anti-eco | 强起 | 半起 | Eco
```

卡片优先显示有证据的主标签，例如：

```text
长枪局 · A 爆弹
长枪局 · 夹 A
长枪局 · 假打 A 转 B
Anti-eco · B 慢清
强起 · A 抱团下包
CT 长枪局 · 重防 A
```

卡片同时展示开局标签和事实 badge，例如“开局：默认控图”“第二人 1:07 进 A”“对手半起”。右侧证据区按判断条件逐项说明满足与缺失的证据，并可跳到回放 tick。

左侧模式列表移除独立 `68vh` 上限，与中间回放区域等高，内容在左栏内部滚动。

## 模块所有权

- `@cs2dak/maps`：callout tendency、中文名、默认 anchor 和 callout-grid 查询。
- `@cs2dak/core`：v6 单回合事实、C4/道具/交火派生和所有战术判断。
- `@cs2dak/cohort`：跨回合聚类、样本和胜率统计。
- `@cs2dak/presentation`：经济入口、中文标签、证据说明 View Model。
- `apps/dak-studio`：持久化、筛选、回放和 UI，不拥有共享判断公式。
- `@cs2dak/contract`：继续 re-export `cs2-demo-format`，不 fork 上游类型。

## 验证与人工检查点

### 事实一致性

- 当前 10 个 fixture ZIP 的每个回合，双方经济与 `rounds.json` 完全一致；
- loadout 汇总等于对应五名玩家的 `player-economies.json`；
- replay place 优先，缺失时才使用 grid；grid 质量字段完整保留；
- 多 tendency callout 不因 primary 压缩丢失完整语义；
- C4 换持包者、过渡区和短暂路过不产生伪转点。

### 真实数据报告

实现判断前先生成可人工审查的 Markdown 报告，至少包含：

- grid exact/nearby 的 confidence、samples、distance 分布；
- C4 dwell 时长和方向优势分布；
- 道具簇数量、类型、投掷者和进点时间差分布；
- 入口 callout 组合与进点跨度分布；
- 每条候选规则命中的真实回合、证据和回放入口。

该报告是阈值进入代码前的人工审核检查点，不得先写死阈值再用 fixture 证明自己。

### 判断不变量

- 无成组目标道具证据不得命名“爆弹”；
- 无多入口同步证据不得命名“夹击”；
- 无 C4/主力阶段性方向变化不得命名“转点”；
- 只有进点时间不得命名 Rush、慢清或下枪；
- optional shots/duels 缺失时相关标签必须降级；
- T/CT 标签不混用；
- 每个主标签至少有一条可跳转证据。

## 实施顺序

1. 修复经济来源、统一地图语义对象并升级 facts v6。
2. 保留完整 tendencies，重写 C4 timeline、道具簇、入口和交火事实。
3. 生成真实数据报告，人工确认 grid 质量、dwell、道具和同步阈值。
4. 在 core 实现经过确认的 T/CT 战术推断与候选优先级。
5. 重构 cohort 聚类、presentation 命名和证据 View Model。
6. 重构 Pattern Explorer、Playbook 和 Anti-Strat，并修复列表/回放高度。
7. 迁移持久化名称与 playlist，完成 fixture、单测和 UI 回放验收。
