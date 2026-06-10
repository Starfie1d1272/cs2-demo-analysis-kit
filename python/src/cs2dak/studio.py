"""DAK Studio 桌面壳：pywebview 托管 Studio 前端构建产物 + .dem 导出桥。

打包链路（scripts/package.sh）：
  1. pnpm 构建 apps/dak-studio → dist/
  2. dist/ 拷贝到本包 studio_web/（gitignored，构建产物）
  3. PyInstaller（packaging/cs2dak-studio.spec）连同 exporter 打成单一应用

前端通过 window.pywebview.api 调用本桥：
  - pick_dems():        原生文件对话框选 .dem
  - export_dem_path():  按路径导出为 v2 ZIP，base64 回传（ZIP 仅 1–3MB）

数据流向与 dev 模式一致：.dem → exporter → v2 ZIP → 前端 IndexedDB。
.dem 本身不进库，导出的临时 ZIP 用完即删。
"""

from __future__ import annotations

import base64
import shutil
import tempfile
from pathlib import Path

from . import __version__

WEB_DIR = Path(__file__).parent / "studio_web"


class StudioApi:
    """Bridge exposed to the Studio frontend as window.pywebview.api.*"""

    def __init__(self) -> None:
        self._window = None  # set in main() after window creation

    # --- info -----------------------------------------------------------
    def get_version(self) -> str:
        return __version__

    # --- .dem import ----------------------------------------------------
    def pick_dems(self) -> list[str]:
        """Open a native file dialog and return chosen .dem paths."""
        import webview

        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=True,
            file_types=("Demo files (*.dem)", "All files (*.*)"),
        )
        return list(result or [])

    def export_dem_path(self, path: str) -> dict:
        """Export one .dem to a v2 ZIP and return its bytes base64-encoded.

        Returns {ok, fileName, dataBase64} or {ok: False, error}.
        ZIP stays small (columnar replay), so the base64 bridge transfer is cheap;
        the temp dir is removed afterwards either way.
        """
        from .cli import _export_one

        dem = Path(path)
        tmp_dir = Path(tempfile.mkdtemp(prefix="cs2dak-studio-"))
        try:
            zip_path = _export_one(dem, tmp_dir)
            data = zip_path.read_bytes()
            return {
                "ok": True,
                "fileName": zip_path.name,
                "dataBase64": base64.b64encode(data).decode("ascii"),
            }
        except Exception as exc:  # noqa: BLE001 - surface parse failures to the UI
            return {"ok": False, "error": str(exc)}
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)


def main() -> None:
    """gui-script entry point (see pyproject [project.gui-scripts])."""
    import webview

    index = WEB_DIR / "index.html"
    if not index.exists():
        raise SystemExit(
            "studio_web/ 构建产物缺失。先运行 scripts/package.sh，"
            "或手动：pnpm --filter @cs2dak/dak-studio build 后把 dist/ 拷到 "
            f"{WEB_DIR}"
        )

    api = StudioApi()
    window = webview.create_window(
        title=f"DAK Studio {__version__}",
        url=str(index),
        js_api=api,
        width=1440,
        height=920,
        min_size=(1024, 700),
    )
    api._window = window
    # http_server=True：以 localhost HTTP 提供 studio_web，保证 IndexedDB
    # 持久化与相对资源（雷达图）在 WKWebView 下行为与浏览器一致。
    webview.start(http_server=True)


if __name__ == "__main__":
    main()
