---
name: fixture-verify
description: Verify committed ZIP fixtures and TypeScript/Python consumers still agree
---

Run in order:
1. `pnpm analyze:sample` — analyze the committed sample ZIP into `fixtures/output/sample/`
2. `pnpm test` — run fast TS unit tests
3. `pnpm test:integration` — run real-ZIP integration tests when fixture coverage matters
4. `pnpm python:test` — run Python Studio shell tests
Report failures with the exact fixture path and the first schema/semantic mismatch.
