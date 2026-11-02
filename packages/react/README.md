# @cs2dak/react

消费已有展示数据的 React 组件。类型由 `@cs2dak/presentation` 定义；宿主负责数据来源、导航和持久化。比赛整页组合由宿主实现。

```tsx
import { useState } from 'react';
import { DataTable, ReplayViewer } from '@cs2dak/react';
import { createReplayViewState, type TableState, type WorkspaceReplay, type MapView } from '@cs2dak/presentation';
import '@cs2dak/react/theme.css';

function Example({ replay, map }: { replay: WorkspaceReplay; map: MapView }) {
  const [table, setTable] = useState<TableState>({ sort: { key: 'name', direction: 'asc' }, page: 0 });
  const [view, setView] = useState(() => createReplayViewState(replay, map));
  return <><DataTable rows={[{ name: 'A' }]} columns={[{ key: 'name', label: 'Name', sortable: true, sortValue: r => r.name }]} rowKey={r => r.name} state={table} onStateChange={setTable} />
    <ReplayViewer replay={replay} map={map} state={view} onStateChange={setView} /></>;
}
```

独立入口使用相同合同：

```tsx
import { ReplayViewer } from '@cs2dak/react/replay';
import { DataTable } from '@cs2dak/react/table';
// 宿主按上例持有 state / onStateChange。
```

`@cs2dak/presentation` 和 `@cs2dak/presentation/models` 均导出轻量状态和规范化 helper。导航快照应将 `playing` 设为 false。原始 DemoPackage 可由宿主调用 `@cs2dak/pipeline.analyzeMatchWorkspace` 构造模型；UI 不依赖分析包。地图 URL 由宿主提供。参见 [迁移指南](../../docs/migrations/react-controlled-state.md)。

运行时依赖 presentation、maps、lucide-react；React 和 React DOM 为 peer。地图投影使用 maps/calibration，安装闭包不包含分析包或 map-assets。
