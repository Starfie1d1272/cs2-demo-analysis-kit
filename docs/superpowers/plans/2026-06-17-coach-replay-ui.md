# Coach Replay UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将教练开局模式重构为常驻统一回放主画布，删除固定切片，并统一比赛时钟、时间展示、前压语义和说明组件。

**Architecture:** contract/presentation 提供完整回合边界与纯时钟模型，React `ReplayViewer` 是比赛和教练页面唯一播放器。Studio 只按 matchId 直接读取持久化 workspace，模式选择驱动同一个常驻播放器；战术 facts 仅保留连续时间开局模型。

**Tech Stack:** TypeScript 5.9、React 19、Vitest、pnpm workspace、Tactical Slate CSS。

## Global Constraints

- UI 遵守 `docs/design-language.md`，只使用 `--dak-*`/`stu-*` token。
- 比赛与教练页面不得 fork 回放实现。
- 缺失时间事实保持 null/unknown，不伪造为 0。
- 教练默认 1:35，比赛工作台默认 1:55。
- UI 不显示裸秒执行时间。
- 所有行为改动 test-first。

---

### Task 1: 精简战术 facts 与前压语义

**Files:** `apps/dak-studio/src/lib/facts.ts`、`apps/dak-studio/src/lib/facts.test.ts`、`packages/core/src/tactics/*`。

**Interfaces:** 删除 `TacticalRoundFact.snapshots`；输出 `openingPattern` 与动态 `openingPressure`；facts version 递增。

- [x] 写失败测试：facts 不含 snapshots；快速进入非本方默认位产生中文 callout 的前压证据，不改变默认位签名。
- [x] 运行 core/facts 测试确认失败。
- [x] 删除固定切片提取，新增动态前压推导和证据。
- [x] 重跑 core/facts 测试。

### Task 2: 建立共享比赛时钟与回合边界

**Files:** `packages/contract/src/workspace.ts`、`packages/presentation/src/workspace.ts`、`packages/presentation/src/replay-clock.ts`、对应测试。

**Interfaces:** `WorkspaceReplayRound.freezeEndTick`；`deriveReplayClock(round, tick, tickrate)`；`formatClockSeconds(seconds)`。

- [x] 写失败测试覆盖 1:55、1:35、C4 0:40、实际爆炸时长和动态赛后间隔。
- [x] 运行 presentation/contract 测试确认失败。
- [x] 实现时钟纯函数并接入 workspace replay contract。
- [x] 重跑测试。

### Task 3: 修正单场回放加载边界

**Files:** `apps/dak-studio/src/lib/storage/types.ts`、两个 storage adapter、`apps/dak-studio/src/lib/facts.ts` 及测试。

**Interfaces:** `RecordStore.get<T>(key)`；`FactsStore.getMatchWorkspace(matchId)`。

- [x] 写失败测试证明单场读取不调用 `getAll()`。
- [x] 运行 storage/facts 测试确认失败。
- [x] 实现两个 adapter 的 key lookup 和 facts 单场 API（adapter 已有 `get`，仅补 facts API）。
- [x] 重跑测试。

### Task 4: 统一 ReplayViewer 时钟与初始定位

**Files:** `packages/react/src/components/MatchWorkspace.tsx`、相关测试与样式。

**Interfaces:** `ReplayViewer.initialClockSeconds?: number`，默认 115；显式 target tick 优先。

- [x] 写失败测试覆盖共享时钟展示和初始帧计算。
- [x] 运行 React 测试确认失败。
- [x] 用共享时钟替换 raw tick 主状态，保留技术信息为次级；接入 freeze-end 初始定位。
- [x] 重跑测试。

### Task 5: 重构教练页为常驻回放主画布

**Files:** `apps/dak-studio/src/views/coach/PatternExplorer.tsx`、`apps/dak-studio/src/views/CoachView.tsx`、`apps/dak-studio/src/studio.css`、组件测试。

**Interfaces:** 模式/证据选择只更新常驻 `ReplayViewer`；稳定 matchId cache；教练传 `initialClockSeconds={95}`。

- [x] 写失败组件测试：无切片控件；首个模式自动选代表回合；证据驱动同一回放；执行时间为 M:SS。
- [x] 运行组件测试确认失败。
- [x] 删除 `ClusterRadar`/`InlineRoundReplay` 条件视图，构建三栏回放优先布局。
- [x] 使用 `MetricInfo` 替换私有说明，补齐文案与前压展示。
- [x] 重跑组件测试。

### Task 6: 文档与全量验证

**Files:** `docs/design/studio-redesign.md`、`apps/dak-studio/README.md`、changeset。

- [x] 更新 UI 和时钟合同文档。
- [x] 用 rg 确认 snapshots UI、裸秒和私有教练说明已清零。
- [x] 运行目标测试、`pnpm typecheck`、单 worker 全仓 Vitest 和 `pnpm build`。
- [x] 按 `docs/design/coach-replay-ui.md` 逐项审计完成标准。
