# 设计：P4 地图语义层 + 空间分析（地图控制账户）

> 定位：补 Trade 账户对**独自控空间/被动 AWP**类选手的系统性低估（见下方实证）。
> 先做复盘指标 + PRISM 风格轴，**暂不进 RR 总分**（与 roadmap 阶段 4 边界一致）。
> 几何基础已实现于 `@cs2dak/maps`（`zones.ts`）；唯一待人工的一步是**区域多边形标定**。

---

## 为什么要做（24 场职业 spike 的实证）

职业 spike 里，被 v2 相对 v1 **压低**最多的选手是「死亡几乎不被交易」的独狼控图/被动 AWP：

| 选手 | 类型 | KPR | tradeDeathRate | v2−v1 |
|---|---|---|---|---|
| **Jame** | 被动 lurk AWP | 0.83 | **4.3%** | −0.285 |
| sh1ro | 被动 AWP | 0.71 | 10.8% | −0.198 |
| arT（对照，被抬高） | 突破型 lurker | 0.59 | 28.3% | +0.168 |

Trade 账户把「孤儿死亡」当扣分，但 Jame/sh1ro 的价值是**控图、信息、AWP 封锁**——真实但模型看不见。
而死亡会被换的突破型 lurker（arT）已被 Trade 正确接住。
→ 地图控制账户精确补的是「**死亡不被换的独自控空间**」这一缺口，不是所有 lurker。

---

## 三个子能力（按实现成本与价值排序）

| 子能力 | 输入 | 产出 | 成本 |
|---|---|---|---|
| **Area v1** | positions-1s（1 Hz）+ zones | 区域占有 / 首控时间 / 失控时间 | 中（依赖 zones 标定） |
| **Utility Block v1** | grenades（含 destroyTick）+ zones | smoke/molly 对关键区域的封锁秒数 | 中 |
| **Aim v1** | shots（yaw/pitch/velocity） | 急停率 / 扫射 / preaim | 重（最靠后，不依赖 zones） |

Area 与 Utility Block 都依赖 zones；Aim 不依赖 zones、可独立做但最重，排最后。

---

## 几何基础（已实现，无需人工）

`@cs2dak/maps` 的 `zones.ts`：

```ts
interface MapZone { id; name; role: ZoneRole; bombsite?; polygon: [x,y][]; zMin?; zMax? }
interface MapZones { mapName; version; zones: MapZone[] }

pointInPolygon(x, y, polygon): boolean          // 射线法
zoneAt(zones, x, y, z?): MapZone | null         // 点 → 区域；多层图按 z 过滤；顺序=优先级
ACTIVE_DUTY_MAPS                                 // 7 图（train 已移除）
```

- 多边形顶点用**世界坐标 XY**（与 positions-1s/replay 的 `position` 同坐标系，分辨率无关）。
- 多层地图（nuke/vertigo）用 `[zMin,zMax]` 区分上下层。
- 重叠区域按数组顺序取第一个命中（窄区域排前）。
- 已测：`packages/maps/src/zones.test.ts`（6 用例）。

## 唯一待人工：区域多边形标定

每张图一个 `packages/maps/map-zones/<map>.json`，由人工标定多边形坐标。
格式与建议工作流见 `packages/maps/map-zones/README.md`；`de_mirage.template.json` 给出
该图的标准区域清单（a/b 点、mid、connector、ramp、apps、palace、ticket、jungle…）+
占位多边形，人工只需把每个区域的世界坐标顶点填进去。

> 坐标获取：可用 demo 里已知地标点（出生点、包点中心）对照 `MAP_CALIBRATIONS` 的
> `worldToRadar` 反推，或在 2D 回放（replay 流）上取点 → 世界坐标。

---

## Area v1 计算设计（zones 就绪后实现）

**输入**：`positions-1s`（每秒每存活选手一行：roundNumber/tick/side/position）+ `MapZones`。

