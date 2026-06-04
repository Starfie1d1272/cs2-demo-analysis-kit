#!/usr/bin/env bash
# One-shot exporter desktop packaging: sync version -> PyInstaller -> DMG.
#
#   ./scripts/package.sh            # version derived from the latest git tag
#   ./scripts/package.sh 0.3.0      # explicit version
#
# Prereqs: pnpm, uv, Node. On macOS the .app is wrapped into a .dmg; on other
# platforms PyInstaller's output is left in python/dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
VERSION_ARG="${1:-}"

echo "==> [1/3] Syncing version into all manifests"
if [[ -n "$VERSION_ARG" ]]; then
  node scripts/sync-version.mjs "$VERSION_ARG"
else
  node scripts/sync-version.mjs
fi

echo "==> [2/3] PyInstaller build"
cd python
uv sync --extra gui --extra build
uv run pyinstaller packaging/cs2dak.spec --noconfirm --distpath dist
cd "$ROOT"

APP="python/dist/cs2dak.app"
if [[ "$OSTYPE" == darwin* ]]; then
  if [[ -d "$APP" ]]; then
    VERSION="$(node -p "require('./package.json').version")"
    DMG="python/dist/cs2dak-${VERSION}.dmg"
    echo "==> [3/3] Creating DMG -> $DMG"
    rm -f "$DMG"
    hdiutil create -volname "CS2 Demo Exporter" -srcfolder "$APP" -ov -format UDZO "$DMG"
  else
    echo "==> [3/3] Skipped DMG: $APP not found"
  fi
else
  echo "==> [3/3] Skipped DMG: not macOS (PyInstaller output in python/dist/)"
fi

echo "Done."
