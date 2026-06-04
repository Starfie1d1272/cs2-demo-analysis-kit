# PyInstaller spec — standalone desktop build. Unsigned.
#
#   uv sync --extra gui --extra build
#   uv run pyinstaller packaging/cs2dak.spec
#
# Per-OS output (no Python needed on the user's machine):
#   Windows -> dist/cs2dak.exe   (onefile, double-click to run)
#   macOS   -> dist/cs2dak.app   (CI wraps it into a .dmg)
#
# demoparser2 is a native (Rust) extension, so we collect_all its binaries.
# The web/ assets are bundled as package data and resolved via __file__ at runtime.

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_data_files

IS_WIN = sys.platform.startswith("win")
ROOT = Path(SPECPATH).resolve()         # python/packaging/
SRC = (ROOT / ".." / "src").resolve()   # python/src/

datas = collect_data_files("cs2dak", includes=["gui/web/*"])
binaries = []
hiddenimports = []
for pkg in ("demoparser2",):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    [str(SRC / "cs2dak" / "gui" / "app.py")],
    pathex=[str(SRC)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "pytest"],
)
pyz = PYZ(a.pure)

if IS_WIN:
    # Onefile .exe: fold binaries + datas into a single executable.
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.datas,
        [],
        name="cs2dak",
        console=False,  # GUI app, no console window
        icon=str(ROOT / "icon.ico"),
    )
else:
    # macOS: onedir EXE -> COLLECT -> .app bundle (CI converts to .dmg).
    exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="cs2dak", console=False)
    coll = COLLECT(exe, a.binaries, a.datas, name="cs2dak")
    app = BUNDLE(
        coll,
        name="cs2dak.app",
        bundle_identifier="dev.starfield.cs2demoexporter",
        icon=str(ROOT / "icon.icns"),
    )
