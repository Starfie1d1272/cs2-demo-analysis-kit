#!/usr/bin/env bash
# Publish the @cs2dak/* packages to npm, in dependency order.
#
# PREREQUISITES (do these first — see docs/publishing.md):
#   1. pnpm login                         (npm auth; you, not the agent)
#   2. cs2-demo-format published to npm   (contract depends on it)
#   3. @rivalhub/rival-rating published   (core depends on it)
#
# Then:  ./scripts/publish-npm.sh [--dry-run]
#
# What it does:
#   - rewrites the two github: deps to their npm semver ranges
#   - pnpm install (so they resolve from npm)
#   - pnpm publish contract -> maps -> core -> cohort -> react (workspace:* auto-resolved)
#
# Packages NOT published (intentionally): @cs2dak/cli and @cs2dak/demo-lab
# (private apps). @cs2dak/cohort is published for season-level aggregation.
set -euo pipefail
cd "$(dirname "$0")/.."

FORMAT_VERSION="${CS2_FORMAT_VERSION:-^2.2.0}"
RATING_VERSION="${RIVAL_RATING_VERSION:-^0.1.0}"
DRY_RUN=""
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN="--dry-run"

echo "==> Rewriting github: deps to npm versions"
node - "$FORMAT_VERSION" "$RATING_VERSION" <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
const [, , fmt, rating] = process.argv;
function setDep(path, dep, version) {
  const j = JSON.parse(readFileSync(path, "utf8"));
  if (j.dependencies?.[dep]) {
    j.dependencies[dep] = version;
    writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
    console.log(`  ${path}: ${dep} -> ${version}`);
  }
}
setDep("packages/contract/package.json", "cs2-demo-format", fmt);
setDep("packages/contract/package.json", "@rivalhub/rival-rating", rating);
setDep("packages/core/package.json", "@rivalhub/rival-rating", rating);
setDep("packages/cohort/package.json", "@rivalhub/rival-rating", rating);
JS

echo "==> pnpm install (resolve from npm)"
pnpm install

echo "==> Publishing in dependency order"
for pkg in contract maps core cohort react; do
  echo "  --> @cs2dak/$pkg"
  pnpm --filter "@cs2dak/$pkg" publish --access public --no-git-checks $DRY_RUN
done

echo "Done. Remember to commit the dep changes if you want them persisted,"
echo "or 'git checkout packages/*/package.json' to keep github: deps for local dev."
