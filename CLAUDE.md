# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev                  # Start demo-lab (Vite preview app)
pnpm build                # Build all packages
pnpm typecheck            # tsc -b across workspace

# Testing
pnpm test                 # Run vitest (packages/**/*.test.ts)
pnpm python:test          # Run Python tests via uv

# Analysis
pnpm analyze:sample       # Run CLI on fixtures/input/cs2dak-sanitized-de_ancient.zip → fixtures/output/sample/
pnpm python:export:sample # Export one NJU demo → fixtures/output/nju-rivals-2026/
pnpm python:export:pro    # Batch-export all pro demos → fixtures/output/pro/
pnpm python:export:nju    # Batch-export all NJU demos → fixtures/output/nju-rivals-2026/

# GUI (rebuild viewer before running)
pnpm --filter @cs2dak/demo-lab build   # Build the embedded viewer bundle
cd python && uv run cs2-demo-exporter-gui  # Launch the pywebview desktop app

# Run a single TS test file
pnpm vitest run packages/core/src/index.test.ts
```

Python dependencies are managed with `uv` inside `python/`. Never install into system Python or conda base.

## Architecture

The repository is the middle layer between the CS2 demo exporter and downstream products (RivalHub, CS2 Insight Agent).

```
.dem file
  → python/cs2_demo_exporter  (produces cs2-demo-format/2.0 ZIP; CLI + GUI)
  → @cs2dak/core              (loads ZIP → DemoPackage → AnalysisBundle)
  → @rivalhub/rival-rating    (computes RR/PRISM scores)
  → analysis-bundle.json / view-model.json / qa-report.json
  → @cs2dak/react components  (consume DemoViewModel / MatchWorkspaceModel)
```

The GUI (pywebview) exports a v2 ZIP then opens a second window with the built
`@cs2dak/demo-lab` bundle that renders the just-exported ZIP via `loadDemoPackageFromZip`.
The ZIP bytes cross the Python→JS seam as base64 — no code imports across languages.

**Package responsibilities:**

| Package | Role |
|---|---|
| `@cs2dak/contract` | Zod schemas + TS types for all domain objects. Single source of truth for shapes. |
| `@cs2dak/core` | All analysis logic. Loads a v2 ZIP, runs normalization, economy, kills, clutches, timeline, heatmap, QA, and RR/PRISM signals. No side effects. |
| `@cs2dak/maps` | Map calibration constants and world-to-radar coordinate transforms. |
| `@cs2dak/react` | UI components that accept `DemoViewModel` / `MatchWorkspaceModel` props. No DB queries, no analysis logic. |
| `@cs2dak/cli` | Thin CLI (via `tsx`) that wires `@cs2dak/core` to the filesystem. |
| `apps/demo-lab` | Vite + React app: preview sandbox for components + embedded viewer in the pywebview GUI. |
| `python/cs2_demo_exporter` | `.dem → v2 ZIP` pipeline using `demoparser2`. Also ships a GUI (`pywebview`) and PyInstaller packaging. |

## Key Constraints

- **Cross-language seam**: the v2 ZIP is the only coupling point between Python and TypeScript. Neither side imports the other's code.
- **`@cs2dak/contract` vs `cs2-demo-format`**: contract depends on / re-exports `cs2-demo-format`; it does not fork it.
- **`@rivalhub/rival-rating`** is pinned to a specific GitHub commit in `@cs2dak/core`'s `package.json`. It is the sole owner of RR/PRISM formulas and `AccountSignalsV2` types.
- **Null fields stay null** in `AccountSignalsV2`; never coerce to 0.
- Core packages must not import product code from RivalHub, CS2 Insight Agent, or any app.
- React components must not query databases or run analysis — they consume `DemoViewModel` only.
- Fixtures under `fixtures/` are the source of truth for cross-language behavior verification.

## Workspace Layout

```
packages/              # @cs2dak/* TypeScript libraries
apps/demo-lab/         # Vite preview app (@cs2dak/demo-lab)
python/                # cs2_demo_exporter Python package (uv-managed)
fixtures/
  demos/               # Raw .dem files (gitignored, ~27 GB)
    nju-rivals-2026/   # 55 NJU league demos
    pro/               # 24 professional match demos
  input/               # Committed test inputs (small, stable)
    cs2dak-sanitized-de_ancient.zip   # Primary vitest fixture
    cohort/            # 3-match cohort for cohort/cli tests
    sample-match.zip   # One-match sample for demo-lab
  output/              # Generated v2 ZIPs (gitignored, re-export with python:export:*)
    nju-rivals-2026/
    pro/
  baselines/           # Curated non-regenerable artifacts (committed)
  _bench/              # Local benchmark scripts and large demo files (gitignored)
docs/                  # Architecture and integration notes
```

TypeScript tests live alongside source as `*.test.ts` and are run by vitest (node environment, no browser).
