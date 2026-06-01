---
name: fixture-verify
description: Verify Python exporter and TS core produce consistent output for all fixtures
---

Run in order:
1. `pnpm python:export:sample` — re-export fixtures from .dem
2. `pnpm analyze:sample` — re-analyze the exported ZIP
3. `pnpm test` — run TS unit tests
4. `pnpm python:test` — run Python tests
Report any failures and diff key fields in fixtures/output/.
