# @cs2dak/react

消费已有展示数据的 React 组件。类型由 `@cs2dak/presentation` 定义，组件负责渲染和交互回调；宿主负责数据来源、导航、权限和持久化。

## 使用

```tsx
import type { MatchWorkspaceModel } from '@cs2dak/presentation';
import { MatchWorkspace } from '@cs2dak/react';
import '@cs2dak/react/theme.css';

export function MatchPage({ model }: { model: MatchWorkspaceModel }) {
  return <MatchWorkspace model={model} />;
}
```

按组件使用子入口：

```tsx
import type { MapView, WorkspaceReplay } from '@cs2dak/presentation';
import { ReplayViewer } from '@cs2dak/react/replay';

export function ReplayPage({ replay, map }: { replay: WorkspaceReplay; map: MapView }) {
  return <ReplayViewer replay={replay} map={map} />;
}
```

- `@cs2dak/react/scoreboard`：`ScoreboardTable`，接收窄 `ScoreboardTableRow[]`；`rr` / `accountRR` 可以为 `null`。
- `@cs2dak/react/table`：通用 `DataTable`。
- `@cs2dak/react/replay`：独立 `ReplayViewer`。数据 props 为 `WorkspaceReplay` / `MapView`，另可指定跳转目标和初始比赛时钟，无需完整工作台模型。

完整工作台接收 `workspace-0.2` 的 `MatchWorkspaceModel`，必填 `buyQuality`、`players[].roundSummary` 与 `reportHighlights`。证据跳转等交互通过组件回调交给宿主。

需要从 Demo 生成模型时，在执行分析的位置调用 `@cs2dak/pipeline.analyzeMatchWorkspace`；已有 package/bundle/canonical facts 时调用 `@cs2dak/analytics.buildMatchWorkspaceFromAnalysis`。UI 包不依赖这两个执行入口。它们接受可选 `DemoViewOptions`，由宿主提供 `radarImageUrl` / `lowerRadarImageUrl`；省略时默认 `null`。Studio 的图片相对路径由 Studio library 层提供。

## 依赖边界

- runtime：presentation、maps、lucide-react。
- peers：React / React DOM，版本范围以 package.json 为准。
- props/type：presentation 的展示合同；源码、声明和安装闭包禁止分析包、rating、format 和 JSZip。
- 地图投影：`@cs2dak/maps/calibration`。它隔离空间资产的模块加载，资产仍随 maps 同包安装。

样式通过 `@cs2dak/react/theme.css` 引入，使用 DAK 主题 token。发布合同为 dist ESM/declarations 与独立 CSS 入口；实际 registry 发布状态以发布记录为准。
