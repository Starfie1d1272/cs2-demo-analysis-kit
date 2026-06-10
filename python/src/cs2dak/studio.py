"""DAK Studio 桌面壳：pywebview 托管 Studio 前端构建产物 + .dem 导出桥。

打包链路（scripts/package.sh）：
  1. pnpm 构建 apps/dak-studio → dist/
  2. dist/ 拷贝到本包 studio_web/（gitignored，构建产物）
  3. PyInstaller（packaging/cs2dak-studio.spec）连同 exporter 打成单一应用

前端通过 window.pywebview.api 调用本桥：
  - pick_dems():        原生文件对话框选 .dem/.zip
  - export_dem_path():  按路径导出为 v2 ZIP，base64 回传（ZIP 仅 1–3MB）
  - export_dem_bytes(): 按字节导出（Windows 拖拽无路径时的回退）
  - get_drop_path():    拖拽后按文件名解析本机路径（macOS WKWebView）

数据流向与 dev 模式一致：.dem → exporter → v2 ZIP → 前端 IndexedDB。
.dem 本身不进库，导出的临时 ZIP 用完即删。
"""

from __future__ import annotations

import base64
import os
import shutil
import sys
import tempfile
import urllib.parse
from pathlib import Path

from cs2dak import __version__
from webview.dom import _dnd_state

# 强制在任意拖拽操作中捕获文件路径，即使前端使用标准浏览器
# drop 事件（而非 pywebview DOM 事件系统）。默认为 0，只有
# pywebview element.events.drop 注册监听器后才会计数；而我们
# 使用 React onDrop，永远不会触发该计数。
_dnd_state["num_listeners"] = max(_dnd_state["num_listeners"], 1)

# PyInstaller 打包后 __file__ 指向 Contents/Frameworks/（不含数据文件），
# 实际资源在 sys._MEIPASS 临时目录。未打包时回退到源码目录。
if getattr(sys, "frozen", False):
    WEB_DIR = Path(sys._MEIPASS) / "studio_web"
else:
    WEB_DIR = Path(__file__).parent / "studio_web"


def _studio_userdata() -> Path:
    """Platform-appropriate persistent directory for cookies / IndexedDB / localStorage.

    macOS   → ~/Library/Application Support/DAK Studio/userdata
    Windows → %APPDATA%/DAK Studio/userdata
    Other   → ~/.dak-studio/userdata
    """
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "DAK Studio"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / "DAK Studio"
    else:
        base = Path.home() / ".dak-studio"
    path = base / "userdata"
    path.mkdir(parents=True, exist_ok=True)
    return path


class StudioApi:
    """Bridge exposed to the Studio frontend as window.pywebview.api.*"""

    def __init__(self) -> None:
        self._window = None  # set in main() after window creation

    # --- info -----------------------------------------------------------
    def get_version(self) -> str:
        return __version__

    # --- .dem import ----------------------------------------------------
    def pick_dems(self) -> list[str]:
        """Open a native file dialog and return chosen .dem / .zip paths."""
        import webview

        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=True,
            file_types=("Demo / v2 ZIP (*.dem;*.zip)", "All files (*.*)"),
        )
        return list(result or [])

    def export_dem_path(self, path: str) -> dict:
        """Export one .dem to a v2 ZIP and return its bytes base64-encoded.

        Returns {ok, fileName, dataBase64} or {ok: False, error}.
        ZIP stays small (columnar replay), so the base64 bridge transfer is cheap;
        the temp dir is removed afterwards either way.
        """
        from cs2dak.cli import _export_one

        dem = Path(path)
        # 原生对话框也允许直接选 v2 ZIP：不经 exporter，原样回传字节。
        if dem.suffix.lower() == ".zip":
            try:
                return {
                    "ok": True,
                    "fileName": dem.name,
                    "dataBase64": base64.b64encode(dem.read_bytes()).decode("ascii"),
                }
            except OSError as exc:
                return {"ok": False, "error": str(exc)}
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

    def export_dem_bytes(self, name: str, data_b64: str) -> dict:
        """Export .dem raw bytes (base64) to a v2 ZIP.

        Used by the frontend when drag-and-drop cannot provide a filesystem path
        (e.g. Windows pywebview). Writes the bytes to a temp file, runs the
        exporter, and returns the ZIP the same way export_dem_path does.
        """
        from cs2dak.cli import _export_one

        tmp_dir = Path(tempfile.mkdtemp(prefix="cs2dak-studio-"))
        try:
            dem_path = tmp_dir / name
            dem_path.write_bytes(base64.b64decode(data_b64))
            zip_path = _export_one(dem_path, tmp_dir)
            data = zip_path.read_bytes()
            return {
                "ok": True,
                "fileName": zip_path.name,
                "dataBase64": base64.b64encode(data).decode("ascii"),
            }
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def get_drop_path(self, filename: str) -> str | None:
        """Resolve the native filesystem path for a file dropped onto the webview.

        When the frontend uses standard browser drop events (React onDrop),
        pywebview's DOM event system doesn't inject ``pywebviewFullPath``.
        This method lets the caller look up the path from ``_dnd_state``,
        which is populated by ``performDragOperation_`` on every external
        drop (Finder / Explorer → WKWebView / Edge Chromium).

        Returns the absolute path if found, or ``None`` if the file wasn't
        dropped in the current operation (e.g. selected via <input type="file">).
        """
        for item in _dnd_state["paths"]:
            if urllib.parse.unquote(item[0]) == filename:
                _dnd_state["paths"].remove(item)
                return urllib.parse.unquote(item[1])
        return None


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
    # private_mode=False：Windows Edge Chromium 默认隐私模式会把
    # IndexedDB 等数据存到临时目录，重启丢失；显式关掉后落盘到持久目录。
    storage = _studio_userdata()
    webview.start(http_server=True, private_mode=False, storage_path=str(storage))


if __name__ == "__main__":
    main()
