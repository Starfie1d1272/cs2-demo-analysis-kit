# @cs2dak/maps

English | 简体中文

Map calibration, world-to-radar transforms, compact nav topology, zone geometry, callout name mappings, default positions, and site-entry semantics. Route assets are retained as legacy spatial helpers; Coach semantics should prefer demo-derived facts plus `site-entry-chokes`.

## Contents

| Directory / file | Purpose |
|---|---|
| `src/routes.ts` | Legacy `MapRoute` schema + `routeIndex` / `furthestRouteIndex` helpers |
| `src/route-assets.ts` | Public active-duty route asset registry + `getMapRoutes(mapName)` for legacy spatial consumers |
| `src/geometry-assets.ts` | Public active-duty compact nav registry + `getMapNav(mapName)` / `getMapGeometry(mapName)` |
| `src/zones.ts` | `MapZone` polygon geometry + `pointInPolygon` / `zoneAt` |
| `src/callout-names.ts` | CS2 callout → 中文名 mapping (171 entries, 7 maps) |
| `src/default-positions.ts` | T/CT 开局长期驻留默认位；与 callout 倾向共同构成唯二人工战术地图资产 |
| `src/site-entry-chokes.ts` | 人工核实的包点物理入口与 route-family 判定节点 |
| `src/index.ts` | Public exports + `MAP_CALIBRATIONS` + `worldToRadar` |
| `map-routes/*.json` | Legacy confirmed attack routes per map; do not expand as Coach truth source |
| `map-nav/*.nav.json` | Compact AWPy-derived nav graph per active-duty map |
| `scripts/generate-routes.py` | Refresh `callout-review.md` + `viz/` radar images |
| `viz/` | Callout and route overlay radar images (generated, ignored) |

## Refresh viz

```bash
uv run --with matplotlib --with pillow python packages/maps/scripts/generate-routes.py
```

地图标定、世界坐标到 radar 像素坐标转换、进攻动线、zone 几何与 callout 中文映射。第一版只放常用竞技地图，后续根据 fixtures 和实际 demo 校准。

## 战术空间语义

人工维护层是 `callout-names.ts` 的基础 A/B/Mid 倾向、`callout-grid` 的坐标近似、
`default-positions.ts` 的双方默认站位，以及 `site-entry-chokes.ts` 的包点入口语义。
`classifyTacticalLocation()` 只组合 callout 倾向与默认站位；争夺、推进、终点、转点
与回合阶段均由 `@cs2dak/core` 根据真实时间序列推导，maps 不维护静态
`contested/advanced/terminal` 角色。
