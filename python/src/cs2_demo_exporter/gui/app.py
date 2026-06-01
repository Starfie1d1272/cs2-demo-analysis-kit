"""pywebview window + JS<->Python bridge.

The `Api` class is exposed to the web frontend as `window.pywebview.api`. Each
method is callable from JS and returns plain JSON-serializable data. Keep heavy
work off the UI thread: pywebview runs JS API calls on a worker thread, so the
window stays responsive while a demo parses.
"""

from __future__ import annotations

import sys
from pathlib import Path

from .. import __version__
from ..builder import build_bundle
from ..package import write_zip
from ..parser import parse_demo

WEB_DIR = Path(__file__).parent / "web"


class Api:
    """Bridge exposed to the frontend as window.pywebview.api.*"""

    def __init__(self) -> None:
        self._window = None  # set in main() after window creation
        self._out_dir = Path.home() / "cs2-demo-exports"

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
            webview.OPEN_DIALOG,
            allow_multiple=True,
            file_types=("Demo files (*.dem)", "All files (*.*)"),
        )
        return list(result or [])

    def set_output_dir(self) -> str:
        import webview

        result = self._window.create_file_dialog(webview.FOLDER_DIALOG)
        if result:
            self._out_dir = Path(result[0])
        return str(self._out_dir)

    # --- the actual work ----------------------------------------------------
    def export(self, paths: list[str]) -> list[dict]:
        """parse -> build -> package each demo; return per-file results for the UI.

        Errors are captured per-demo (including the current NotImplementedError
        stubs) so one bad demo never crashes the window.
        """
        self._out_dir.mkdir(parents=True, exist_ok=True)
        results: list[dict] = []
        for p in paths:
            dem = Path(p)
            try:
                raw = parse_demo(dem)
                bundle = build_bundle(raw, exporter_version=__version__)
                zip_path = write_zip(bundle, self._out_dir / f"{dem.stem}.zip")
                results.append({"name": dem.name, "ok": True, "output": str(zip_path)})
            except Exception as exc:  # noqa: BLE001 - surface any failure to the UI
                results.append({"name": dem.name, "ok": False, "error": f"{type(exc).__name__}: {exc}"})
        return results

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
        title=f"cs2-demo-exporter {__version__}",
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
