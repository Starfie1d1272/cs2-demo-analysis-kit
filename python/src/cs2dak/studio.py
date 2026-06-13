"""DAK Studio 桌面壳：pywebview 托管 Studio 前端构建产物 + .dem 导出桥。

打包链路（scripts/package.sh）：
  1. pnpm 构建 apps/dak-studio → dist/
  2. dist/ 拷贝到本包 studio_web/（gitignored，构建产物）
  3. PyInstaller（packaging/cs2dak-studio.spec）连同 exporter 打成单一应用

前端通过 window.pywebview.api 调用本桥：
  - pick_dems():        原生文件对话框选 .dem/.zip
  - export_dem_path():  按路径导出为 v3 ZIP，base64 回传（ZIP 仅 1–3MB）
  - export_dem_bytes(): 按字节导出（Windows 拖拽无路径时的回退）
  - get_drop_path():    拖拽后按文件名解析本机路径（macOS WKWebView）

数据流向与 dev 模式一致：.dem → cs2df → v3 ZIP → 前端 IndexedDB。
.dem 本身不进库，导出的临时 ZIP 用完即删。
"""

from __future__ import annotations

import base64
import logging
import os
import shutil
import socket
import sys
import tempfile
import threading
import time
import urllib.parse
import uuid
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
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


def _sanitize(s: str) -> str:
    for ch in r' <>:"/\|?*':
        s = s.replace(ch, "_")
    while "__" in s:
        s = s.replace("__", "_")
    return s.strip("_")


def _build_zip_name(dem: Path, match_meta: dict) -> str:
    """Build a descriptive filename from match_meta; fallback to dem stem."""
    try:
        date = datetime.fromtimestamp(os.path.getmtime(str(dem))).strftime("%Y-%m-%d")
        map_name = _sanitize(match_meta.get("mapName") or "unknown")
        team_a = _sanitize((match_meta.get("teamA") or {}).get("name") or "")
        team_b = _sanitize((match_meta.get("teamB") or {}).get("name") or "")
        score_a = (match_meta.get("teamA") or {}).get("score", 0)
        score_b = (match_meta.get("teamB") or {}).get("score", 0)
        if team_a and team_b:
            stem = f"{date}_{map_name}_{team_a}-vs-{team_b}_{score_a}-{score_b}"
        else:
            stem = f"{date}_{map_name}_{score_a}-{score_b}_{dem.stem}"
        return f"{stem}.zip"
    except Exception:
        return f"{dem.stem}.zip"


def _appdata_userdata() -> Path:
    """系统级用户数据目录（0.1.4 引入的旧位置，现仅作迁移源与回退）。"""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "DAK Studio"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / "DAK Studio"
    else:
        base = Path.home() / ".dak-studio"
    return base / "userdata"


def _studio_userdata() -> Path:
    """Persistent directory for cookies / IndexedDB / localStorage.

    Windows 打包版 → exe 同目录 userdata/（便携式：数据跟应用走，直观可见、
                     换电脑拷目录即迁移）。目录不可写（如装进 Program Files）
                     时回退 %APPDATA%/DAK Studio/userdata。
    macOS   → ~/Library/Application Support/DAK Studio/userdata
              （.app 内部不可写且受 translocation 影响，不做便携式）
    其他/开发模式 → 沿用系统目录。

    首次切换到便携目录时，自动把旧 %APPDATA% 数据整体拷贝过来，
    避免 0.1.4/0.1.5 用户升级后资料库"清空"。
    """
    if sys.platform == "win32" and getattr(sys, "frozen", False):
        portable = Path(sys.executable).parent / "userdata"
        try:
            legacy = _appdata_userdata()
            if not portable.exists() and legacy.exists():
                shutil.copytree(legacy, portable)
            portable.mkdir(parents=True, exist_ok=True)
            # 写权限探测：Program Files 下创建成功但写入会失败
            probe = portable / ".write-probe"
            probe.write_text("ok")
            probe.unlink()
            return portable
        except OSError:
            pass  # 不可写：回退系统目录
    path = _appdata_userdata()
    path.mkdir(parents=True, exist_ok=True)
    return path


log = logging.getLogger("cs2dak.studio")


