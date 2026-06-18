# Tactical Spatial Kernel 设计

## 目标

将战术判断收口为一条可审计的数据链：地图层只人工维护基础 callout 倾向与双方默认站位，回合中的驻留、推进、集合、区域控制、执行、转点与佯攻均从 replay 事实动态推导。DAK Studio 不再拥有共享战术公式，后续 UI 只消费稳定的 presentation 模型。

## 唯一人工资产

### 基础 callout 倾向

`packages/maps/src/callout-names.ts` 保存 callout 中文名及有序方向集合：

```ts
type TacticalRegion = "a" | "b" | "mid";

interface CalloutDefinition {
  cn: string;
  tendency?: readonly TacticalRegion[];
}
```

`tendency[0]` 是主要连接方向，其余元素是次要方向。它不表示实际打点、控制权、默认位或回合阶段。未知 callout 返回 `null`，不得按名称前缀猜测。

### 默认站位

`packages/maps/src/default-positions.ts` 只保存 T/CT 开局长期驻留锚点：

```ts
interface MapDefaults {
  t: SideDefaults;
  ct: SideDefaults;
}
```

静态 `contested`、`advanced`、`terminal` 和对方站位角色全部删除。默认位只回答“该阵营的这个 callout 是否属于已确认的开局驻留锚点”。默认位依据 30 秒开局窗口的 occupancy 与连续 dwell 报告人工确认，不以路线终点或单帧命中确认。

## 模块边界

- `@cs2dak/maps`：拥有两个地图资产，以及无状态的 callout/默认位查询和位置分类原语。
- `@cs2dak/core`：拥有时间化玩家段、阵型时间线、开局模式、阶段变化和高阶判断。所有结果携带 tick/player/callout 证据。
- `@cs2dak/cohort`：拥有跨回合模式聚合与稳定聚类，不拥有逐帧解释。
- `@cs2dak/presentation`：拥有人类可读标签、说明和证据入口。
- `apps/dak-studio`：负责导入时调用、版本化持久化、查询与页面编排，不拥有共享战术公式。

## 地图分类合同

```ts
interface TacticalLocation {
  callout: string | null;
  tendencies: readonly TacticalRegion[];
  primaryRegion: TacticalRegion | null;
  defaultAnchorId: string | null;
  isDefaultPosition: boolean;
}

classifyTacticalLocation(mapName, side, callout): TacticalLocation;
```

分类只读取基础倾向和当前阵营默认站位。旧 `roleOf()` 的 `advanced/ct/terminal/other` 不再存在；这些状态要么是动态结果，要么没有稳定战术含义。

## 时间化战术合同

Core 接收已经标准化的逐帧样本，不依赖 Studio 存储：

```ts
interface TacticalFrameSample {
  tick: number;
  playerIndex: number;
  side: "t" | "ct";
  alive: boolean;
  callout: string | null;
}
```

相邻同玩家、同 callout、连续存活的样本合并为 `PlayerTacticalSegment`。段保存起止 tick、持续时间、方向、默认位锚点和可审计证据。死亡、callout 缺失、callout 变化或采样断裂都会截断。

队伍时间线按事实 tick 生成 `TacticalFormationSnapshot`：

- `regionCounts`：A/B/Mid/unknown 人数；
- `defaultAnchorCounts`：默认位锚点人数；
- `holdingPlayers`：达到驻留阈值的玩家；
- `movingPlayers`：在观察窗口内发生位置变化的玩家。

开局模式从一段稳定窗口推导，而非单个固定快照：

```ts
interface OpeningPattern {
  regionCounts: RegionCounts;
  defaultAnchorCounts: Record<string, number>;
  spread: "stacked" | "split" | "balanced" | "unknown";
  coarseSignature: string;
  detailedSignature: string;
  evidence: TacticalEvidenceRef[];
}
```

`coarseSignature` 用区域人数形成稳定聚类；`detailedSignature` 保留默认位细节。开局模式与最终打点正交，同一开局允许发展成不同执行。

## 回合分析与证据

`TacticalRoundAnalysis` 组合玩家段、阵型时间线、开局模式、区域转移、C4、道具、进点和高阶判断。事实、派生状态与高阶判断分层保存。

任何 `rush/rotation/fake/default_execute/split_execute` 判断都返回：

```ts
interface TacticalInference {
  type: TacticalInferenceType;
  confidence: "low" | "medium" | "high";
  evidence: TacticalEvidenceRef[];
}
```

没有足够证据时返回空或降低置信度，不把缺失值转换为确定结论。

## 聚类原则

聚类维度保持正交：

1. 地图、阵营、开局粗模式；
2. 区域控制与阵型变化；
3. 最终执行点、入口结构和节奏；
4. 经济、胜率、下包率作为统计/筛选维度。

不得继续用一个字符串 key 同时绑定经济、三个瞬时快照、最终打点和执行时间。展示名称由 presentation 根据结构生成，不能反向成为聚类依据。

## 默认位报告

`derive-default-positions.ts` 继续扫描真实 ZIP，输出：

- 当前 runtime 默认位及其 occupancy/dwell 证据；
- 未纳入默认位但高频驻留的候选；
- 高频移动/相邻证据，帮助识别通道；
- callout 倾向覆盖与未知项；
- 与当前两个资产一致的 runtime 片段。

报告不再读取或输出静态 `contested`。争夺性只能作为真实样本的双方占有/交互证据，不成为第三个人工资产。

## 迁移规则

- 删除 anchor ID 前缀 fallback。
- 删除静态 `contested`、`isContested()`、多态 `roleOf()`。
- Studio 的 snapshot 分类统一调用 maps/core 公共接口。
- `TACTICAL_FACT_VERSION` 在新合同落地后递增；旧 facts 通过现有重导/重建机制淘汰，不长期维护兼容公式。
- UI 本次不重做，只通过兼容投影保持可运行；后续 UI 重构直接消费新模型。

## 完成标准

- 仓库只有 callout 倾向和默认站位两类人工战术地图资产。
- 新地图只需补这两个资产，不修改战术内核分支。
- 未知 callout 保持 `null/unknown`，无字符串猜测。
- 默认位和开局模式基于连续时间证据，不基于路线终点。
- 每个高阶判断可定位到 round/tick/player/callout 证据。
- Studio app 中不再存在区域分类 fallback 或共享聚类公式。
- 最新真实 Demo 报告由当前 runtime 资产生成且可复现。
- maps/core/Studio 相关测试、全仓 typecheck 与目标 fixture 验证通过。

