# Demo-Lab Map Annotator Prototype

`apps/demo-lab` 曾包含一个地图标注原型，用于在 Vite dev server 中读取 radar PNG，并通过本地 API 写回：

- `packages/maps/map-zones/<map>.json`
- `packages/maps/map-routes/<map>.json`

这个工具服务于 2026-06 的 zone / route 探索阶段。当前地图语义已经收束到 `@cs2dak/maps` 的 runtime asset 与 `docs/design/map-semantics.md`，该交互式标注体系不再作为维护入口。

清理决策：

- 删除 `apps/demo-lab` app 壳与重复 radar 静态资源；
- 不保留可运行工具，避免它继续暗示 `map-routes` 是主要战术真相源；
- 如需复活标注器，从 git 历史恢复 `apps/demo-lab/src/MapAnnotator.tsx`，并迁到明确的 `tools/map-editor` 或 `packages/maps/devtools`。
