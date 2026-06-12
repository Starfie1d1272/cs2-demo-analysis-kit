# map-zones — 地图区域多边形标定

P4 空间分析（Area / Utility Block）的唯一人工输入。每张现役图一个 `<map>.json`，
定义若干**世界坐标多边形**区域。几何消费见 `@cs2dak/maps` 的 `zoneAt()`。

## 文件格式

```jsonc
{
  "mapName": "de_mirage",
  "version": "mirage-zones-0.1",
  "zones": [
    {
      "id": "a_site",            // 稳定唯一 id（小写下划线）
      "name": "A 点",            // 人类可读名
      "role": "site",            // site|connector|mid|lane|spawn|approach|backsite|other
      "bombsite": "a",           // "a"|"b"|null（site/connector 常关联）
      "polygon": [[x1,y1],[x2,y2],[x3,y3], ...]  // 世界坐标 XY，≥3 点，自动闭合
      // 多层地图（nuke/vertigo）再加 "zMin"/"zMax"
    }
  ]
}
```

## 关键约定

- **坐标系 = 世界坐标 XY**，与 demo 的 replay 坐标同系（不是 radar 像素）。
- **顶点顺序无所谓**（顺/逆时针都行），首尾**不必闭合**（`zoneAt` 自动闭合）。
- **重叠时数组顺序 = 优先级**：窄/特殊区域排在前，大区域排后（`zoneAt` 返回第一个命中）。
- **空 `polygon: []` 是安全的**：永不命中、返回 null，便于先建结构后逐个填。
- **多层地图**用 `zMin`/`zMax`（含边界）区分上下层；单层省略。

## 获取世界坐标的两种办法

1. **2D 回放取点**：在 replay 流（已是世界坐标 ÷ coordScale）上沿区域边界点几个点，
   ×coordScale 还原世界坐标。
2. **地标反推**：用已知世界点（出生点、包点中心来自 bombs/replay）对照
   `MAP_CALIBRATIONS[map]` 的 `worldToRadar`，在 radar 上量边界再反算世界坐标。

## 建议工作流

1. 复制 `de_mirage.template.json` → `de_mirage.json`（模板已含标准区域清单）。
2. 先填**包点 + 关键通道**（a_site / b_site / mid / connector / 主路），其余可后补。
3. 用 `zoneAt` 对几个已知位置抽查（出生点应落 spawn，包点中心应落 site）。
4. 七图：ancient / anubis / dust2 / inferno / mirage / nuke / overpass。

> 标定不必一次完美。Area v1 只需「包点 / mid / 主路 / 出生区」这种粗粒度就能跑出
> 占有/首控指标；细分区域（jungle/ticket 等）可迭代加。
