# -*- mode: python ; coding: utf-8 -*-
"""DAK Studio Web Installer — PyInstaller onefile spec。

极简打包：只含 tkinter + installer 逻辑，不含 studio_web/、cs2df 等重依赖。
产物 ~15MB，联网后下载 runtime + events + tris 完成安装。
"""

import json
import os
from pathlib import Path

candidate_tag = os.environ.get("PACKAGE_CANDIDATE_TAG")
candidate_data = []
if candidate_tag:
    config = Path("build/dak-installer-candidate.json")
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text(json.dumps({"tag": candidate_tag}), encoding="utf-8")
    candidate_data.append((str(config.resolve()), "."))

a = Analysis(
    ["../src/cs2dak/installer.py"],
    pathex=["../src"],
    binaries=[],
    datas=candidate_data,
    hiddenimports=[
        "tkinter",
        "tkinter.ttk",
        "tkinter.filedialog",
        "tkinter.messagebox",
        "cs2dak",
        "cs2dak.updater",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # 排除所有 Studio 重依赖，installer 不需要
        "cs2dak.studio",
        "cs2df",
        "pyarrow",
        "polars",
        "pandas",
        "numpy",
        "webview",
        "awpy",
        "matplotlib",
        "PIL",
        "cv2",
        "sklearn",
    ],
    no_warn=False,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="DAK-Studio-Setup",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
