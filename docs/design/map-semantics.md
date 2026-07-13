# 地图语义真相源

本文固定 Coach、空间研究与后续 MapControl 共用的地图理解基础。运行时定义在
`@cs2dak/maps`，应用不得维护平行映射。

## 边界

地图层只保存四类经过人工核实或带明确统计来源的资产：

1. `callout-names.ts`：官方英文 callout、中文名和有序 A/B/Mid tendency；
2. `callout-grid`：由 110 场 demo 多数表决生成的坐标到 callout 近似查询，必须保留
   `source/confidence/samples/distance`；
3. `default-positions.ts`：按阵营维护、由真实开局驻留证据生成并人工核实的默认位；
4. `site-entry-chokes.ts`：人工核实的包点物理入口，以及少量早于进包边界的路线判定节点。

Observed transition graph、完整玩家轨迹、C4、道具和交火都是由 demo 与上述语义派生的
证据，不是静态地图真相。旧 `MapRoute` 资产不再扩充，也不得作为 Coach 的唯一判断源。

## 两层入口语义

- `entryChokeId`：玩家第一次进入目标包点前命中的最后一个人工确认物理入口；
- `routeFamilyId`：宏观路线方向。大多数地图与入口相同；Dust2 A 区和 Overpass B 深绕
  会在更早节点确定方向，因此单独保存。

未知入口保持 `null`。不得根据 callout 字符串自动生成稳定 ID。

## 七图入口表

### Ancient

| 包点 | family | Callout | 类型 |
|---|---|---|---|
| A | `a_main` | `MainHall` | 常规 |
| A | `a_side_hall` | `SideHall` | 夹击 |
| A | `a_ct_spawn` | `CTSpawn` | 深绕 |
| B | `b_ramp` | `Ramp` | 常规 |
| B | `b_side_entrance` | `SideEntrance` | 夹击 |
| B | `b_alley` | `Alley` | 深绕 |

### Anubis

| 包点 | family | Callout | 类型 |
|---|---|---|---|
| A | `a_main` | `Main`, `Fountain` | 常规 |
| A | `a_walkway` | `Walkway` | 夹击 |
| A | `a_heaven` | `Heaven` | 深绕 |
| B | `b_outside` | `OutsideLong` | 常规 |
| B | `b_connector` | `Connector` | 夹击 |
| B | `b_bricks` | `Bricks` | 夹击 |
| B | `b_alley` | `Alley` | 深绕 |

### Dust2

| 包点 | 物理入口 | 入口 Callout | 宏观路线 | 路线 marker |
|---|---|---|---|---|
| A | `a_short_entry` | `ExtendedA` | `a_short_route` | `ShortStairs` |
| A | `a_long_entry` | `ARamp` | `a_long_route` | `LongA` |
| B | `b_upper_tunnel` | `UpperTunnel` | 同入口 | - |
| B | `b_mid_doors` | `BDoors`, `Hole` | 同入口 | - |

A 小跳警家后可以不进入任何包点，因此 `a_short_route` 可以存在而 `entryChokeId` 为
`null`，也可以最终从另一个物理入口进点。路线 marker 只做路线划分，不断言最终战术。

### Inferno

| 包点 | family | Callout | 说明 |
|---|---|---|---|
| A | `a1` | `TopofMid`, `Quad` | 马棚是 A1 组成部分 |
| A | `a2` | `Balcony` | 二楼/阳台 |
| A | `a_connector` | `Arch`, `Library` | 连接方向 |
| B | `b_banana` | `Banana` | 常规 |
| B | `b_ruins` | `Ruins` | 教堂深绕 |

### Mirage

| 包点 | family | Callout | 说明 |
|---|---|---|---|
| A | `a_ramp` | `TRamp` | A1 |
| A | `a_palace` | `PalaceInterior`, `Scaffolding` | A2 上下合并 |
| A | `a_connector` | `Connector` | 拱门 |
| A | `a_jungle` | `Jungle` | 深绕 |
| B | `b_apartments` | `Apartments`, `Truck` | 白车并入 B 二楼 |
| B | `b_short` | `Catwalk` | B 小 |
| B | `b_market` | `Shop` | 超市深绕 |

### Nuke

| 包点 | family | Callout | 说明 |
|---|---|---|---|
| A | `a_hut` | `Hut` | 黄房 |
| A | `a_mini` | `Mini` | 正门 |
| A | `a_squeaky` | `Squeaky` | 铁门房 |
| A | `a_heaven` | `Heaven`, `Rafters` | 三楼方向 |
| B | `b_ramp` | `Ramp` | 铁板 |
| B | `b_decon` | `Decon` | 死门 |
| B | `b_tunnels` | `Tunnels`, `Observation` | K1 地下家族，控制室并入 |

`Vents` 不单独形成入口家族；它只能作为完整轨迹证据，由前后已确认节点解释。

### Overpass

| 包点 | 物理入口 | Callout | 宏观路线 |
|---|---|---|---|
| A | `a_lower_park` | `LowerPark` | 同入口 |
| A | `a_upper_park` | `UpperPark` | 同入口 |
| A | `a_bank` | `Lobby`, `StorageRoom`, `Stairs`, `BackofA` | 银行侧深绕 |
| B | `b_monster` | `Canal` | 同入口 |
| B | `b_short` | `Construction`, `Bridge` | 同入口 |
| B | `b_snipers_walkway` | `SnipersNest`, `Walkway` | `b_snipers_walkway_route` |

从 A 区经 B 二楼/ABC 反绕时，即使最后经过 `Construction`，宏观路线仍记录为
`b_snipers_walkway_route`；物理入口继续如实记录为 `b_short`。

## 消费规则

- `@cs2dak/core` 保存原始 callout 序列并调用 maps 解析入口，不复制表；
- `@cs2dak/cohort` 只按 facts 中的稳定 ID 聚合；
- `@cs2dak/presentation` 负责中文标签和证据说明；
- Studio 只做筛选、持久化、回放定位与展示；
- MapControl 或完整战术判断必须建立在 demo 派生证据之上，不得把入口 family 当作战术意图。

## 地图分类合同

`@cs2dak/maps` 对外暴露 `classifyTacticalLocation(mapName, side, callout)` 单一查询入口：

```ts
interface TacticalLocation {
  callout: string | null;
  tendencies: readonly TacticalRegion[];      // 从 callout-names 读取
  primaryRegion: TacticalRegion | null;
  positionGroupId: string | null;              // 从 default-positions 读取
  isDefaultPosition: boolean;
}
```

旧 `roleOf()` 的 `advanced/ct/terminal/other` 已删除——这些是动态回合结果，不是静态地图属性。未知 callout 返回 `null`，不按名称前缀猜测。

## 模块边界

地图层只保存静态人工资产与无状态查询原语。动态回合状态在其它层推导：

- `@cs2dak/maps`：四类人工资产 + `classifyTacticalLocation`；
- `@cs2dak/core`：时间化玩家段、阵型时间线、开局模式、进点判断、高阶推断；
- `@cs2dak/cohort`：跨回合聚类，只消费 facts 中的稳定 ID；
- `@cs2dak/presentation`：人类可读标签与证据入口；
- `apps/dak-studio`：持久化、查询、展示，不保有共享战术公式。
