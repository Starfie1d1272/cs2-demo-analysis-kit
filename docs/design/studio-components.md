# Studio 组件登记表（复用优先）

> **目的**：登记已经做对、应当**强制复用**的组件，避免每次新功能重造轮子。
> 新增 UI 前先查本表：能复用就复用，不要再起第二套实现。
>
> 维护：新增/升级共享组件后在此登记；下沉到 `@cs2dak/react` 后更新归属列。

## 0. 边界铁律（决定组件落在哪个包）

`@cs2dak/react` 是**产品中立**包（被 RivalHub / CS2 Insight Agent 消费）。硬约束：

- **不查数据库、不跑分析、只消费 presentation/contract 合同。**
- 样式走 `dak-*`（CSS 在 `packages/react/src/theme.css`）。

DAK Studio 是独立 `stu-*` 设计语言（CSS 在 `apps/dak-studio/src/studio.css`），
遵守 [`design-language.md`](../design-language.md)。

**分类轴线 = 纯展示 vs 绑数据**：

| 组件性质 | 归属 |
|---|---|
| 纯展示（props 进、回调出，零数据依赖） | **应下沉 `@cs2dak/react`** |
| 绑 facts store / `season.ts` / 分析编排 | 留 Studio（container） |
| 桌面壳（pywebview 桥 / 自更新 / 本地目录） | Studio 专属，下沉无意义 |

正确终态是 **container(Studio) / presentational(React) 分层**：Studio 视图负责
查 facts store、把 model 传进 React 纯组件渲染。

## 1. 共享原语（先查这里，再写新代码）

| 组件 | 归属 | 用途 | 不要再造的东西 |
|---|---|---|---|
| **`DataTable<T>`** | `@cs2dak/react` | 通用数据表：列配置 → 客户端排序（升/降切换）→ 可选分页 → 渲染。热力着色、自定义单元格、行点击、hover 联动均支持。 | 任何 `<table>` + 手搓 `sortKey/sortDesc/handleSort`。**这是仓库唯一排序表实现。** |
| **`Pagination`** | `@cs2dak/react` | 页码 + 前后翻页 + 信息文字。`className` 决定样式。 | 任何手搓 `page/totalPages/slice` 翻页条。Studio 经 `components/Pagination.tsx` 薄包装传 `stu-pagination`。 |
| `SeasonLeaderboard` | `@cs2dak/react` | 赛季/赛事选手排行榜（多视图 tab + 升/降排序）。 | 选手榜单。 |
| `TeamComparisonPanel` | `@cs2dak/react` | 队伍对比（A/B 选队 + 雷达 + per-team 比赛列表）。赛前侦察口径，两队无需交手。 | 队伍并排对比表。 |
| `ScoreboardTable` | `@cs2dak/react` | 单场记分板（队伍着色、可点选手）。 | 记分板。 |
| `EmptyState` / `MetricInfo` / `EvidenceLink` | Studio `components/primitives.tsx`（**Tier A 下沉候选**） | 空态骨架 / 派生指标 ⓘ 口径 / 跳回放原语。 | 裸空 div、裸 `title=`、自绘回放按钮。 |
| `CohortScope` | Studio | 聚合范围透镜（地图/标签/队伍筛行）。绑 `StudioDemoEntry` + identity。 | 范围筛选条。 |
| `BracketConnections` | Studio（`EventsView`） | lane-aware 双败/GSL bracket（胜者组/败者组/晋级连线）。 | 淘汰赛连线图（唯一正确实现，见 D6）。 |

## 2. `DataTable` 用法

```tsx
import { DataTable, STUDIO_TABLE_CLASSES, type DataTableColumn } from "@cs2dak/react";

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "name", label: "队伍", format: (r) => r.name },
  { key: "wins", label: "胜场", numeric: true, sortable: true, sortValue: (r) => r.wins, format: (r) => r.wins },
  // render: (r) => <EvidenceLink .../>  // 复杂单元格用 render
  // heat: (r) => toneForPercent(r.winRate)  // 可选热力着色
];

<DataTable
  classes={STUDIO_TABLE_CLASSES}   // Studio 表保留 stu-* 长相；缺省 DAK_TABLE_CLASSES 走 dak-*
  rows={rows}
  rowKey={(r) => r.id}
  initialSortKey="wins"
  pageSize={15}                    // 设置即启用分页
  columns={COLUMNS}
/>
```

- **样式注入**：`STUDIO_TABLE_CLASSES`（`stu-*`，CSS 在 studio.css）/ `DAK_TABLE_CLASSES`（`dak-*`，theme.css）。组件只共享逻辑结构，不跨设计语言。
- **特例**：行 hover 联动（如 LineupView 雷达）用 `rowProps`；行整体点击用 `onRowClick`；条件行样式用 `rowClassName`。

## 3. 表格统一迁移清单

仓库历史上有 **4 套排序实现**（`stu-col-sortable` 切换 / `stu-sort-header` 仅降序 /
`dak-col-sortable` 仅降序 / 一堆静态表）。目标：全部收敛到 `DataTable`。

| 表 | 位置 | 状态 |
|---|---|---|
| 赛事总览 地图盘面 / 武器击杀榜 | `TournamentDashboardView` | ✅ 已迁 DataTable |
| 排行榜 升/降切换 | `SeasonLeaderboard` | ✅ 已修（暂未迁 DataTable，组件内修） |
| 循环赛积分榜 | `EventsView` | ⏳ 待迁（已有 stu-col-sortable，逻辑可直接换 DataTable） |
| 闪光榜 | `UtilityView` | ⏳ 待迁 |
| 道具点位库（雷达 hover 联动） | `LineupView` | ⏳ 待迁（用 `rowProps` 接 hover） |
| 经济矩阵 / 小枪翻盘排行 / 队伍明细矩阵 | `EconomyView` ×3 | ⏳ 待迁（明细矩阵带热力着色，用 `heat`） |
| 战术本 ×2 | `CoachView` | ⏳ 待迁 |
| 证据回合 | `PatternExplorer` | ⏳ 待迁（带分页 + 证据链单元格） |

> 管理类列表（`LibraryView` / `EventManager` / `LibraryMaintenance` / `SeriesWorkspace` /
> `MapPoolTable`）不是"数据榜"，可不强迁 DataTable。

## 4. 下沉到 React 的待办（Tier A）

- `primitives.tsx` 的 `EmptyState` / `MetricInfo` / `EvidenceLink` → React（纯展示，仅需把 `stu-*` 类改 `dak-*` + CSS 迁 theme.css）。
- Bracket 渲染器 `ElimBracket` / `SwissBracket` / `BracketConnections` → React，**需先把 `ElimModel` / `SwissModel` / `BracketCell` 类型从 Studio `lib/event-bracket` 移到 contract**。

## 5. 必须留 Studio（绑数据）

所有 View 容器、`CohortScope`、`EventManager` / `EventPackageMaker` / `EventFrameworkBoard` /
`LibraryView` / `LibraryMaintenance`、`VetoInputDialog`。

## 6. Studio 专属（桌面壳，不下沉）

`UpdateControl` / `UpdateModal` / `Changelog` / `LibraryDirButton`。
