# @cs2dak/maps

English | 简体中文

Map calibration, world-to-radar transforms, attack routes, zone geometry, and callout name mappings. Initial constants are aligned with the RivalHub/AWPy-style radar formula and can be expanded per map as fixtures grow.

## Contents

| Directory / file | Purpose |
|---|---|
| `src/routes.ts` | `MapRoute` schema (type / confidence / zones) + `routeIndex` / `furthestRouteIndex` |
| `src/zones.ts` | `MapZone` polygon geometry + `pointInPolygon` / `zoneAt` |
| `src/callout-names.ts` | CS2 callout → 中文名 mapping (171 entries, 7 maps) |
| `src/index.ts` | Public exports + `MAP_CALIBRATIONS` + `worldToRadar` |
| `map-routes/*.json` | Confirmed attack routes per map (authoritative) |
| `scripts/generate-routes.py` | Refresh `callout-review.md` + `viz/` radar images |
| `viz/` | Callout and route overlay radar images (generated) |

## Refresh viz

```bash
uv run --with matplotlib --with pillow python packages/maps/scripts/generate-routes.py
```

地图标定、世界坐标到 radar 像素坐标转换、进攻动线、zone 几何与 callout 中文映射。第一版只放常用竞技地图，后续根据 fixtures 和实际 demo 校准。
