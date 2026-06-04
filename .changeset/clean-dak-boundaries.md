---
"@cs2dak/contract": major
"@cs2dak/core": major
"@cs2dak/cohort": major
"@cs2dak/presentation": major
"@cs2dak/react": major
---

Establish strict module boundaries for the v2-only analysis pipeline.

- Move view models, labels, and workspace composition into `@cs2dak/presentation`.
- Add deterministic analysis and cohort provenance contracts.
- Remove v1 normalization and obsolete React exports.
- Keep leaderboard ordering outside cohort aggregation.
