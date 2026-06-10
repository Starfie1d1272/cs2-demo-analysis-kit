"""pywebview exporter window + JS<->Python bridge.

The `Api` class is exposed to the web frontend as `window.pywebview.api`. Each
method is callable from JS and returns plain JSON-serializable data. Keep heavy
work off the UI thread: pywebview runs JS API calls on a worker thread, so the
window stays responsive while a demo parses.

The GUI is intentionally a thin exporter surface. Product-level demo browsing
and analysis belong to DAK Studio.

macOS notes
-----------
When running Python outside a proper .app bundle, WKWebView emits sandbox
extension errors to stderr about directories it cannot create under
~/Library/WebKit (MediaKeys, IndexedDB, LocalStorage, etc.). These are
harmless and do NOT affect rendering, file dialogs, or the JS bridge.
They disappear once the app is bundled with PyInstaller.
"""

from __future__ import annotations

import sys
from pathlib import Path

from cs2dak import __version__

if getattr(sys, "frozen", False):
    WEB_DIR = Path(sys._MEIPASS) / "web"
else:
    WEB_DIR = Path(__file__).parent / "web"

# Default output directory works cross-platform:
#   macOS  → /Users/<name>/cs2-demo-exports
#   Windows → C:\Users\<name>\cs2-demo-exports
#   Linux   → /home/<name>/cs2-demo-exports
DEFAULT_OUT_DIR = Path.home() / "cs2-demo-exports"


class Api:
    """Bridge exposed to the frontend as window.pywebview.api.*"""

    def __init__(self) -> None:
        self._window = None  # main window, set in main() after creation
        self._out_dir = DEFAULT_OUT_DIR

    # --- info ---------------------------------------------------------------
    def get_version(self) -> str:
        return __version__

    def get_output_dir(self) -> str:
        return str(self._out_dir)

    # --- file selection -----------------------------------------------------
    def pick_demos(self) -> list[str]:
        """Open a native file dialog and return chosen .dem paths."""
        import webview

        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=True,
            file_types=("Demo files (*.dem)", "All files (*.*)"),
        )
        return list(result or [])

    def set_output_dir(self) -> str:
        import webview

        result = self._window.create_file_dialog(webview.FileDialog.FOLDER)
        if result:
            self._out_dir = Path(result[0])
        return str(self._out_dir)

    # --- the actual work ----------------------------------------------------
    def export_one(self, path: str) -> dict:
        """Export a single .dem to a cs2-demo-format v2 ZIP in the output dir.

        Returns {name, ok, output|error}. Called per-file from JS so the
        frontend can show per-file progress incrementally.
        """
        from ..cli import _export_one

        p = Path(path)
        name = p.name
        try:
            zip_path = _export_one(p, self._out_dir)
            return {"name": name, "ok": True, "output": str(zip_path)}
        except Exception as exc:  # noqa: BLE001 - surface any parse failure to the UI
            return {"name": name, "ok": False, "error": str(exc)}

    def open_output_dir(self) -> None:
        """Reveal the output folder in the OS file manager."""
        import subprocess

        self._out_dir.mkdir(parents=True, exist_ok=True)
        if sys.platform == "darwin":
            subprocess.run(["open", str(self._out_dir)], check=False)
        elif sys.platform.startswith("win"):
            subprocess.run(["explorer", str(self._out_dir)], check=False)
        else:
            subprocess.run(["xdg-open", str(self._out_dir)], check=False)

def main() -> None:
    """gui-script entry point (see pyproject [project.gui-scripts])."""
    import webview

    api = Api()
    window = webview.create_window(
        title=f"cs2dak {__version__}",
        url=str(WEB_DIR / "index.html"),
        js_api=api,
        width=560,
        height=640,
        min_size=(460, 520),
    )
    api._window = window
    webview.start()


if __name__ == "__main__":
    main()
