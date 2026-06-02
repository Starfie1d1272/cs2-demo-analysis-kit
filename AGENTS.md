# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
pnpm analyze:sample       # Run CLI on fixture ZIP → fixtures/output/sample/
pnpm python:export:sample # Export a .dem file to fixtures/output/exporter/

# Run a single TS test file
pnpm vitest run packages/core/src/index.test.ts
```

Python dependencies are managed with `uv` inside `python/`. Never install into system Python or conda base.

## Architecture

The repository is the middle layer between the CS2 demo exporter and downstream products (RivalHub, CS2 Insight Agent).

```
.dem file
  → python/cs2_demo_exporter  (produces cs2-demo-format/2.0 ZIP)
  → @cs2dak/core              (loads ZIP → DemoPackage → AnalysisBundle)
  → @rivalhub/rival-rating    (computes RR/PRISM scores)
  → analysis-bundle.json / view-model.json / qa-report.json
  → @cs2dak/react components  (consume DemoViewModel only)
```

**Package responsibilities:**

| Package | Role |
|---|---|
| `@cs2dak/contract` | Zod schemas + TS types for all domain objects. Single source of truth for shapes. |
| `@cs2dak/core` | All analysis logic. Loads a v2 ZIP, runs normalization, economy, kills, clutches, timeline, heatmap, QA, and RR/PRISM signals. No side effects. |
| `@cs2dak/maps` | Map calibration constants and world-to-radar coordinate transforms. |
| `@cs2dak/react` | UI components that accept `DemoViewModel` props. No DB queries, no analysis logic. |
| `@cs2dak/cli` | Thin CLI (via `tsx`) that wires `@cs2dak/core` to the filesystem. |
| `apps/demo-lab` | Vite + React preview sandbox for components and fixture data. |
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
packages/         # @cs2dak/* TypeScript libraries
apps/demo-lab/    # Vite preview app (@cs2dak/demo-lab)
python/           # cs2_demo_exporter Python package (uv-managed)
fixtures/input/   # Sample v2 ZIPs used as test inputs
fixtures/output/  # Generated artifacts (gitignored in practice)
docs/             # Architecture and integration notes
```

TypeScript tests live alongside source as `*.test.ts` and are run by vitest (node environment, no browser).
