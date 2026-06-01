# CS2 Demo Analysis Kit

English | [简体中文](./README.zh-CN.md)

`cs2-demo-analysis-kit` transforms `cs2-demo-format/2.0` packages into reusable analysis bundles, UI-ready view models, QA reports, and previewable React components for tournament websites, local demo tools, and research workflows.

It does **not** parse `.dem` files directly and does **not** own tournament business logic. Demo parsing belongs to tools such as CS2 Insight Agent, AWPy, or demoparser-based exporters. Tournament state belongs to products such as RivalHub.

## What This Repository Produces

Given a `cs2-demo-format/2.0` package, the kit produces:

- `analysis-bundle.json` - normalized match, round, player, economy, timeline, and spatial analysis.
- `view-model.json` - UI-ready data for dashboards, match pages, and local tools.
- `qa-report.json` - data quality checks for missing files, broken round continuity, missing economy coverage, unmapped players, and spatial data gaps.
- Preview UI - a demo lab showing how every analysis module can be presented.

## Packages

| Package | Role |
|---|---|
| `@cs2dak/contract` | Shared TypeScript types and Zod schemas for domain input, analysis output, UI view models, and QA reports. |
| `@cs2dak/maps` | Map calibration, world-to-radar transforms, and lightweight callout helpers. |
| `@cs2dak/core` | Pure analysis logic: normalization, scoreboard, economy, timeline, heatmap points, and QA. |
| `@cs2dak/react` | Previewable React components that consume `DemoViewModel` only. |
| `@cs2dak/cli` | CLI for analyzing JSON or ZIP packages and writing analysis/view-model/QA artifacts. |
| `@cs2dak/demo-lab` | Vite app for reviewing analysis modules and design language against fixtures. |

## Quick Start

```bash
pnpm install
pnpm analyze:sample
pnpm dev
```

The sample command writes generated artifacts to `fixtures/output/sample/`. The dev command starts the preview lab.

## Design Direction

The default theme borrows RivalHub's restrained esports operations language: dark tactical surfaces, thin grid structure, sharp low-radius panels, orange/blue team contrast, compact typography, and dense but scannable layouts. The components are intentionally product-neutral so they can be reused by RivalHub, CS2 Insight Agent, and future standalone demo tools.

## Reference Inspirations

This repository is informed by, but does not copy, these projects:

- [CS Demo Manager](https://github.com/akiver/cs-demo-manager) for mature match workspace structure, heatmaps, economy pages, and 2D viewer patterns.
- [AWPy](https://github.com/pnxenopoulos/awpy) for parser output, statistics, plotting, and analysis rigor.
- [CS2 2D Demo Viewer](https://github.com/sparkoo/csgo-2d-demo-viewer) for replay-oriented frame models.
- [pr1maly](https://github.com/pr1malator/pr1maly) for local-first personal analytics ideas. Its license is non-commercial, so treat it as product research only.

## Boundaries

- `cs2-demo-format` defines export package contracts.
- `cs2-demo-analysis-kit` transforms packages into analysis and presentation models.
- `rival-rating` owns RR/PRISM formulas and calibration.
- `CS2-insight-agent` owns local `.dem` parsing and package production.
- `RivalHub` owns tournament, season, team, player, and match business workflows.
