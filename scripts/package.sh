#!/usr/bin/env bash
# One-shot desktop packaging: sync version -> build Studio frontend -> PyInstaller -> DMG.
# 产出两个应用：
#   cs2dak.app / cs2dak.exe          纯导出器（pywebview exporter GUI）
#   DAK Studio.app / dak-studio.exe  Studio 工作台（pywebview 托管前端 + exporter bridge）
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

echo "==> [1/5] Syncing version into all manifests"
if [[ -n "$VERSION_ARG" ]]; then
  node scripts/sync-version.mjs "$VERSION_ARG"
else
  node scripts/sync-version.mjs
fi

echo "==> [2/5] Building DAK Studio frontend"
pnpm --filter @cs2dak/dak-studio build
STUDIO_WEB="python/src/cs2dak/studio_web"
rm -rf "$STUDIO_WEB"
cp -R apps/dak-studio/dist "$STUDIO_WEB"

echo "==> [3/5] PyInstaller build (exporter + studio)"
cd python
uv sync --extra gui --extra build
uv run pyinstaller packaging/cs2dak.spec --noconfirm --distpath dist
uv run pyinstaller packaging/cs2dak-studio.spec --noconfirm --distpath dist
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
if [[ "$OSTYPE" == darwin* ]]; then
  echo "==> [4/5] Creating DMGs"
  APP="python/dist/cs2dak.app"
  if [[ -d "$APP" ]]; then
    DMG="python/dist/cs2dak-${VERSION}.dmg"
    rm -f "$DMG"
    hdiutil create -volname "CS2 Demo Exporter" -srcfolder "$APP" -ov -format UDZO "$DMG"
  else
    echo "    Skipped exporter DMG: $APP not found"
  fi
  STUDIO_APP="python/dist/DAK Studio.app"
  if [[ -d "$STUDIO_APP" ]]; then
    STUDIO_DMG="python/dist/dak-studio-${VERSION}.dmg"
    rm -f "$STUDIO_DMG"
    hdiutil create -volname "DAK Studio" -srcfolder "$STUDIO_APP" -ov -format UDZO "$STUDIO_DMG"
  else
    echo "    Skipped studio DMG: $STUDIO_APP not found"
  fi
else
  echo "==> [4/5] Skipped DMG: not macOS (PyInstaller output in python/dist/)"
fi

echo "==> [5/5] Done."
