# @cs2dak/map-assets

拥有已收录的 nav、路线、区域多边形和 callout grid，以及这些资源的加载入口。依赖 [`@cs2dak/maps`](../maps/README.md) 提供空间类型与几何算法。

## 公开入口

| 入口 | 能力 |
|---|---|
| `@cs2dak/map-assets` | `getMapNav`、`getMapRoutes`、`getMapZones`、`getMapGeometry` 及对应资源注册表 |
| `@cs2dak/map-assets/callout-grid-node` | Node 文件加载与缓存 |
| `@cs2dak/map-assets/callout-grid-browser` | 通过显式 URL 或 base URL 获取 grid |
| `@cs2dak/map-assets/tri-assets` | Node 本地 `.tri` 读取、BVH 构建与缓存 |
| `@cs2dak/map-assets/callout-grid/*.json` | 单图 grid JSON，供构建器作为静态资源处理 |

根入口导入已收录的 nav/route/zone JSON。仅使用 grid 加载器时可直接选择对应子入口。`getMapNav`、`getMapRoutes` 和 `getMapZones` 对缺少资源的地图返回 `null`。

```ts
import { getMapNav } from "@cs2dak/map-assets";
import { loadCalloutGrid } from "@cs2dak/map-assets/callout-grid-node";

const nav = getMapNav("de_nuke");
const grid = loadCalloutGrid("de_nuke");
```

Vite 浏览器资源示例：

```ts
import nukeGridUrl from "@cs2dak/map-assets/callout-grid/de_nuke.json?url";
import { loadCalloutGridBrowser } from "@cs2dak/map-assets/callout-grid-browser";

const grid = await loadCalloutGridBrowser("de_nuke", {
  urls: { de_nuke: nukeGridUrl },
});
```

其他构建器可将 JSON 部署为静态资源，再通过 `urls` 或 `baseUrl` 提供地址。Node 专用入口由 Node 消费。

`.tri` 文件由使用者准备，默认读取 `~/.awpy/tris`，可通过 `AWPY_TRIS_DIR` 指定目录。`getMapTri` 在文件缺失时返回 `null`；`getMapGeometry(mapName, triBvh?)` 只使用显式传入的 BVH。

资源位于本包的 `map-nav/`、`map-routes/`、`map-zones/` 和 `callout-grid/`。覆盖范围由 maps 的 `SPATIAL_ASSET_MAPS` 描述，zone 覆盖是其中一部分。生成脚本位于 `packages/maps/scripts/`。