class _StudioStaticHandler(SimpleHTTPRequestHandler):
    """Static file handler with real cache headers for large immutable assets."""

    def __init__(self, *args, directory: str | None = None, **kwargs) -> None:
        super().__init__(*args, directory=directory, **kwargs)

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - stdlib signature
        log.debug("static: " + format, *args)

    def end_headers(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if path == "/" or path.endswith("/index.html"):
            self.send_header("Cache-Control", "no-cache")
        elif path.startswith("/tris/") or path.startswith("/maps/radars/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        elif path.startswith("/assets/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "public, max-age=3600")
        super().end_headers()


def _find_static_port(start: int = 51780) -> int:
    """Prefer a stable localhost port so WebView storage origin stays predictable."""
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _start_static_server(root: Path) -> tuple[ThreadingHTTPServer, str]:
    from functools import partial

    port = _find_static_port()
    handler = partial(_StudioStaticHandler, directory=str(root))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, name="dak-studio-static", daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{port}/index.html"
    log.info("static server: %s -> %s", url, root)
    return server, url


def _setup_logging(userdata: Path) -> None:
    """File log in the userdata dir + stderr. The log is the user-facing
    answer to "解析到底开始了没有" when the UI looks stuck."""
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    try:
        handlers.append(logging.FileHandler(userdata / "studio.log", encoding="utf-8"))
    except OSError:
        pass
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=handlers,
    )


class _ExportJob:
    """One background .dem→ZIP export. Status is polled over the JS bridge
    with tiny payloads; the resulting ZIP is fetched in bounded base64 chunks
    so no single bridge message can grow with file size."""

    def __init__(self, path: str) -> None:
        self.id = uuid.uuid4().hex
        self.path = path
        self.started = time.monotonic()
        self.state = "running"  # running | done | error
        self.stage = "排队中"
        self.progress = 0.0
        self.error: str | None = None
        self.file_name: str | None = None
        self.result_b64: str | None = None

    def status(self) -> dict:
        return {
            "id": self.id,
            "state": self.state,
            "stage": self.stage,
            "progress": round(self.progress, 3),
            "elapsedSeconds": round(time.monotonic() - self.started, 1),
            "error": self.error,
            "fileName": self.file_name,
            "resultSize": len(self.result_b64) if self.result_b64 else 0,
        }


