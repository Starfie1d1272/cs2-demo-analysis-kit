# Integration plan (for Codex)

**This repo (`cs2-demo-analysis-kit`) is the home monorepo.** It already holds the
TS analysis side; we pull the validated Python **exporter** into `python/`, then
archive the standalone exporter repo. `cs2-demo-format` (contract) and
`rival-rating` (rating) stay separate, consumed as dependencies.

The v2 ZIP is the seam: exporter **produces** it, `@cs2dak/core` **consumes** it.
They never import each other's code — only the ZIP contract.

```
demo.dem ─[python/ exporter]─▶ cs2-demo-format v2 ZIP ─[@cs2dak/core]─▶ AccountSignalsV2 ─▶ rival-rating
```

## What already exists here
- `packages/core` (@cs2dak/core) — analysis: v2 ZIP → DemoPackage → playerRoundFacts
- `packages/contract` (@cs2dak/contract), `packages/cli`, `packages/maps`, `packages/react`
- `apps/demo-lab` (@cs2dak/demo-lab) — visualization app
- `python/cs2_demo_analysis/` — placeholder (only `validate.py`)
- pnpm workspace, vitest, bilingual README, LICENSE

## What moves in (from `cs2-demo-exporter`, commit 36755c7+)
The **validated** v2 producer (5 real demos pass `cs2-demo-format/tools/validate.py`):
- `exporter.py` (13 builders + zip assembly), `parse_worker.py` (demoparser2)
- `cli.py`, `gui/` (pywebview), `packaging/` (.exe/.dmg), `pyproject.toml`

## Stages

### Stage 0 — absorb the exporter
- [ ] Move `cs2-demo-exporter/src/cs2_demo_exporter/*` into `python/` (merge with the
      existing `cs2_demo_analysis` placeholder; keep ONE package name — decide
      `cs2_demo_exporter` vs `cs2_demo_analysis`).
- [ ] Reconcile the placeholder `python/cs2_demo_analysis/validate.py` with the
      exporter's own validate path (drop the duplicate).
- [ ] Keep CLI / GUI / PyInstaller packaging working from the new location.
- [ ] **Archive `cs2-demo-exporter`** once the move lands (code lives here now).
- [ ] **Push this repo to a GitHub remote** — it has none yet; the author
      (DrEAmSs59) needs a URL to PR exporter refinements against.

### Stage 1 — dedupe the contract
- [ ] Decide `@cs2dak/contract` vs `cs2-demo-format`: `@cs2dak/contract` should
      **depend on / re-export** `cs2-demo-format` (zod + JSON Schema), not fork it.
- [ ] Verify `@cs2dak/core` builds against a real v2 ZIP produced by `python/`
      (pin one export as the shared fixture under `fixtures/`).

### Stage 2 — the rating connection (the open TODO)
Add `deriveAccountSignalsV2(pkg: DemoPackage): AccountSignalsV2` in `packages/core`.

References:
- rival-rating: `src/types/accounts.ts` (AccountSignalsV2),
  `src/weights/rr-value-accounts-v2-lite.json`, `src/rr/models/value-accounts-v2-lite.ts`.
- existing adapter: `packages/core/src/index.ts` → `buildPlayerIndicators`.

Work:
- [ ] From `kills`, rebuild `killsByBuyDelta` (equip-value diff at kill tick →
      advantage / even / disadvantage buckets).
- [ ] From `kills`, rebuild `killsByManState` (alive-count diff at kill tick →
      manUp / even / manDown buckets).
- [ ] Map existing stats / clutches into the 5 `AccountSignalsV2` sub-objects.
- [ ] `null` fields stay `null` (do NOT coerce to 0).
- [ ] Call `computeValueAccountsRR(signals, weights)` to run the v2 model.

### Stage 3 — verify end-to-end
- [ ] `python/ exporter → @cs2dak/core → rival-rating` runs on the pinned fixture
      and produces stable signals; wire into `apps/demo-lab` for visualization.

## Repos after integration
- **cs2-demo-analysis-kit** (this) — exporter (python/) + analysis (packages) + demo-lab. Single source of truth; debug here only.
- **cs2-demo-format** — contract (external dep).
- **rival-rating** — rating models/weights (external dep).
- **cs2-demo-exporter** — ARCHIVED (code moved into `python/`).
