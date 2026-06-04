# Changelog

All notable changes to this project are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/), and the project
adheres to [Semantic Versioning](https://semver.org/). The single source of
truth for the version is the git tag (`vX.Y.Z`); `pnpm sync-version`
propagates it into every manifest.

## [0.2.1] — 2026-06-04

### Fixed
- Replaced the invalid published `@rivalhub/rival-rating` GitHub dependency
  with npm `^0.1.0`; consumers must use `@cs2dak/*` 0.2.1 or newer.

### Changed
- Published `@cs2dak/cohort` for season-level RR/PRISM aggregation.
- Synced all workspace and Python package versions to 0.2.1.

## [0.2.0] — 2026-06-04

First consolidated release of the analysis kit as the shared middle layer
(`.dem → v2 ZIP → @cs2dak/* → products`).

### Added
- `@cs2dak/core`: `buildEconomyConversion()` + `economyLabelCn()` — per-team
  per-economy-type round win conversion, derived from `EconomyPoint[]`.
- `@cs2dak/react`: `EconomyConversionPanel` (kit-styled, win-rate bars) and an
  `onPlayerClick` slot on `ScoreboardTable` for embedding apps.
- `@cs2dak/maps`: zone geometry (`zoneAt` / `pointInPolygon`) for map-control
  signals (calibration data pending).
- Canvas heatmap (`HeatmapCanvas`, two-pass), `KillFeed`, unified weapon-name
  table (`displayWeaponName`), and the `MatchWorkspace` view model.
- Desktop packaging: PyInstaller spec bundling the demo-lab viewer (`_MEIPASS`
  resolution), app icons, and `scripts/package.sh` (viewer build → PyInstaller
  → DMG on macOS).
- Release tooling: `scripts/sync-version.mjs` (git-tag-driven version sync).

### Changed
- Map calibration unified in `@cs2dak/maps` (`getMapCalibration` /
  `worldToRadar`, with out-of-bounds detection and `radarSize`).
- RR v2 account ratings wired through `@rivalhub/rival-rating`
  (`computeAccountRatingsV2`); PRISM eight-axis wired for single-match preview.

[0.2.1]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.2.1
[0.2.0]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.2.0
