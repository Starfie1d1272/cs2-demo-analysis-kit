# PyInstaller spec — DAK Studio 桌面应用（pywebview 壳 + exporter）。Unsigned.
#
#   pnpm --filter @cs2dak/dak-studio build  （并把 dist/ 拷到 src/cs2dak/studio_web/）
#   uv sync --extra gui --extra build
#   uv run pyinstaller packaging/cs2dak-studio.spec
#
# 一体化封装：Python exporter 与 Studio 前端（静态 SPA）打进同一个应用，
# 运行时不需要 Node —— 前端只是 pywebview 托管的构建产物，分析在浏览器引擎里跑。
# 推荐入口是 scripts/package.sh（会先构建前端再打包）。

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_data_files

IS_WIN = sys.platform.startswith("win")
ROOT = Path(SPECPATH).resolve()         # python/packaging/
SRC = (ROOT / ".." / "src").resolve()   # python/src/

datas = collect_data_files("cs2dak", includes=["studio_web/**"])
binaries = []
hiddenimports = []
for pkg in ("demoparser2",):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    [str(SRC / "cs2dak" / "studio.py")],
    pathex=[str(SRC)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "pytest"],
)
pyz = PYZ(a.pure)

if IS_WIN:
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.datas,
        [],
        name="dak-studio",
        console=False,
        icon=str(ROOT / "icon.ico"),
    )
else:
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name="dak-studio",
        console=False,
        icon=str(ROOT / "icon.icns"),
    )
    coll = COLLECT(exe, a.binaries, a.datas, name="dak-studio")
    app = BUNDLE(
        coll,
        name="DAK Studio.app",
        icon=str(ROOT / "icon.icns"),
        bundle_identifier="dev.cs2dak.studio",
    )
