#!/usr/bin/env bash
# Self-contained uploader runtime. No assets, installer downloads or updater.
set -euo pipefail
cd "$(dirname "$0")/.."
# Windows builds use a managed runtime with the current TLS implementation.
# Keep the startup/installer workflow Python version aligned with this pin.
export UV_FROZEN=true
if [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* ]]; then
  export UV_MANAGED_PYTHON=true
  uv python install 3.12.15 --no-bin --no-registry
  export UV_PYTHON
  UV_PYTHON="$(uv python find --managed-python 3.12.15)"
fi
pnpm build:uploader
python3 - <<'PY'
from pathlib import Path
import shutil
source = Path('apps/rivalhub-uploader/dist')
target = Path('python/src/cs2dak/rivalhub_uploader_web')
if target.exists():
    shutil.rmtree(target)
shutil.copytree(source, target)
PY
VERSION="$(node -p "require('./package.json').version")"
cd python
uv sync --frozen --extra gui --extra build
uv run --frozen python - <<'RUNTIME'
import platform
import ssl
import sys
print(f"Uploader build runtime: Python {platform.python_version()}, {ssl.OPENSSL_VERSION}")
if sys.platform == "win32" and (ssl.OPENSSL_VERSION_INFO < (3, 5) or not ssl.HAS_TLSv1_3):
    raise SystemExit("Windows uploader requires OpenSSL 3.5+ and TLS 1.3")
RUNTIME
uv run pyinstaller packaging/rivalhub-uploader.spec --noconfirm --clean --distpath dist
uv run python ../scripts/check-desktop-notices.py dist uploader
if [[ "$OSTYPE" == darwin* ]]; then
  STAGE="$(mktemp -d -t rivalhub-uploader-dmg)"
  trap 'rm -rf "$STAGE"' EXIT
  cp -R "dist/RivalHub Demo Uploader.app" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  hdiutil create -volname "RivalHub Demo Uploader" -srcfolder "$STAGE" -ov -format UDZO "dist/rivalhub-demo-uploader-${VERSION}.dmg"
elif [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* ]]; then
  powershell.exe -NoProfile -File ../scripts/build-uploader-installer.ps1 -Version "$VERSION"
  (cd dist && 7z a -mx=9 "rivalhub-demo-uploader-windows-${VERSION}.zip" rivalhub-demo-uploader)
  uv run python ../scripts/check-desktop-notices.py "dist/rivalhub-demo-uploader-windows-${VERSION}.zip" uploader
else
  echo "Uploader distribution requires Windows or macOS" >&2
  exit 1
fi
uv run python - <<'PY'
from pathlib import Path
root = Path('dist/rivalhub-demo-uploader')
size = sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
print(f'Uploader runtime: {size / 1024 / 1024:.2f} MiB')
for p in Path('dist').glob('rivalhub-demo-uploader-*'):
    if p.is_file():
        print(f'{p.name}: {p.stat().st_size / 1024 / 1024:.2f} MiB')
PY
