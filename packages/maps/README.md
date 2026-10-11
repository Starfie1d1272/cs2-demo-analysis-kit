# @cs2dak/maps

English | 简体中文

Map calibration, world-to-radar transforms, compact nav topology, zone geometry, callout name mappings, default positions, and site-entry semantics. Route assets are retained as legacy spatial helpers; Coach semantics should prefer demo-derived facts plus `site-entry-chokes`.

## Public package entries

Published packages expose compiled ESM and declarations; repository `src/` paths below are implementation locations, not consumer imports. Existing APIs remain available through these five entries:

| Entry | Runtime |
| --- | --- |
| `@cs2dak/maps` | Aggregate compatibility surface: calibration, geometry and bundled JSON assets |
| `@cs2dak/maps/calibration` | Pure synchronous calibration; zero runtime imports or spatial assets |
| `@cs2dak/maps/callout-grid-node` | Node filesystem grid loader |
| `@cs2dak/maps/callout-grid-browser` | Fetch-based grid loader |
| `@cs2dak/maps/tri-assets` | Node filesystem triangle loader |

```ts
import { getMapCalibration, worldToRadar } from "@cs2dak/maps/calibration";
const map = getMapCalibration("de_nuke");
if (map) worldToRadar({ x: map.posX, y: map.posY }, map);
```

No workspace source aliases or runtime TypeScript loader are needed. `node scripts/maps-package-smoke.mjs` validates the actual tarball in a clean Node 24 consumer and checks declarations under strict NodeNext. Build the package with `pnpm --filter @cs2dak/maps build` before packing; the build clears generated `dist/`, including stale files from earlier declaration layouts. JSON assets retain their package-root paths.

## Calibration and coverage

Calibration comes from CS2 overview metadata. `worldToRadar` returns 1024 radar pixels with the existing 96px OOB padding. Floor classification uses `z < lowerLevelMaxUnits` for lower, otherwise upper. Dataset revision `MAP_CALIBRATION_VERSION = "2"` adds Train's -50 split, verified against the [tracked game overview snapshot](https://github.com/SteamTracking/GameTracking-CS2/blob/5278de99318192d682ec7f0e1cc3ea9449f10c6e/game/csgo/pak01_dir/resource/overviews/de_train.txt); Nuke and Vertigo thresholds and all ten plane calibrations remain unchanged. Radar images and other Valve assets are not part of the npm calibration API.

`ACTIVE_DUTY_MAPS` describes the Valve product rotation: Ancient, Anubis, Cache, Dust2, Inferno, Mirage, Nuke. Verified on 2026-10-11 against Valve's [Premier Season Five announcement](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1836506165581827) and subsequent official announcements via the [Steam news API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=100&maxlength=0). The tracked `gamemodes.txt` legacy `mg_active` block differs from current Premier announcements and is not used as the product rotation authority.

`SPATIAL_ASSET_MAPS` describes checked-in nav/route coverage: Ancient, Anubis, Dust2, Inferno, Mirage, Nuke, Overpass. Entering Active Duty does not automatically supply nav, routes, callout grids or zones. Cache nav/routes remain unavailable; Overpass historical assets remain available. Legacy polygon zones cover only part of this set. Map-role evidence qualification has its own supported coverage.

The tarball smoke checks all five entries, strict declarations, and a fresh Node process that imports and calls `/calibration` after all four spatial asset directories are deleted. It verifies local artifacts; registry-level Node 24 smoke after an authorized npm release and real browser/Windows qualification remain separate acceptance steps.

## Contents

| Directory / file | Purpose |
|---|---|
| `src/routes.ts` | Legacy `MapRoute` schema + `routeIndex` / `furthestRouteIndex` helpers |
| `src/route-assets.ts` | Checked-in route asset registry + `getMapRoutes(mapName)` for legacy spatial consumers |
| `src/geometry-assets.ts` | Checked-in compact nav registry + `getMapNav(mapName)` / `getMapGeometry(mapName)` |
| `src/zones.ts` | `MapZone` polygon geometry + `pointInPolygon` / `zoneAt` |
| `src/callout-names.ts` | CS2 callout → 中文名 mapping (171 entries, 7 maps) |
| `src/default-positions.ts` | T/CT 开局长期驻留默认位；与 callout 倾向共同构成唯二人工战术地图资产 |
| `src/site-entry-chokes.ts` | 人工核实的包点物理入口与 route-family 判定节点 |
| `src/index.ts` | Aggregate compatibility exports |
| `src/calibration.ts` | Single owner of overview calibration, transforms and dataset revision |
| `src/map-pool.ts` | Current Active Duty and independent spatial asset coverage |
| `map-routes/*.json` | Legacy confirmed attack routes per map; do not expand as Coach truth source |
| `map-nav/*.nav.json` | Compact AWPy-derived nav graph per covered map |
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
