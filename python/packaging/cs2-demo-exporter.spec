# PyInstaller spec — standalone desktop build. Unsigned.
#
#   pip install -e ".[gui,build]"
#   pyinstaller packaging/cs2-demo-exporter.spec
#
# Per-OS output (no Python needed on the user's machine):
#   Windows -> dist/cs2-demo-exporter.exe   (onefile, double-click to run)
#   macOS   -> dist/cs2-demo-exporter.app   (CI wraps it into a .dmg)
#
# demoparser2 is a native (Rust) extension, so we collect_all its binaries.
# The web/ assets are bundled as package data and resolved via __file__ at runtime.

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_data_files

IS_WIN = sys.platform.startswith("win")
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

datas = collect_data_files("cs2_demo_exporter", includes=["gui/web/*"])
binaries = []
hiddenimports = []
for pkg in ("demoparser2",):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    [str(SRC / "cs2_demo_exporter" / "gui" / "app.py")],
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
        name="cs2-demo-exporter",
        console=False,  # GUI app, no console window
        # icon="packaging/icon.ico",  # TODO: add app icon
    )
else:
    # macOS: onedir EXE -> COLLECT -> .app bundle (CI converts to .dmg).
    exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="cs2-demo-exporter", console=False)
    coll = COLLECT(exe, a.binaries, a.datas, name="cs2-demo-exporter")
    app = BUNDLE(
        coll,
        name="cs2-demo-exporter.app",
        bundle_identifier="dev.starfield.cs2demoexporter",
        # icon="packaging/icon.icns",  # TODO: add app icon
    )
