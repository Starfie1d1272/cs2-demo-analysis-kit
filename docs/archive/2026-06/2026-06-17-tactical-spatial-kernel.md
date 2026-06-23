# Tactical Spatial Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以基础 callout 倾向和默认站位为唯二人工地图资产，建立共享战术空间内核并迁移 Studio 当前的区域分类与开局聚类基础。

**Architecture:** `@cs2dak/maps` 提供确定性的静态位置分类，`@cs2dak/core` 将逐帧样本压缩成可审计的区域段、阵型与开局模式，Studio 在导入期调用公共接口并持久化版本化事实。UI 暂时通过兼容字段继续工作，后续单独重构。

**Tech Stack:** TypeScript 5.9、pnpm workspace、Vitest、v3 DemoPackage/replay fixtures。

## Global Constraints

- 只保留基础 callout 倾向与默认站位两类人工地图资产。
- v3 ZIP 仍是 Python 与 TypeScript 唯一 seam。
- 未知或缺失区域保持 `null/unknown`，不得转换为 0 或字符串猜测。
- Apps 只能适配、持久化和编排，不拥有共享分析公式。
- 所有行为变更遵循 test-first red/green/refactor。
- UI 本任务不重做。

---

### Task 1: 收口地图语义资产

**Files:**
- Modify: `packages/maps/src/callout-names.ts`
- Modify: `packages/maps/src/default-positions.ts`
- Modify: `packages/maps/src/index.ts`
- Modify: `packages/maps/src/default-positions.test.ts`
- Modify: `packages/maps/src/route-assets.test.ts`

**Interfaces:**
- Produces: `TacticalRegion`, `getCalloutDefinition`, `getCalloutTendencies`, `getPrimaryCalloutRegion`, `calloutBelongsToRegion`, `getDefaultAnchor`, `classifyTacticalLocation`。
- Removes: `MapDefaults.contested`, `CalloutRole`, `roleOf`, `isContested`。

- [x] 写失败测试：未知 callout 返回 null；多倾向保序；默认位分类只使用当前 side；非默认 callout 不产生静态 advanced/terminal 状态。
- [x] 运行 `pnpm vitest run packages/maps/src/default-positions.test.ts packages/maps/src/route-assets.test.ts --pool forks --maxWorkers 1 --no-file-parallelism`，确认因新 API 缺失而失败。
- [x] 实现查询 API，删除 `contested` 数据与旧角色模型，更新公开导出。
- [x] 重跑目标测试并确认通过。

### Task 2: 建立 core 时间化战术内核

**Files:**
- Create: `packages/core/src/tactics/types.ts`
- Create: `packages/core/src/tactics/segments.ts`
- Create: `packages/core/src/tactics/formations.ts`
- Create: `packages/core/src/tactics/index.ts`
- Create: `packages/core/src/tactics/tactics.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `classifyTacticalLocation(mapName, side, callout)`。
- Produces: `buildPlayerTacticalSegments`, `buildFormationTimeline`, `deriveOpeningPattern` 及 evidence-bearing 类型。

- [x] 写失败测试覆盖连续驻留合并、死亡/缺失/换区截断、未知区域、同区域轻微换 callout 不改变 coarse signature、默认位 detailed signature。
- [x] 运行 `pnpm vitest run packages/core/src/tactics/tactics.test.ts`，确认缺失实现导致失败。
- [x] 实现最小纯函数内核；所有持续时间由 tickrate 计算，所有结论携带 tick/player/callout 证据。
- [x] 重跑测试并重构重复逻辑。

### Task 3: 迁移 Studio 战术事实与聚类

**Files:**
- Modify: `apps/dak-studio/src/lib/facts.ts`
- Modify: `apps/dak-studio/src/lib/facts.test.ts`
- Modify: `apps/dak-studio/src/lib/tactics.ts`
- Modify: `apps/dak-studio/src/lib/tactics.test.ts`
- Modify: `apps/dak-studio/src/views/CoachView.tsx`

**Interfaces:**
- Consumes: core 的时间化内核与 maps 分类 API。
- Produces: `TacticalRoundFact.analysisVersion = 4`、`openingPattern`，以及基于 opening coarse/detailed signature 的兼容聚类。

- [x] 先更新 tests，要求新 facts 带 opening pattern/evidence，聚类不再调用 anchor 前缀 fallback，开局模式不因 targetSite 改变。
- [x] 运行两个目标测试并确认新断言失败。
- [x] 将 replay frame 转换为 `TacticalFrameSample`，调用 core 内核；保留旧 UI 当前需要的字段，但不再由旧角色模型推导。
- [x] 将聚类 key 拆为开局 signature 与执行维度；删除 `regionOfAnchor()`。
- [x] 重跑 Studio facts/tactics tests。

### Task 4: 更新真实 Demo 默认位报告

**Files:**
- Modify: `packages/maps/scripts/derive-default-positions.ts`
- Modify: `packages/maps/scripts/derive-default-positions.test.ts`
- Regenerate: `docs/research/default-positions-review-2026-06-15.md`

**Interfaces:**
- Consumes: 当前 `DEFAULT_POSITIONS`、`CALLOUT_DICT` 和真实 fixture ZIP。
- Produces: 不含静态 contested 的、可复现的两个资产审查报告。

- [x] 写失败测试：报告包含默认位、候选驻留、倾向覆盖和相邻证据；不包含静态 contested 章节或第三套 runtime 资产。
- [x] 运行脚本测试确认失败。
- [x] 修改 renderer，保留 occupancy/dwell/transition 事实并增加 callout 倾向覆盖审查。
- [x] 用 `fixtures/output/pro` 与 `fixtures/output/nju-rivals-2026` 的最新 ZIP 重新生成报告。
- [x] 再运行一次生成命令并与提交文件比较，确认确定性。

### Task 5: 文档、边界与全量验证

**Files:**
- Modify: `docs/module-boundaries.md`
- Modify: `docs/design/studio-redesign.md`
- Modify: `packages/maps/README.md`
- Modify: `apps/dak-studio/README.md`

**Interfaces:**
- Documents: 两个真相源、core owner、facts v4 和 UI 后续边界。

- [x] 更新边界文档，明确 Studio 不拥有共享战术公式。
- [x] 运行目标测试：maps、core tactics、Studio facts/tactics。
- [x] 运行 `pnpm typecheck`。
- [x] 运行 `pnpm vitest run --pool forks --maxWorkers 1 --no-file-parallelism`。
- [x] 按 `docs/design/tactical-spatial-kernel.md` 完成标准逐项审计，并用 `rg` 确认旧 `roleOf/isContested/contested` 战术地图资产引用清零。

