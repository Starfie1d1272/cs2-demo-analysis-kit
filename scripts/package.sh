#!/usr/bin/env bash
# One-shot desktop packaging: sync version -> build Studio frontend -> PyInstaller -> DMG.
# 产出 DAK Studio（Studio 自带 exporter bridge，独立导出器已删除）：
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

# Capture provenance after optional sync, before generating any output.
DAK_BUILD_INFO="$(node scripts/build-info.mjs)"
export DAK_BUILD_INFO
export DAK_APP_VERSION="$(node -e 'console.log(JSON.parse(process.env.DAK_BUILD_INFO).releaseVersion)')"
ARTIFACT_ID="$(node -e 'console.log(JSON.parse(process.env.DAK_BUILD_INFO).artifactId)')"
PACKAGE_MODE="$(node -e 'console.log(JSON.parse(process.env.DAK_BUILD_INFO).packageMode)')"
DIST_PATH="$ROOT/python/dist"
if [[ "$PACKAGE_MODE" == "ad-hoc" ]]; then
  DIST_PATH="$DIST_PATH/dak-studio-$ARTIFACT_ID"
fi
if [[ "$OSTYPE" == darwin* ]]; then
  ARTIFACT="$DIST_PATH/dak-studio-$ARTIFACT_ID.dmg"
else
  ARTIFACT="$DIST_PATH/dak-studio"
fi
node - <<'NODE'
const b = JSON.parse(process.env.DAK_BUILD_INFO);
console.log(`Version sync: ${b.versionSync}
Release version: ${b.releaseVersion}
Git revision: ${b.buildRevision ?? 'unknown'}
Working tree: ${b.buildDirty === null ? 'unknown' : b.buildDirty ? 'dirty' : 'clean'}
Package mode: ${b.packageMode}`);
if (b.buildDirty) console.warn('WARNING: Packaging local working tree changes (dirty source).');
if (b.buildRevision === null) console.warn('WARNING: Git metadata unavailable; revision and source state are unknown.');
NODE
echo "Output artifact: $ARTIFACT"

echo "==> [2/5] Building DAK Studio frontend"
pnpm -r --filter "@cs2dak/dak-studio..." --if-present build
STUDIO_WEB="python/src/cs2dak/studio_web"
rm -rf "$STUDIO_WEB"
cp -R apps/dak-studio/dist "$STUDIO_WEB"
rm -rf "$STUDIO_WEB/tris"

# 0.7.0 起采用 Web Installer 模式：
#   - 安装包很小（~20MB runtime），安装阶段从 R2 拉取内置赛事包 + 所需 .tri
#   - .tri 放入 assets/tris/ overlay，内置赛事放入 assets/bundled-events/
#   - 首启即完整体验，运行时缺图按需下载兜底
#   - 资产由发版 CI（release.yml）上传到 R2
# .tri 自 0.6.4 起不再打进安装包；内置赛事自 0.7.0 起也不再打进 Vite bundle。

echo "==> [3/5] PyInstaller build (studio)"
cd python
uv sync --extra gui --extra build
uv run pyinstaller packaging/cs2dak-studio.spec --noconfirm --distpath "$DIST_PATH"
cd "$ROOT"

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

  if [[ -d "$DIST_PATH/DAK Studio.app" ]]; then
    make_dmg "$DIST_PATH/DAK Studio.app" "$ARTIFACT"
  else
    echo "    Skipped studio DMG: python/dist/DAK Studio.app not found"
  fi
else
  echo "==> [4/5] Skipped DMG: not macOS (PyInstaller output in python/dist/)"
fi

echo "==> [5/5] Done. Output artifact: $ARTIFACT"
