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
| **`Pagination`** | `@cs2dak/react` | 页码 + 前后翻页 + 信息文字。`className` 决定样式。Studio 直接传 `className="stu-pagination"`。 | 任何手搓 `page/totalPages/slice` 翻页条。 |
| `SeasonLeaderboard` | `@cs2dak/react` | 赛季/赛事选手排行榜（多视图 tab + 升/降排序）。 | 选手榜单。 |
| `TeamComparisonPanel` | `@cs2dak/react` | 队伍对比（A/B 选队 + 雷达 + per-team 比赛列表）。赛前侦察口径，两队无需交手。 | 队伍并排对比表。 |
| `ScoreboardTable` | `@cs2dak/react` | 单场记分板（队伍着色、可点选手）。 | 记分板。 |
| `EmptyState` / `MetricInfo` / `EvidenceLink` | `@cs2dak/react` | 空态骨架 / 派生指标 ⓘ 口径 / 跳回放原语。 | 裸空 div、裸 `title=`、自绘回放按钮。 |
| `PlayerMapRoleProfilePanel` / `TeamMapRoleMatrixPanel` | `@cs2dak/react` | 地图/位置角色画像与队伍职责矩阵；只展示 presentation 模型，证据与动作由 container 注入。 | Studio 内重算角色、私有职责表或第二套证据按钮。 |
| `AnalysisContextSummary` + `CohortScope` adapter | Studio | 顶栏只读展示唯一 `AnalysisContext`；编辑时才投影语料字段。 | 第二套 scope/context owner。 |
| `FingerprintRadar` / `TrendChart` | Studio（`views/profile-widgets.tsx`） | PRISM 八维风格雷达 / 个人趋势柱状图（指标可切换 + min–max 参照）。纯展示，个人实验室与「我的主页」复用。 | 重画风格雷达 / 趋势图。 |
| `ElimBracket` / `SwissBracket` / `BracketConnections` | `@cs2dak/react` | 淘汰赛 bracket、瑞士轮 Buchholz 图、双败/GSL lane-aware 晋级连线。类型在 `@cs2dak/contract`。 | 淘汰赛渲染（唯一正确实现，见 D6）。 |

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
| 排行榜 升/降切换 | `SeasonLeaderboard` | ✅ 已修（升/降双向切换，组件内修） |
| 循环赛积分榜 | `EventsView` | ⏳ 待迁（可换 DataTable，暂未动） |
| 闪光榜 | `UtilityView` | ✅ 已迁 DataTable |
| 道具点位库（雷达 hover 联动） | `LineupView` | ✅ 已迁 DataTable（`rowProps` 接 hover + 受控分页） |
| 经济矩阵 / 小枪翻盘排行 / 队伍明细矩阵 | `EconomyView` ×3 | ✅ 已迁 DataTable（`heat` 热力着色） |
| 战术本 ×2 | `CoachView` | ✅ 已迁 DataTable |
| 证据回合 | `PatternExplorer` | ✅ 已迁 DataTable（受控分页 + 证据链单元格） |

> 管理类列表（`LibraryView` / `EventManager` / `LibraryMaintenance` / `SeriesWorkspace` /
> `MapPoolTable`）不是"数据榜"，可不强迁 DataTable。

## 4. 下沉到 React 的待办（Tier A）

- ~~`primitives.tsx` 的 `EmptyState` / `MetricInfo` / `EvidenceLink` → React~~ ✅ 已下沉（2026-06-23），原 `stu-*` 类→`dak-*`，CSS 迁 `theme.css`
- ~~Bracket 渲染器 `ElimBracket` / `SwissBracket` / `BracketConnections` → React~~ ✅ 已下沉（2026-06-23），`BracketCell`/`ElimModel`/`SwissModel` 类型已迁 `@cs2dak/contract`

## 5. 必须留 Studio（绑数据）

所有 View 容器、`CohortScope`、`EventManager` / `EventPackageMaker` / `EventFrameworkBoard` /
`LibraryView` / `LibraryMaintenance`、`VetoInputDialog`。

## 6. Studio 专属（桌面壳，不下沉）

`UpdateControl` / `UpdateModal` / `Changelog` / `LibraryDirButton`。
