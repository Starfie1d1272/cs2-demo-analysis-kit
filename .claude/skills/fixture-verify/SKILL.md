---
name: fixture-verify
description: Verify committed ZIP fixtures and affected TypeScript/Python consumers after fixture, parser, exporter, or cross-language contract changes, or when explicitly asked to verify fixtures.
---

# Fixture verification

Maintain `.agents/skills/fixture-verify/SKILL.md` as the canonical copy and synchronize
`.claude/skills/fixture-verify/SKILL.md` when editing it. Both discovery paths name
the same skill; loading both does not require running checks twice.

Follow the repository AGENTS.md for authorization, clarification, and completion.
Run commands from the workspace root, sourcing `/workspace/.onboarding/activate.sh`
first when present. Inspect the changed surface and select relevant checks; if
explicitly asked for full fixture verification, run all rows below.

| Changed surface | Check | Evidence |
|---|---|---|
| ZIP fixtures, schema, parser, or analysis pipeline | `pnpm analyze:sample` and `pnpm test:integration` | Committed sample analysis and real-ZIP acceptance/rejection/degradation |
| TypeScript consumers or analysis behavior | Relevant `pnpm vitest run <test-path>`; use `pnpm test` for broad impact | Assertions for affected behavior |
| Python Studio shell or native bridge | `pnpm python:test` | Python shell behavior; this does not validate the upstream cs2df exporter |

For a changed ZIP not exercised by these commands, validate that exact ZIP with
`cs2df validate <zip>` (in an environment containing cs2df) and exercise its affected
consumer. For exporter/contract changes, use the owning `cs2-demo-format` repo's
relevant checks and representative export when source demos are available. If the
exporter, fixture, or source demo is unavailable, state the unverified part rather
than treating shell tests as cross-language proof.

Diagnose failures before retrying. Continue independent checks when one fails;
rerun only after a relevant fix or environment change. Do not install unrelated
toolchains or run the full matrix for documentation-only edits.

Report commands and outcomes, exact fixture paths where applicable, and the first
schema/semantic mismatch when present. Distinguish setup failures from data failures,
list skipped/unavailable checks with reasons, and stop once the selected checks pass
or the remaining blocker is evidenced. Do not claim broader coverage than was run.
