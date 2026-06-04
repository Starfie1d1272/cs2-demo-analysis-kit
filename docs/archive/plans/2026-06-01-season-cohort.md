# Season Cohort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@cs2dak/cohort`, a pure TypeScript season-level aggregation layer that turns multiple v2 demo packages into cross-match RR v1/v2 and PRISM output.

**Architecture:** Keep single-match derivation in `@cs2dak/core`; cohort only groups and aggregates existing `AccountSignalsV2` and `RRIndicators`, then calls `@rivalhub/rival-rating` formulas. `@cs2dak/contract` owns the new season bundle schema, while `@cs2dak/cli` owns ZIP directory I/O.

**Tech Stack:** TypeScript project references, Zod contracts, Vitest, `@rivalhub/rival-rating`, existing `loadDemoPackageFromZip`.

---

### Task 1: Document the Cohort Boundary

**Files:**
- Create: `docs/design/cohort.md`
- Modify: `docs/rr-roadmap.md`

- [ ] Mark roadmap stage 2 as the current highest-priority track.
- [ ] Add `cohort.md` with data flow, aggregation semantics, confidence formula, contract output, and CLI boundary.

### Task 2: Add Contract Schemas

**Files:**
- Modify: `packages/contract/src/index.ts`

- [ ] Add `seasonPlayerRowSchema` and `seasonCohortBundleSchema`.
- [ ] Export `SeasonPlayerRow` and `SeasonCohortBundle` types.
- [ ] Keep `prism` nullable and preserve null semantics for missing fields.

### Task 3: Expose Core Single-Match Derivations

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/index.test.ts`

- [ ] Export `deriveRRIndicators(input)` by reusing `buildPlayerRoundFacts` + `buildPlayerIndicators`.
- [ ] Add a focused test that the new helper returns one `RRIndicators` row per player and matches `analyzeDemoPackage` indicators.

### Task 4: Implement `@cs2dak/cohort`

**Files:**
- Create: `packages/cohort/package.json`
- Create: `packages/cohort/tsconfig.json`
- Create: `packages/cohort/src/index.ts`
- Create: `packages/cohort/src/index.test.ts`
- Modify: `pnpm-lock.yaml` only through package manager if needed.

- [ ] Implement `buildSeasonCohort(demos, opts)` as a pure function.
- [ ] Aggregate `AccountSignalsV2` by summing counts and nullable context buckets with `available | partial | missing`.
- [ ] Aggregate `RRIndicators` by summing count fields and recomputing rate fields from summed counts/rounds.
- [ ] Compute season RR v2 with league-mean anchoring and season RR v1 percentiles.
- [ ] Compute PRISM over the full de-duplicated season cohort.
- [ ] Sort players by anchored `accountRR` descending.

### Task 5: Add CLI Directory Command

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/index.ts`

- [ ] Add dependency on `@cs2dak/cohort`.
- [ ] Add `cs2dak cohort <zip-dir> --out <season-cohort.json>`.
- [ ] Load all `.zip` files in sorted order, use filename stem as `matchId`, and write the parsed season bundle.

### Task 6: Fixtures and Verification

**Files:**
- Create: `fixtures/input/cohort/*.zip`
- Modify: tests as needed.

- [ ] Generate 3 sanitized cohort fixtures from `/Volumes/Desktop_D/GitHub/cs2-demo-analysis-kit/benchmark-output/desktop-batch-w16/exports`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run CLI against all 55 export ZIPs to produce an untracked verification artifact under `fixtures/output/season-cohort/season-cohort.json`.
