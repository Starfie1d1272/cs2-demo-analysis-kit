#!/usr/bin/env bash
# One-shot desktop packaging: sync version -> build Studio frontend -> PyInstaller -> DMG.
# 默认只产出 DAK Studio（Studio 自带 exporter bridge，独立导出器没有发布价值）：
#   DAK Studio.app / dak-studio.exe  Studio 工作台（pywebview 托管前端 + exporter bridge）
# PACKAGE_EXPORTER=1 时额外打纯导出器 cs2dak.app / cs2dak.exe（本地调试用，不进 Release）。
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

if [[ "${PACKAGE_SKIP_VERSION_SYNC:-0}" == "1" ]]; then
  echo "==> [1/5] Skipping version sync"
else
  echo "==> [1/5] Syncing version into all manifests"
  if [[ -n "$VERSION_ARG" ]]; then
    node scripts/sync-version.mjs "$VERSION_ARG"
  else
    node scripts/sync-version.mjs
  fi
fi

echo "==> [2/5] Building DAK Studio frontend"
pnpm --filter @cs2dak/dak-studio build
STUDIO_WEB="python/src/cs2dak/studio_web"
rm -rf "$STUDIO_WEB"
cp -R apps/dak-studio/dist "$STUDIO_WEB"

# .tri 碰撞几何（awpy 导出，~30MB/图）：打进安装包后视觉反应/预瞄走 LOS 精确口径。
# 来源 $AWPY_TRIS_DIR（默认 ~/.awpy/tris，`uvx awpy get tris` 下载）。缺失只降级不报错。
TRIS_DIR="${AWPY_TRIS_DIR:-$HOME/.awpy/tris}"
if compgen -G "$TRIS_DIR/*.tri" > /dev/null; then
  mkdir -p "$STUDIO_WEB/tris"
  cp "$TRIS_DIR"/*.tri "$STUDIO_WEB/tris/"
  echo "    Bundled $(ls "$STUDIO_WEB/tris" | wc -l | tr -d ' ') .tri maps from $TRIS_DIR"
else
  echo "    WARNING: no .tri files in $TRIS_DIR — 反应时间/预瞄将走降级口径（uvx awpy get tris 可下载）"
fi

echo "==> [3/5] PyInstaller build (studio)"
cd python
uv sync --extra gui --extra build
if [[ "${PACKAGE_EXPORTER:-0}" == "1" ]]; then
  uv run pyinstaller packaging/cs2dak.spec --noconfirm --distpath dist
fi
uv run pyinstaller packaging/cs2dak-studio.spec --noconfirm --distpath dist
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
if [[ "$OSTYPE" == darwin* ]]; then
  echo "==> [4/5] Creating DMGs"

  # macOS DMG 标准 UX：必须包含指向 /Applications 的快捷方式。
  # 光秃秃的 .app 让用户不知道拖到哪；直接从挂载卷里双击会被 Gatekeeper
  # 静默拒绝（仅第一次弹 System Settings，之后没有任何提示）。
  make_dmg() {
    local app_path="$1"
    local dmg_path="$2"
    local app_name vol_name stage

    app_name="$(basename "$app_path")"
    vol_name="${app_name%.app}"
    stage="$(mktemp -d -t dak-dmg)"

    cp -R "$app_path" "$stage/"
    ln -s /Applications "$stage/Applications"

    # hdiutil -srcfolder 保留 symlink；挂载后用户看到 .app + Applications alias，
    # 拖到 Applications 就会完整解隔离。
    hdiutil create \
      -volname "$vol_name" \
      -srcfolder "$stage" \
      -ov \
      -format UDZO \
      "$dmg_path"

    rm -rf "$stage"
  }

  if [[ "${PACKAGE_EXPORTER:-0}" == "1" && -d python/dist/cs2dak.app ]]; then
    make_dmg python/dist/cs2dak.app "python/dist/cs2dak-${VERSION}.dmg"
  fi
  if [[ -d python/dist/DAK\ Studio.app ]]; then
    make_dmg "python/dist/DAK Studio.app" "python/dist/dak-studio-${VERSION}.dmg"
  else
    echo "    Skipped studio DMG: python/dist/DAK Studio.app not found"
  fi
else
  echo "==> [4/5] Skipped DMG: not macOS (PyInstaller output in python/dist/)"
fi

echo "==> [5/5] Done."