**逐 tick 归属**：对每个 1Hz 采样，`zone = zoneAt(zones, pos.x, pos.y, pos.z)`。

**每回合每区域指标**：
```
occupancy[zone][side]   = Σ 该 side 存活选手在该 zone 的采样秒数
firstControlTick[zone]  = 某 side 在该 zone 连续占有 ≥ T 秒且对方 0 人的首个 tick
contestedSeconds[zone]  = 双方同时在该 zone 有存活选手的秒数
lostTick[zone][side]    = 已首控后该 side 占有归零、对方 >0 的首个 tick
```

**选手级聚合**（为账户/风格服务）：
```
soloSpaceSeconds(player) = Σ 选手独自（队友不在同 zone）占有「非己方出生区」的秒数
spaceTakenFirst(player)  = 选手参与的 firstControl 次数（进攻方先到关键区）
zoneEntryDeaths(player)  = 选手在推进 zone 阵亡且死亡未被交易的次数
```

`soloSpaceSeconds` + `zoneEntryDeaths`（未被交易）正是 Trade 盲区里 Jame/sh1ro 的价值代理。

## Utility Block v1 计算设计

**输入**：`grenades`（smoke/molotov/incendiary，含 `destroyTick` → 持续时间）+ 落点 + `MapZones`。

```
blockSeconds[zone] = Σ_grenade (该烟/火覆盖 zone 的持续秒数)
  烟：destroyTick − detonateTick；火：燃烧持续
归属：用手雷落点 zoneAt 判定其封锁的 zone（粗略 v1；精确版需爆炸半径覆盖多 zone）
```

选手级：`utilityBlockSeconds(player) = Σ 该选手投掷且封锁关键 zone（connector/mid/site 入口）的秒数`。
这是 Utility 账户的空间维补充（当前 Utility 只看致盲/伤害，看不见「烟封住进攻路线」）。

## Aim v1 计算设计（最后做，不依赖 zones）

**输入**：`shots`（每发 yaw/pitch/velocity/tick）。
```
counterStrafeRate = 开火瞬间水平速度 < 阈值 的射击占比（急停纪律）
sprayControl      = 连续射击的 pitch/yaw 漂移（压枪稳定度）
preaimError       = 交火首发开火前准星与敌人夹角（预瞄）
```
纯风格信号，进 PRISM 的「机械水平」轴，不进 RR。

---

## 数据流与归属边界

```
positions-1s ┐
grenades     ┼─► @cs2dak/core 空间派生（消费 @cs2dak/maps 的 zoneAt）
shots        ┘        │
                      ├─► Area / UtilityBlock / Aim 指标（per player-map）
                      ├─► 赛后复盘视图（DemoViewModel 空间面板）
                      └─► PRISM 风格轴（cohort 相对）
                                  ✗ 不进 RR v2 总分（本阶段）
```

- 计算落在 `@cs2dak/core`（确定性、无副作用），geometry 用 `@cs2dak/maps`。
- React 只消费产出的 ViewModel，不算空间逻辑。
- **明确不进 RR 总分**：地图控制先以复盘 + 风格轴形态验证；等指标稳定、且能证明它确实
  回收了 Jame/sh1ro 类价值后，再讨论是否设独立「地图控制账户」并给权重（远期）。

## 已完成 vs 待人工 vs 待实现

| 项 | 状态 |
|---|---|
| zone 几何（类型 / pointInPolygon / zoneAt / 测试） | ✅ 已实现（`@cs2dak/maps`） |
| 7 图池常量（train 移除） | ✅ `ACTIVE_DUTY_MAPS` |
| zone 文件格式 + 模板 + README | ✅ `packages/maps/map-zones/` |
| **各图区域多边形标定** | ⬜ **人工**（唯一待人工步骤） |
| Area v1 / Utility Block v1 计算 | ⬜ 待实现（zones 就绪后，设计已定） |
| Aim v1 | ⬜ 待实现（最后，不依赖 zones） |
| 进 PRISM 风格轴 | ⬜ 待实现 |
