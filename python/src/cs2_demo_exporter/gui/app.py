"""pywebview window + JS<->Python bridge.

The `Api` class is exposed to the web frontend as `window.pywebview.api`. Each
method is callable from JS and returns plain JSON-serializable data. Keep heavy
work off the UI thread: pywebview runs JS API calls on a worker thread, so the
window stays responsive while a demo parses.

The window has two faces sharing one `Api`:
  - the exporter page (gui/web/index.html): pick .dem -> export v2 ZIP
  - the viewer page (the built @cs2dak/demo-lab bundle): renders the just
    exported ZIP via @cs2dak/react. The ZIP bytes are the only thing crossing
    the Python<->JS seam (handed over base64 by `get_pending_zip`), so this
    honours the repo rule that the v2 ZIP is the sole coupling point.
"""

from __future__ import annotations

import base64
import os
import sys
from pathlib import Path

from .. import __version__

WEB_DIR = Path(__file__).parent / "web"


def _find_viewer_index() -> Path | None:
    """Locate the built demo-lab bundle's index.html.

    Honours CS2DAK_VIEWER_DIST, otherwise falls back to the in-repo build
    output at apps/demo-lab/dist (present after `pnpm --filter @cs2dak/demo-lab build`).
    Returns None when no build exists yet.
    """
    override = os.environ.get("CS2DAK_VIEWER_DIST")
    candidates = []
    if override:
        candidates.append(Path(override))
    # repo layout: python/src/cs2_demo_exporter/gui/app.py -> repo root is parents[4]
    candidates.append(Path(__file__).resolve().parents[4] / "apps" / "demo-lab" / "dist")
    for base in candidates:
        index = base / "index.html"
        if index.is_file():
            return index
    return None


class Api:
    """Bridge exposed to the frontend as window.pywebview.api.*"""

    def __init__(self) -> None:
        self._window = None  # main window, set in main() after creation
        self._viewer = None  # viewer window, lazily created
        self._out_dir = Path.home() / "cs2-demo-exports"
        self._last_zip: Path | None = None  # most recent successful export

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
        """Export each .dem to a cs2-demo-format v2 ZIP in the output dir.

        Reuses the CLI's `_export_one` so the GUI and CLI produce identically
        named ZIPs. Remembers the last successful export for the viewer.
        """
        from ..cli import _export_one

        results: list[dict] = []
        for p in paths:
            name = Path(p).name
            try:
                zip_path = _export_one(Path(p), self._out_dir)
                self._last_zip = zip_path
                results.append({"name": name, "ok": True, "output": str(zip_path)})
            except Exception as exc:  # noqa: BLE001 - surface any parse failure to the UI
                results.append({"name": name, "ok": False, "error": str(exc)})
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

    # --- viewer -------------------------------------------------------------
    def can_view(self) -> bool:
        """Whether a built demo-lab viewer bundle is available."""
        return _find_viewer_index() is not None

    def get_pending_zip(self) -> str | None:
        """Return the last exported ZIP as base64, or None.

        The viewer frontend calls this on load to render without re-picking a
        file. base64 keeps it JSON-serializable across the pywebview bridge.
        """
        if self._last_zip and self._last_zip.is_file():
            return base64.b64encode(self._last_zip.read_bytes()).decode("ascii")
        return None

    def open_viewer(self) -> dict:
        """Open (or focus) a second window rendering the last exported ZIP."""
        import webview

        index = _find_viewer_index()
        if index is None:
            return {"ok": False, "error": "viewer 未构建：先运行 pnpm --filter @cs2dak/demo-lab build"}
        if self._last_zip is None:
            return {"ok": False, "error": "还没有成功导出的 ZIP 可供查看"}

        if self._viewer is not None:
            try:
                self._viewer.load_url(index.as_uri())
                return {"ok": True}
            except Exception:  # noqa: BLE001 - window was closed; recreate below
                self._viewer = None

        self._viewer = webview.create_window(
            title="CS2 Demo Workspace",
            url=index.as_uri(),
            js_api=self,
            width=1280,
            height=860,
            min_size=(960, 640),
        )
        return {"ok": True}


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
