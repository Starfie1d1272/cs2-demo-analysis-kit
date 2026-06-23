# Simplify 审查待办 (2026-06-23)

`/simplify` 审查发现但跳过的改进项，按优先级排列。

## 高优先级

### 1. 淘汰赛双渲染器统一 ✅ 已解决

> **2026-06-23**：`ElimModel` 扩展 `nodes?: ElimNode[]`（lane-aware 布局元数据）。
> `ElimBracket` 内部按 `model.nodes` 有无自动选择：有 nodes→SVG lane-aware + 晋级连线（可点击），
> 无 nodes→DOM 列布局（兼容制作器/单败）。`BracketConnections` 已删除，双重渲染器合并为单组件。

`ElimBracket`（DOM/EventBracket.tsx）和 `BracketConnections`（SVG/EventsView.tsx）
是两套完全独立的双败淘汰渲染组件，通过 `useLaneDiagram` boolean 分叉。

**问题**:
- 新功能需维护两套渲染（标签、着色、hover）
- 能力不对齐：`BracketConnections` 有 lane 分段连线但无交互（不可点开 demo），
  `ElimBracket` 可点开 demo 但不支持 lane
- 数据模型不同：`ElimModel` (columns) vs 直接消费 `bracketNodes` + `series`

**方向**: 扩展 `ElimModel`（或 `ElimBracket`）使其原生支持多 lane 分段 +
晋级连线，然后删除 `BracketConnections`。

**涉及文件**: `EventBracket.tsx`, `event-bracket.ts`, `EventsView.tsx` (~150 行)

---

### 2. 跨组件 hook 抽取 ✅ 已解决

> **2026-06-23**：7 张表全部迁入 `DataTable`，`useSortable` / `usePagination` 内联模式
> 已被 `DataTable<T>` 内置排序+分页取代，无需抽取 hook。剩余 1 张循环赛积分榜待迁。

以下模式在代码库中重复 3-6 处，但每次都是内联实现。

#### useSortable\<T\> (3 处)
`LineupView.tsx`, `UtilityView.tsx`, `EventsView.tsx`
— 完全相同的 `sortKey`/`sortDesc`/`handleSort`/`arrow` 逻辑。

#### usePagination\<T\> (6 处)
`LineupView.tsx`, `UtilityView.tsx`, `DuelView.tsx`×2, `CoachView.tsx`, `PatternExplorer.tsx`
— 完全相同的 `PAGE_SIZE`/`page`/`totalPages`/`safePage`/`slice()` 5 行模板。

**方向**: 在 `apps/dak-studio/src/hooks/` 下创建两个 hook 文件，
逐一替换现有内联实现。

---

## 中优先级

### 3. Dead CSS 清理 (~130 行) ✅ 已完成

> **2026-06-23**：全部 ~130 行已清理——`stu-sort-header`/`stu-empty`/`stu-info`/`stu-evidence`（阶段一）
> + `stu-fb-slot`/`stu-fb-round-label`/`stu-fb-lane-label`/`stu-fb-lane`/`stu-duel-evidence-*`/`stu-pe-tag`/`stu-pe-bucket`（阶段二）。

以下 CSS 规则仅在 `studio.css` 中定义，无任何 `.tsx` 文件引用：

| 类名范围 | 行数 | 原用途 |
|----------|------|--------|
| `.stu-fb-slot`, `-active`, `-filled`, `-label`, `-meta` | ~50 | EventFrameworkBoard 旧自制格子（已迁移到 `.stu-eb-box`） |
| `.stu-fb-round-label`, `.stu-fb-lane-label` | ~20 | EventFrameworkBoard 旧列/轮次标题 |
| `.stu-duel-evidence-card`, `-main`, `-meta` | ~30 | DuelView 旧卡片布局（已改为 grid） |
| `.stu-pe-tag`, `-tag-fake`, `.stu-pe-bucket` | ~30 | PatternExplorer 旧 tag/bucket 组件 |

**方向**: 全量 CSS 使用率扫描后一次性删除。注意排除动态拼接类名（如 `` `stu-fb-slot-${variant}` ``）。

### 4. 缺失的 useMemo 优化 ✅ 已完成

> **2026-06-23**：4 处全部补上——DuelView `summarizeDuels`、EventsView `standings`、
> EventFrameworkBoard `frameworkSlots`（pre-compute Map）、PatternExplorer `facts.find`
> （随 DataTable 迁移自然解决）。

本次 diff 未触及、但审查发现的重复计算：

- **DuelView** `summarizeDuels(model)` — 每 render O(n log n)
- **EventFrameworkBoard** `frameworkSlots(stage)` — 每 stage 每 render
- **EventsView RoundRobinStage** `standings()` + `[...base].sort()` — 每 render O(n)
- **PatternExplorer EvidenceTable** `facts.find()` 在 `pageRounds.map()` 内 — O(n×m)

**方向**: 各文件单独加 `useMemo`，视情况开独立 PR。

### 5. `bracketNodesForType` API 不对称

`teamCount` 参数仅 `single_elim` 实际使用；`double_elim` 固定 16 队节点，
`gsl_group` 固定 4 队。已在本次 diff 加注释说明，但签名仍具误导性。

**方向**: 要么为 double_elim/gsl_group 实现可变队数（工作量大），
要么拆分 API 为 `bracketNodesForType(type)` + 单独的 `resizeEliminationNodes`。

---

## 低优先级

### 6. 赛事总览经济表跳转不可点击 ✅ 已解决

> **2026-06-23**：`EconomyPanel` 回合卡已支持 `onJumpRound`→2D 回放；
> `TournamentDashboardView` 新增 `onGoEconomy` prop，"经济与节奏"文本改为可点击按钮。

`TournamentDashboardView.tsx` 删除了 3 个经济表（手枪局/经济对位/Eco 翻盘），
替换为纯文本提示"统一在「经济与节奏」页查看"。
用户需手动导航到 EconomyView，文本不可点击。

**方向**: 从 `App.tsx` 传 `onGoEconomy` callback，将文本改为导航按钮。

### 7. UtilityView LineupView 延迟挂载

`LineupView` 在 `entries.length > 0` 时立即挂载并触发 IndexedDB 查询，
即使用户未滚动到该区域。可用 `IntersectionObserver` 延迟到进入视口时再挂载。
