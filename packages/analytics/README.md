# @cs2dak/analytics

Domain insights and projections over DAK match facts: economy conversion, player and team summaries, mechanics, map roles, tactical findings, and tournament adapters.

The package derives rating inputs and cross-domain insights from canonical facts. Rating formulas belong to rating; spatial and engagement analysis belongs to tactics. Inputs explicitly carry Demo packages, canonical facts, or already aggregated rows. Core remains the owner of event attribution and Tournament owns its cross-map merge rules. Output UI models belong to `@cs2dak/presentation`.

```ts
import { buildMatchBuyQuality } from '@cs2dak/analytics';

const buyQuality = buildMatchBuyQuality(economyRows);
```

`buildMatchWorkspaceFromAnalysis(pkg, analysis, performanceFacts, options?)` projects a workspace from an existing analysis bundle. Use `@cs2dak/pipeline` when starting from a raw DemoPackage. Consumers that already have UI models install `@cs2dak/presentation` and `@cs2dak/react` directly.

The root publishes compiled ESM and declarations. No filesystem, network, storage, or product navigation is owned here.

The optional `DemoViewOptions` supplies `radarImageUrl` and `lowerRadarImageUrl`; omitted URLs become `null`. Asset paths belong to the embedding product.

The `workspace-0.2` result includes required `buyQuality`, per-player `roundSummary`, and `reportHighlights`. Presentation formats these precomputed results. The workspace join checks the source hash, schema/map/tickrate/team metadata, canonical player-round rows and scoreboard roster before projection. This detects mismatched inputs; it is not authentication or a general tamper-proof payload check.
