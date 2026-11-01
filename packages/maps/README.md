# @cs2dak/maps

地图校准、坐标变换与纯空间算法。静态 callout 词典、默认站位和包点入口定义也由本包维护。地图资源由 [`@cs2dak/map-assets`](../map-assets/README.md) 提供，回合级空间与战术推导由 [`@cs2dak/tactics`](../tactics/README.md) 提供。

## 公开入口

| 入口 | 能力 |
|---|---|
| `@cs2dak/maps/calibration` | 地图校准、world→radar、楼层判定 |
| `@cs2dak/maps` | 校准、nav/zone 几何、callout 查询、默认站位、包点入口、雷达栅格 |

两处入口发布 ESM 与 TypeScript 声明。本包没有 npm runtime 依赖，也不包含地图 JSON 资源或文件读取逻辑。

```ts
import { getMapCalibration, worldToRadar } from "@cs2dak/maps/calibration";

const calibration = getMapCalibration("de_nuke");
if (calibration) {
  const point = worldToRadar({ x: calibration.posX, y: calibration.posY }, calibration);
  console.log(point);
}
```

需要地图 nav 的算法显式接收数据：

```ts
import { buildRadarFieldGrid } from "@cs2dak/maps";
import { getMapNav } from "@cs2dak/map-assets";

const grid = buildRadarFieldGrid(getMapNav("de_nuke"));
```

`buildRadarFieldGrid(nav, cellSize?)` 在 nav 缺失或没有区域时返回 `null`。`EYE_HEIGHT` 与 `TARGET_HEIGHT` 是空间分析共用的世界坐标高度常量。

## 数据归属

`MAP_CALIBRATION_VERSION` 标识校准版本。`ACTIVE_DUTY_MAPS` 和 `SPATIAL_ASSET_MAPS` 分别记录产品地图池和已收录空间资产的覆盖范围；两者独立维护。

`calloutAt` / `calloutNear` 接收调用方提供的 `CalloutGrid`。`classifyTacticalLocation` 组合静态 callout 倾向与默认站位，比赛中的争夺、推进和转点由 tactics 根据时间序列推导。

仓内资源生成脚本保留在 `packages/maps/scripts/`，读取和写入 `packages/map-assets/` 下的资源目录。生成可视化：

```bash
uv run --with matplotlib --with pillow python packages/maps/scripts/generate-routes.py
```
