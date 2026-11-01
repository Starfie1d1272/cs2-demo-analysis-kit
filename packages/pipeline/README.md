# @cs2dak/pipeline

Application-facing composition of DAK analysis and UI projection.

```ts
import { analyzeMatchWorkspace } from '@cs2dak/pipeline';

const model = analyzeMatchWorkspace(demoPackage, {
  radarImageUrl: '/my-assets/de_nuke.png',
  lowerRadarImageUrl: '/my-assets/de_nuke_lower.png',
});
```

`analyzeMatchWorkspace` normalizes the input, builds canonical performance facts, runs single-match analysis, and projects the workspace model including precomputed economy results. File loading, persistence, caching, and permissions remain with the application.

Render an existing workspace model directly with `@cs2dak/react`; UI consumers do not depend on this package.

The optional second argument is `DemoViewOptions`; omitted image URLs default to `null`. The host owns asset URLs. Studio supplies its relative radar paths from its library layer.

The output uses `workspace-0.2`, with precomputed `buyQuality`, `players[].roundSummary`, and `reportHighlights`. Report helpers only format those results.
