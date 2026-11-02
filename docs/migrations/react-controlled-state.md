# React 受控状态迁移

外部消费者可继续固定旧版本；升级到下一个 `@cs2dak/react` major 时须迁移以下接口。新接口没有兼容层。

## 表格

之前：`<DataTable initialSortKey="wins" page={page} onPageChange={setPage} {...props} />`。现在由宿主持有完整状态：

```tsx
const [state, setState] = useState<TableState>({ sort: { key: 'wins', direction: 'desc' }, page: 0 });
<DataTable {...props} state={state} onStateChange={setState} />
```

## 回放

之前：`<ReplayViewer target={{ roundNumber, tick, seq }} initialClockSeconds={95} {...props} />`。现在直接定位状态，保留速度和图层：

```tsx
const [state, setState] = useState(() => createReplayViewState(replay, map));
const seek = (roundNumber: number, tick: number) => setState(current => current && normalizeReplayViewState(replay, map, { ...current, roundNumber, tick, playing: false }));
<ReplayViewer replay={replay} map={map} state={state} onStateChange={setState} />
```

新比赛使用其模型创建新状态；恢复导航快照时暂停播放。`/replay` 和 root 导出同一组件，状态与 helper 从 presentation root 或 `/models` 导入。

## 整页组合

之前：`<MatchWorkspace model={model} />`。现在宿主自己组合公开的 `ScoreboardTable`、`EconomyPanel`、`HeatmapCanvas` 和 `ReplayViewer`，并持有页面选择与导航状态；`MatchWorkspaceModel` 仍是公共展示 DTO。

## 表格样式

之前从 `@cs2dak/react` 导入 `STUDIO_TABLE_CLASSES`。现在宿主定义自己的 `DataTableClasses` 并传给 `classes`；通用 `DAK_TABLE_CLASSES` 仍可使用。
