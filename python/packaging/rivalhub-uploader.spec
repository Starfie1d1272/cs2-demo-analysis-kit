# Standalone RivalHub Demo Uploader; no Studio assets or updater.
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules, copy_metadata

IS_WIN = sys.platform.startswith("win")
ROOT = Path(SPECPATH).resolve()         # python/packaging/
SRC = (ROOT / ".." / "src").resolve()   # python/src/

datas = []
# 显式收集 rivalhub_uploader_web/，不依赖 collect_data_files 的包名解析。
# collect_data_files 在 uv sync 非 editable 安装时从 site-packages 解析包路径，
# 如果 wheel 没把 rivalhub_uploader_web/ 打进去（hatchling artifacts 依赖）就会缺文件。
rivalhub_uploader_web_dir = SRC / "cs2dak" / "rivalhub_uploader_web"
if rivalhub_uploader_web_dir.is_dir():
    for f in rivalhub_uploader_web_dir.rglob("*"):
        if f.is_file():
            dest = str(f.parent.relative_to(SRC / "cs2dak"))
            datas.append((str(f), dest))
else:
    raise SystemExit(
        f"rivalhub_uploader_web/ not found at {rivalhub_uploader_web_dir}. "
        "Run: pnpm --filter @cs2dak/rivalhub-demo-uploader build && "
        "cp -R apps/rivalhub-demo-uploader/dist python/src/cs2dak/rivalhub_uploader_web"
    )

binaries = []
hiddenimports = []

def keep_runtime_module(name: str) -> bool:
    blocked_parts = (
        ".tests",
        ".testing",
        "._testing",
        ".bench",
        ".benchmarks",
        ".conftest",
        "._pyinstaller",
    )
    blocked_names = (
        "benchmark",
        "conftest",
        "pytest",
        "_pytest",
        "_test",
        "test_",
        "testutils",
    )
    return (
        not any(part in name for part in blocked_parts)
        and name != "cs2df.cli"
        and not any(segment.startswith(blocked_names) for segment in name.split("."))
        and not any(
            segment.endswith(("_test", "_tests", "_testing"))
            for segment in name.split(".")
        )
    )

for pkg in (
    # cs2df runtime: parser extension, pandas columnar results and numpy.
    # demoparser2 declares polars/pyarrow as optional conversion backends; the
    # reference exporter consumes pandas DataFrames and never imports either.
    "cs2df", "pandas", "numpy",
):
    datas += collect_data_files(pkg, include_py_files=False)
    binaries += collect_dynamic_libs(pkg)
    hiddenimports += collect_submodules(pkg, filter=keep_runtime_module)

# Runtime version for diagnostic logs.
datas += copy_metadata("cs2dak")

a = Analysis(
    [str(SRC / "cs2dak" / "rivalhub_uploader.py")],
    pathex=[str(SRC)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "pytest", "pyarrow", "polars", "_polars_runtime_32"],
)
pyz = PYZ(a.pure)

if IS_WIN:
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name="rivalhub-demo-uploader",
        console=False,
        icon=str(ROOT / "icon.ico"),
    )
    coll = COLLECT(exe, a.binaries, a.datas, name="rivalhub-demo-uploader")
else:
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name="rivalhub-demo-uploader",
        console=False,
        icon=str(ROOT / "icon.icns"),
    )
    coll = COLLECT(exe, a.binaries, a.datas, name="rivalhub-demo-uploader")
    app = BUNDLE(
        coll,
        name="RivalHub Demo Uploader.app",
        icon=str(ROOT / "icon.icns"),
        bundle_identifier="dev.cs2dak.rivalhub-uploader",
    )