class StudioApi:
    """Bridge exposed to the Studio frontend as window.pywebview.api.*"""

    def __init__(self) -> None:
        self._window = None  # set in main() after window creation
        self._jobs: dict[str, _ExportJob] = {}

    # --- info -----------------------------------------------------------
    def get_version(self) -> str:
        return __version__

    def path_exists(self, path: str) -> bool:
        return Path(path).exists()

    # --- .dem import ----------------------------------------------------
    def pick_dems(self) -> list[str]:
        """Open a native file dialog and return chosen .dem / .zip paths."""
        import webview

        try:
            # 过滤器标签只能含字母数字与空格（pywebview Windows 端用
            # ``([\w ]+)`` 正则校验，'/' 等符号会直接抛
            # "... is not a valid file filter"）。
            result = self._window.create_file_dialog(
                webview.FileDialog.OPEN,
                allow_multiple=True,
                file_types=("CS2 Demo (*.dem;*.zip)", "All files (*.*)"),
            )
        except Exception:
            # 兜底：过滤器在某后端不被接受时退化为无过滤对话框，
            # 保证导入入口永远可用。
            result = self._window.create_file_dialog(
                webview.FileDialog.OPEN, allow_multiple=True
            )
        paths = list(result or [])
        log.info("pick_dems: %d 个文件 %s", len(paths), paths)
        return paths

    # --- async export jobs（0.3.0：避免长阻塞 bridge 调用与超大单条回传） ---
    def start_export_job(self, path: str) -> dict:
        """Start a background .dem→ZIP export; returns {jobId} immediately.

        Poll get_export_status(jobId); when state == "done" pull the ZIP with
        get_export_result_chunk. .zip files pass through without the exporter.
        """
        job = _ExportJob(path)
        self._jobs[job.id] = job
        log.info("export job %s start: %s", job.id, path)
        threading.Thread(target=self._run_export_job, args=(job,), daemon=True).start()
        return {"jobId": job.id}

    def _run_export_job(self, job: _ExportJob) -> None:
        from cs2df.package import export_demo

        dem = Path(job.path)
        try:
            if dem.suffix.lower() == ".zip":
                job.stage = "读取 ZIP"
                data = dem.read_bytes()
                job.file_name = dem.name
            else:
                def on_progress(stage: str, frac: float) -> None:
                    job.stage = stage
                    job.progress = frac
                    log.info("export job %s %s %.0f%%", job.id, stage, frac * 100)

                data, match_meta = export_demo(str(dem), progress=on_progress)
                job.file_name = _build_zip_name(dem, match_meta)
            job.result_b64 = base64.b64encode(data).decode("ascii")
            job.progress = 1.0
            job.state = "done"
            job.stage = "完成"
            log.info("export job %s done: %s (%.1fs, %d bytes)", job.id,
                     job.file_name, time.monotonic() - job.started, len(data))
        except Exception as exc:  # noqa: BLE001 - surface parse failures to the UI
            job.state = "error"
            job.error = str(exc)
            log.exception("export job %s failed: %s", job.id, job.path)

    def get_export_status(self, job_id: str) -> dict:
        job = self._jobs.get(job_id)
        if job is None:
            return {"id": job_id, "state": "error", "error": "未知任务",
                    "stage": "", "progress": 0, "elapsedSeconds": 0,
                    "fileName": None, "resultSize": 0}
        return job.status()

    def get_export_result_chunk(self, job_id: str, offset: int, size: int) -> dict:
        """Return base64 substring [offset, offset+size); chunked so each
        bridge message stays small. The job is dropped after the last chunk."""
        job = self._jobs.get(job_id)
        if job is None or job.result_b64 is None:
            return {"ok": False, "error": "任务结果不存在"}
        chunk = job.result_b64[offset: offset + size]
        done = offset + size >= len(job.result_b64)
        if done:
            self._jobs.pop(job_id, None)
        return {"ok": True, "data": chunk, "done": done}

    def export_dem_path(self, path: str) -> dict:
        """Export one .dem to a v3 ZIP and return its bytes base64-encoded.

        Returns {ok, fileName, dataBase64} or {ok: False, error}.
        ZIP stays small (columnar replay), so the base64 bridge transfer is cheap;
        the temp dir is removed afterwards either way.
        """
        from cs2df.package import export_demo

        dem = Path(path)
        # 原生对话框也允许直接选 v3 ZIP：不经 exporter，原样回传字节。
        if dem.suffix.lower() == ".zip":
            try:
                return {
                    "ok": True,
                    "fileName": dem.name,
                    "dataBase64": base64.b64encode(dem.read_bytes()).decode("ascii"),
                }
            except OSError as exc:
                return {"ok": False, "error": str(exc)}
        try:
            data, match_meta = export_demo(str(dem))
            return {
                "ok": True,
                "fileName": _build_zip_name(dem, match_meta),
                "dataBase64": base64.b64encode(data).decode("ascii"),
            }
        except Exception as exc:  # noqa: BLE001 - surface parse failures to the UI
            return {"ok": False, "error": str(exc)}

    def export_dem_bytes(self, name: str, data_b64: str) -> dict:
        """Export .dem raw bytes (base64) to a v3 ZIP.

        Used by the frontend when drag-and-drop cannot provide a filesystem path
        (e.g. Windows pywebview). Writes the bytes to a temp file, runs the
        exporter, and returns the ZIP the same way export_dem_path does.
        """
        from cs2df.package import export_demo

        tmp_dir = Path(tempfile.mkdtemp(prefix="cs2dak-studio-"))
        try:
            dem_path = tmp_dir / name
            dem_path.write_bytes(base64.b64decode(data_b64))
            data, match_meta = export_demo(str(dem_path))
            return {
                "ok": True,
                "fileName": _build_zip_name(dem_path, match_meta),
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

    storage = _studio_userdata()
    _setup_logging(storage)
    log.info("DAK Studio %s 启动，userdata=%s", __version__, storage)

    index = WEB_DIR / "index.html"
    if not index.exists():
        raise SystemExit(
            "studio_web/ 构建产物缺失。先运行 scripts/package.sh，"
            "或手动：pnpm --filter @cs2dak/dak-studio build 后把 dist/ 拷到 "
            f"{WEB_DIR}"
        )

    _server, index_url = _start_static_server(WEB_DIR)
    api = StudioApi()
    window = webview.create_window(
        title=f"DAK Studio {__version__}",
        url=index_url,
        js_api=api,
        width=1440,
        height=920,
        min_size=(1024, 700),
    )
    api._window = window
    # 自建 localhost 静态服务：pywebview 内置 server 会给静态文件写
    # no-cache/no-store，导致 .tri 与雷达图在切图时反复重拉。
    # private_mode=False：Windows Edge Chromium 默认隐私模式会把
    # IndexedDB 等数据存到临时目录，重启丢失；显式关掉后落盘到持久目录。
    webview.start(private_mode=False, storage_path=str(storage))


if __name__ == "__main__":
    main()
