# CS2 Demo Analysis Kit · DAK Studio

English | [简体中文](./README.zh-CN.md)

**DAK Studio** is a local-first CS2 demo analysis workbench: drop a `.dem` in and get a match workspace, 2D replay (movement / grenade trajectories / C4 timeline), player profiles, opening trails, and cross-match leaderboards. All data stays on your machine (IndexedDB) — no server required.

This repository is also the shared data and analysis pipeline behind Studio: `.dem → cs2-demo-format/2.0 ZIP → @cs2dak/* analysis packages`, reusable by products such as RivalHub and CS2 Insight Agent.

## Download DAK Studio

Grab the latest from [GitHub Releases](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/latest):

- **macOS**: `dak-studio-X.Y.Z.dmg`, drag into Applications. On first launch allow it via System Settings → Privacy & Security → "Open Anyway" (the app is unsigned).
- **Windows**: `dak-studio-windows-X.Y.Z.zip`, unzip and run `dak-studio.exe`. Click "Run anyway" on the SmartScreen warning.

The exporter is built in: click "导入 demo" and pick `.dem` files (or v2 ZIPs) — parsing happens locally, no extra tooling needed.

## What Studio Does

| View | Contents |
|---|---|
| Library | Import / tag / search local demos, window-wide drag & drop |
| Match workspace | Round explorer, economy, weapons, duel matrix, map layers, 2D replay (8 Hz movement, grenade landings and flight trails, C4 plant/defuse/explode) |
| Player profiles | Personal playstyle review, RR breakdown, round facts |
| Opening trails | Cross-match positioning and utility habits per map |
| Leaderboard | Cross-match metric comparison, season RR/PRISM |

## The Pipeline (for developers)

```
.dem
  → python/src/cs2dak       exporter (demoparser2 → cs2-demo-format/2.0 ZIP)
  → @cs2dak/core            load ZIP → normalize / derive signals / QA → AnalysisBundle
  → @cs2dak/cohort          cross-match aggregation, identity merging, season RR/PRISM
  → @cs2dak/presentation    product-neutral view models
  → @cs2dak/react           reusable React components
  → apps/dak-studio         Studio (pywebview desktop shell / browser)
```

The v2 ZIP is the only coupling point between Python and TypeScript — neither side imports the other.

| Package | Role |
|---|---|
| `@cs2dak/contract` | Zod schemas + TS types, re-exports `cs2-demo-format`. |
| `@cs2dak/core` | Pure analysis: normalization, economy, kills, clutches, timeline, heatmap, QA, RR/PRISM wiring. |
| `@cs2dak/cohort` | Cross-match aggregation, identity merging, season RR/PRISM shaping. |
| `@cs2dak/maps` | Map calibration, world→radar transforms, attack routes, zone geometry, callout mapping. |
| `@cs2dak/presentation` | Product-neutral view models, labels, workspace orchestration. |
| `@cs2dak/react` | React components consuming presentation contracts only. |
| `@cs2dak/cli` | Thin CLI wiring core to the filesystem. |
| `apps/dak-studio` | DAK Studio: local demo workbench (IndexedDB library). |
| `apps/demo-lab` | Component preview and fixture-review app (development). |
| `python/src/cs2dak` | Python exporter: CLI + pywebview desktop shell + PyInstaller packaging. |

### Quick Start

```bash
pnpm install
pnpm dev:studio        # DAK Studio (port 5178, .dem import via local uv env)
pnpm test              # vitest
pnpm python:test       # pytest
pnpm analyze:sample    # CLI analysis of the sample ZIP → fixtures/output/sample/
bash scripts/package.sh  # package the desktop app (DMG / exe)
```

Python is uv-managed: `cd python && uv sync --extra gui`, then `uv run cs2dak export <demo.dem>`.

## Downstream Consumers & Boundaries

- **RivalHub** consumes `@cs2dak/*` analysis and presentation models; owns tournament / season / team / match business logic.
- **CS2 Insight Agent** consumes v2 ZIPs and AnalysisBundles for conversational analysis.
- **rival-rating** is the sole owner of RR/PRISM formulas and calibration; this kit only derives signals and wires them in.
- **cs2-demo-format** owns the v2 ZIP contract; the contract package re-exports it, never forks it.

See [docs/module-boundaries.md](docs/module-boundaries.md) for module ownership, [docs/architecture.md](docs/architecture.md) for architecture, and [docs/release.md](docs/release.md) for the release flow.

## Reference Inspirations

Informed by, but not copied from: [CS Demo Manager](https://github.com/akiver/cs-demo-manager) (workspace structure), [AWPy](https://github.com/pnxenopoulos/awpy) (analysis rigor), [CS2 2D Demo Viewer](https://github.com/sparkoo/csgo-2d-demo-viewer) (replay frame models), [pr1maly](https://github.com/pr1malator/pr1maly) (local-first ideas; non-commercial license, product research only).

## License

MIT（仓库整体，含 Python exporter）。第三方移植与改编代码的出处见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
