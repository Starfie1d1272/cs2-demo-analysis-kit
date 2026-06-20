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
import json
import logging
import os
import shutil
import socket
import sqlite3
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import uuid
import zipfile
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from cs2dak import __version__, updater

# PyInstaller 打包后 __file__ 指向 Contents/Frameworks/（不含数据文件），
# 实际资源在 sys._MEIPASS 临时目录。未打包时回退到源码目录。
if getattr(sys, "frozen", False):
    WEB_DIR = Path(sys._MEIPASS) / "studio_web"
else:
    WEB_DIR = Path(__file__).parent / "studio_web"

# .tri 碰撞几何资产外置（0.6.4 起）：打包不再内嵌 ~200MB，安装包从 ~220MB 瘦到 ~20MB。
# 运行时首次用到某图时按需从镜像下载到 userdata/tris overlay（见 _StudioStaticHandler）。
# 资产与清单托管在自建 R2（与更新包同一镜像层）；缺失只降级（LOS 口径退化），不报错。
TRIS_MANIFEST_URL = "https://dakupdate.starfie1d.top/tris/manifest.json"
TRIS_MANIFEST_TIMEOUT_S = 8

# 更新检查引用的镜像源（优先级：R2 → GitHub 直连 → ghproxy×3，与前端 update.ts 一致）。
_MANIFEST_URLS = [
    "https://dakupdate.starfie1d.top/releases/latest.json",
    "https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/latest/download/latest.json",
    "https://ghfast.top/https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/latest/download/latest.json",
    "https://gh-proxy.com/https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/latest/download/latest.json",
    "https://ghproxy.net/https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/latest/download/latest.json",
]
_MANIFEST_TIMEOUT_S = 8


def _version_tuple(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in v.split(".")[:3])


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
    """Static file handler with real cache headers for large immutable assets.

    `/tris/<map>.tri` 支持 overlay + 按需下载：
      1. userdata/tris 下存在同名文件 → 优先提供（外置资产，手动放置或已下载）；
      2. 打包内置（去内置化后通常不存在）→ 回退提供；
      3. 都没有 → 命中 GET 时按 tris-manifest 从镜像下载到 overlay，再提供。
    下载失败只降级（跳过静态墙体 LOS），不报错。同图多场并行导入按文件名加锁去重。
    """

    overlay_tris: Path | None = None
    _tri_locks: dict[str, threading.Lock] = {}
    _tri_locks_guard = threading.Lock()
    _tris_manifest: dict | None = None

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - stdlib signature
        log.debug("static: " + format, *args)

    def do_GET(self) -> None:  # noqa: N802 - stdlib signature
        urlpath = urllib.parse.urlparse(self.path).path
        if urlpath.startswith("/tris/") and urlpath.endswith(".tri"):
            self._ensure_tri(os.path.basename(urlpath))
        super().do_GET()

    @classmethod
    def _tri_lock(cls, filename: str) -> threading.Lock:
        with cls._tri_locks_guard:
            lock = cls._tri_locks.get(filename)
            if lock is None:
                lock = threading.Lock()
                cls._tri_locks[filename] = lock
            return lock

    @classmethod
    def _tris_manifest_load(cls) -> dict | None:
        """拉一次 tris-manifest 并缓存（仅成功缓存；失败下次仍可重试）。"""
        if cls._tris_manifest is not None:
            return cls._tris_manifest
        try:
            req = urllib.request.Request(TRIS_MANIFEST_URL, headers={"User-Agent": "DAK-Studio-Tri"})
            with urllib.request.urlopen(req, timeout=TRIS_MANIFEST_TIMEOUT_S) as resp:  # noqa: S310 - https
                cls._tris_manifest = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 - 缺失只降级
            log.warning("拉取 tris-manifest 失败：%s", exc)
            return None
        return cls._tris_manifest

    def _ensure_tri(self, filename: str) -> None:
        """overlay/内置都缺时，按 manifest 把该图 .tri 下到 overlay。失败静默降级。"""
        overlay = self.overlay_tris
        if overlay is None:
            return
        dest = overlay / filename
        if dest.is_file() or (WEB_DIR / "tris" / filename).is_file():
            return
        manifest = self._tris_manifest_load()
        if not manifest:
            return
        stem = filename[:-4]  # 去掉 .tri
        entry = (manifest.get("maps") or {}).get(stem)
        if not isinstance(entry, dict) or not entry.get("urls"):
            return
        with self._tri_lock(filename):
            if dest.is_file():  # 并发下另一线程已下完
                return
            try:
                updater.download_with_fallback(
                    list(entry["urls"]),
                    dest,
                    expected_sha256=entry.get("sha256"),
                    expected_size=entry.get("size"),
                )
                log.info("按需下载 .tri 完成：%s", filename)
            except Exception as exc:  # noqa: BLE001 - 缺失只降级
                log.warning("按需下载 .tri 失败 %s：%s", filename, exc)

    def translate_path(self, path: str) -> str:
        default = super().translate_path(path)
        overlay = self.overlay_tris
        if overlay is not None:
            urlpath = urllib.parse.urlparse(path).path
            if urlpath.startswith("/tris/"):
                name = os.path.basename(urlpath)
                candidate = overlay / name
                if candidate.is_file():
                    return str(candidate)
        return default

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


def _start_static_server(root: Path, overlay_tris: Path | None = None) -> tuple[ThreadingHTTPServer, str]:
    from functools import partial

    port = _find_static_port()
    if overlay_tris is not None:
        # 类属性形式注入 overlay 目录（partial 只能传 handler __init__ 参数）。
        _StudioStaticHandler.overlay_tris = overlay_tris
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


class _UpdateJob:
    """One background download for an in-app update. Polled over the bridge."""

    def __init__(self, urls: list[str], sha256: str, size: int, name: str) -> None:
        self.id = uuid.uuid4().hex
        self.urls = urls
        self.sha256 = sha256
        self.size = size
        self.name = name
        self.state = "downloading"  # downloading | verifying | ready | applying | error
        self.stage = "准备中"
        self.received = 0
        self.error: str | None = None
        self.staged_path: Path | None = None

    def status(self) -> dict:
        progress = (self.received / self.size) if self.size else 0.0
        return {
            "jobId": self.id,
            "state": self.state,
            "stage": self.stage,
            "progress": round(min(progress, 1.0), 3),
            "error": self.error,
            "receivedBytes": self.received,
        }


class StudioApi:
    """Bridge exposed to the Studio frontend as window.pywebview.api.*"""

    def __init__(self) -> None:
        self._window = None  # set in main() after window creation
        self._jobs: dict[str, _ExportJob] = {}
        self._update_jobs: dict[str, _UpdateJob] = {}
        self._userdata = _studio_userdata()
        self._db_lock = threading.Lock()
        self._db: sqlite3.Connection | None = None

    # --- native storage -------------------------------------------------
    # 待桌面验证：CI/沙箱没有真实 pywebview 桌面壳。TS 侧已保留 IndexedDB fallback。
    def _conn(self) -> sqlite3.Connection:
        if self._db is None:
            self._userdata.mkdir(parents=True, exist_ok=True)
            db = sqlite3.connect(self._userdata / "studio.sqlite", check_same_thread=False)
            db.execute(
                "create table if not exists records ("
                "namespace text not null, key text not null, value text not null, "
                "primary key (namespace, key))"
            )
            self._db = db
        return self._db

    def storage_record_get(self, namespace: str, key: str):
        with self._db_lock:
            row = self._conn().execute(
                "select value from records where namespace=? and key=?",
                (namespace, key),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def storage_record_get_all(self, namespace: str) -> list:
        with self._db_lock:
            rows = self._conn().execute(
                "select value from records where namespace=?",
                (namespace,),
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def storage_record_entries(self, namespace: str) -> list:
        with self._db_lock:
            rows = self._conn().execute(
                "select key, value from records where namespace=?",
                (namespace,),
            ).fetchall()
        return [[key, json.loads(value)] for key, value in rows]

    def storage_record_keys(self, namespace: str) -> list[str]:
        with self._db_lock:
            rows = self._conn().execute(
                "select key from records where namespace=?",
                (namespace,),
            ).fetchall()
        return [row[0] for row in rows]

    def storage_record_put(self, namespace: str, key: str, value) -> None:
        data = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        with self._db_lock:
            self._conn().execute(
                "insert into records(namespace, key, value) values(?, ?, ?) "
                "on conflict(namespace, key) do update set value=excluded.value",
                (namespace, key, data),
            )
            self._conn().commit()

    def storage_record_delete(self, namespace: str, key: str) -> None:
        with self._db_lock:
            self._conn().execute("delete from records where namespace=? and key=?", (namespace, key))
            self._conn().commit()

    def storage_record_delete_prefix(self, namespace: str, prefix: str) -> None:
        with self._db_lock:
            self._conn().execute(
                "delete from records where namespace=? and (key=? or key like ? || '%')",
                (namespace, prefix, prefix),
            )
            self._conn().commit()

    def _blob_dir(self, namespace: str) -> Path:
        if namespace == "demos":
            path = self._userdata / "demos"
        else:
            path = self._userdata / "cache" / "blobs" / _sanitize(namespace)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _blob_path(self, namespace: str, key: str) -> Path:
        name = urllib.parse.quote(key, safe="")
        suffix = ".zip" if namespace == "demos" else ".bin"
        return self._blob_dir(namespace) / f"{name}{suffix}"

    def storage_blob_get(self, namespace: str, key: str) -> str | None:
        path = self._blob_path(namespace, key)
        if not path.exists():
            return None
        return base64.b64encode(path.read_bytes()).decode("ascii")

    def storage_blob_put(self, namespace: str, key: str, dataBase64: str) -> None:  # noqa: N803 - JS bridge name
        self._blob_path(namespace, key).write_bytes(base64.b64decode(dataBase64))

    def storage_blob_delete(self, namespace: str, key: str) -> None:
        try:
            self._blob_path(namespace, key).unlink()
        except FileNotFoundError:
            pass

    def storage_blob_delete_prefix(self, namespace: str, prefix: str) -> None:
        for key in self.storage_blob_keys(namespace):
            if key == prefix or key.startswith(prefix + "\t"):
                self.storage_blob_delete(namespace, key)

    def storage_blob_keys(self, namespace: str) -> list[str]:
        suffix = ".zip" if namespace == "demos" else ".bin"
        return [
            urllib.parse.unquote(path.name[: -len(suffix)])
            for path in self._blob_dir(namespace).glob(f"*{suffix}")
        ]

    # --- Library maintenance -------------------------------------------
    @staticmethod
    def _path_size(path: Path) -> tuple[int, int]:
        if not path.exists():
            return 0, 0
        if path.is_file():
            return path.stat().st_size, 1
        size = 0
        files = 0
        for child in path.rglob("*"):
            if not child.is_file():
                continue
            try:
                size += child.stat().st_size
                files += 1
            except OSError:
                continue
        return size, files

    def storage_overview(self) -> dict:
        """Return user-visible disk usage categories without loading file contents."""
        categories = []
        paths = {
            "database": self._userdata / "studio.sqlite",
            "demos": self._userdata / "demos",
            "cache": self._userdata / "cache",
            "tris": self._userdata / "tris",
            "updates": self._userdata / "updates",
            "reports": self._userdata / "reports",
            "logs": self._userdata / "studio.log",
            "backups": self._userdata / "backups",
        }
        for category, path in paths.items():
            size, files = self._path_size(path)
            categories.append({"id": category, "bytes": size, "files": files, "path": str(path)})
        return {"ok": True, "userdata": str(self._userdata), "categories": categories}

    def storage_backup(self) -> dict:
        """Create a portable backup containing durable records and original ZIPs."""
        backups = self._userdata / "backups"
        backups.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        destination = backups / f"dak-studio-backup-{stamp}.zip"
        with tempfile.TemporaryDirectory(prefix="dak-backup-") as temp_name:
            temp = Path(temp_name)
            snapshot = temp / "studio.sqlite"
            with self._db_lock:
                source = self._conn()
                target = sqlite3.connect(snapshot)
                try:
                    source.backup(target)
                finally:
                    target.close()
            demo_dir = self._userdata / "demos"
            demo_files = sorted(path for path in demo_dir.glob("*.zip") if path.is_file())
            manifest = {
                "version": "cs2-demo-analysis-kit/library-backup-1.0",
                "appVersion": __version__,
                "createdAt": datetime.now().astimezone().isoformat(),
                "demoCount": len(demo_files),
                "includes": ["studio.sqlite", "demos"],
            }
            with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=3) as archive:
                archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
                archive.write(snapshot, "studio.sqlite")
                for demo in demo_files:
                    archive.write(demo, f"demos/{demo.name}")
        return {"ok": True, "path": str(destination), "demoCount": len(demo_files)}

    def _pick_backup(self) -> str | None:
        import webview

        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=("DAK Studio Backup (*.zip)", "All files (*.*)"),
        )
        return str(result[0]) if result else None

    def storage_restore(self, path: str | None = None) -> dict:
        """Validate and restore a library backup. The app must restart afterwards."""
        source = Path(path) if path else Path(self._pick_backup() or "")
        if not source.is_file():
            return {"ok": False, "error": "未选择有效备份文件"}
        with tempfile.TemporaryDirectory(prefix="dak-restore-") as temp_name:
            temp = Path(temp_name)
            try:
                with zipfile.ZipFile(source) as archive:
                    names = set(archive.namelist())
                    if "manifest.json" not in names or "studio.sqlite" not in names:
                        return {"ok": False, "error": "备份缺少 manifest.json 或 studio.sqlite"}
                    manifest = json.loads(archive.read("manifest.json"))
                    if manifest.get("version") != "cs2-demo-analysis-kit/library-backup-1.0":
                        return {"ok": False, "error": "不支持的备份版本"}
                    archive.extractall(temp)
            except (OSError, ValueError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
                return {"ok": False, "error": f"备份校验失败：{exc}"}
            restored_db = temp / "studio.sqlite"
            check = sqlite3.connect(restored_db)
            try:
                integrity = check.execute("pragma integrity_check").fetchone()[0]
            finally:
                check.close()
            if integrity != "ok":
                return {"ok": False, "error": f"备份数据库损坏：{integrity}"}
            with self._db_lock:
                if self._db is not None:
                    self._db.close()
                    self._db = None
                self._userdata.mkdir(parents=True, exist_ok=True)
                shutil.copy2(restored_db, self._userdata / "studio.sqlite")
                destination_demos = self._userdata / "demos"
                shutil.rmtree(destination_demos, ignore_errors=True)
                source_demos = temp / "demos"
                if source_demos.exists():
                    shutil.copytree(source_demos, destination_demos)
                else:
                    destination_demos.mkdir(parents=True, exist_ok=True)
        return {"ok": True, "path": str(source), "restartRequired": True}

    def storage_cleanup(self, category: str) -> dict:
        """Delete only explicitly rebuildable storage categories."""
        targets = {
            "cache": self._userdata / "cache",
            "tris": self._userdata / "tris",
            "updates": self._userdata / "updates",
            "reports": self._userdata / "reports",
            "logs": self._userdata / "studio.log",
        }
        target = targets.get(category)
        if target is None:
            return {"ok": False, "error": "该分类不可自动清理"}
        before, files = self._path_size(target)
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        else:
            try:
                target.unlink()
            except FileNotFoundError:
                pass
        return {"ok": True, "category": category, "freedBytes": before, "files": files}

    def storage_repair(self) -> dict:
        """Repair durable Library consistency and compact SQLite."""
        with self._db_lock:
            conn = self._conn()
            integrity = conn.execute("pragma integrity_check").fetchone()[0]
            if integrity != "ok":
                return {"ok": False, "error": f"SQLite integrity_check: {integrity}"}
            record_rows = conn.execute(
                "select key from records where namespace='demos'"
            ).fetchall()
            record_keys = {row[0] for row in record_rows}
            blob_keys = set(self.storage_blob_keys("demos"))
            missing_blobs = sorted(record_keys - blob_keys)
            orphan_blobs = sorted(blob_keys - record_keys)
            for key in missing_blobs:
                conn.execute("delete from records where namespace='demos' and key=?", (key,))
            conn.commit()
            conn.execute("vacuum")
        for key in orphan_blobs:
            self.storage_blob_delete("demos", key)
        return {
            "ok": True,
            "integrity": integrity,
            "removedMissingBlobRecords": len(missing_blobs),
            "removedOrphanBlobs": len(orphan_blobs),
        }

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

                data, match_meta = export_demo(str(dem), research=True, progress=on_progress)
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
            data, match_meta = export_demo(str(dem), research=True)
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
            data, match_meta = export_demo(str(dem_path), research=True)
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

    # --- in-app update（Windows 一键更新；macOS/dev 不暴露 apply 的真实替换）-----
    def update_start(self, urls: list[str], sha256: str, size: int, name: str) -> dict:
        """Start a background download for an update asset; returns {jobId}.

        Poll update_status(jobId); when state == "ready" call update_apply.
        """
        job = _UpdateJob(list(urls), sha256, int(size), name)
        self._update_jobs[job.id] = job
        log.info("update job %s start: %s (%d bytes, %d mirrors)", job.id, name, size, len(urls))
        threading.Thread(target=self._run_update_job, args=(job,), daemon=True).start()
        return {"jobId": job.id}

    def _run_update_job(self, job: _UpdateJob) -> None:
        dest = updater.updates_dir(self._userdata) / job.name

        def on_progress(received: int) -> None:
            job.received = received
            if job.size and received >= job.size:
                job.state = "verifying"
                job.stage = "校验中"

        def on_mirror(index: int, _url: str) -> None:
            job.received = 0
            job.state = "downloading"
            job.stage = f"下载中（镜像 {index + 1}）"

        try:
            updater.download_with_fallback(
                job.urls, dest, expected_sha256=job.sha256,
                expected_size=job.size or None,
                on_progress=on_progress, on_mirror=on_mirror,
            )
            job.staged_path = dest
            job.state = "ready"
            job.stage = "已就绪"
            log.info("update job %s ready: %s", job.id, dest)
        except Exception as exc:  # noqa: BLE001 - surface to UI
            job.state = "error"
            job.error = str(exc)
            log.exception("update job %s failed", job.id)

    def update_status(self, job_id: str) -> dict:
        job = self._update_jobs.get(job_id)
        if job is None:
            return {"jobId": job_id, "state": "error", "stage": "",
                    "progress": 0, "error": "未知任务", "receivedBytes": 0}
        return job.status()

    def update_apply(self, job_id: str) -> dict:
        """Extract + launch the relaunch script, then quit so it can swap dirs.

        Windows only. On success the app restarts and this call may not return.
        """
        job = self._update_jobs.get(job_id)
        if job is None or job.staged_path is None or job.state != "ready":
            return {"ok": False, "error": "更新包尚未就绪"}
        if sys.platform != "win32":
            return {"ok": False, "error": "应用内替换目前只支持 Windows"}
        try:
            job.state = "applying"
            updater.apply_windows_update(
                job.staged_path,
                updater.current_install_dir(),
                updater.current_exe_name(),
                updater.current_pid(),
                work_dir=updater.updates_dir(self._userdata),
            )
        except Exception as exc:  # noqa: BLE001
            job.state = "error"
            job.error = str(exc)
            log.exception("update apply %s failed", job_id)
            return {"ok": False, "error": str(exc)}

        # 让 bridge 先返回，再销毁窗口退出进程，交给接力脚本接管。
        def _quit() -> None:
            time.sleep(0.6)
            try:
                if self._window is not None:
                    self._window.destroy()
            except Exception:  # noqa: BLE001
                os._exit(0)

        threading.Thread(target=_quit, daemon=True).start()
        return {"ok": True}

    # --- update check bridge（服务端拉 manifest，消除 webview CORS 问题）---
    def check_update(self) -> dict | None:
        """通过服务端 HTTP（无 CORS）拉取更新 manifest。

        前端直接消费返回的 { version, notes, publishedAt, assets }。
        仅当远端版本 > 当前版本时返回；无更新 / 网络不可达返回 None。
        notes 由发版 CI 的 --notes-file 注入 manifest（见 release.yml），
        旧 release 不返回 notes 时前端退而显示「查看 GitHub Release」。
        """
        from cs2dak import __version__ as local_ver

        local_ver_t = _version_tuple(local_ver)
        for url in _MANIFEST_URLS:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "DAK-Studio-Updater"})
                with urllib.request.urlopen(req, timeout=_MANIFEST_TIMEOUT_S) as resp:  # noqa: S310 - https
                    data = json.loads(resp.read().decode("utf-8"))
                if not isinstance(data, dict):
                    continue
                ver = (data.get("version") or "").lstrip("v")
                if not ver or _version_tuple(ver) <= local_ver_t:
                    continue
                return data
            except Exception:  # noqa: BLE001 - 网络失败静默降级
                continue
        return None

    # --- .tri 资产管理（外置 overlay + 按需下载）-----------------------------
    def _tri_overlay_dir(self) -> Path:
        path = self._userdata / "tris"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def tri_dir(self) -> str:
        """userdata 下的 .tri overlay 目录（供 UI 显示/打开/手动放置资产）。"""
        return str(self._tri_overlay_dir())

    def tri_present(self) -> list[str]:
        """当前可用的地图 .tri（overlay + 内置去重），返回地图名（不含扩展名）。"""
        names: set[str] = set()
        for base in (self._tri_overlay_dir(), WEB_DIR / "tris"):
            if base.is_dir():
                names.update(p.stem for p in base.glob("*.tri"))
        return sorted(names)

    def tri_download(self, map_name: str, urls: list[str], sha256: str | None = None) -> dict:
        """按需下载某图 .tri 到 overlay（镜像失败转移 + 可选 sha256 校验）。

        资产托管 URL 由调用方/manifest 提供（本仓库不内置 .tri 源地址）。
        """
        dest = self._tri_overlay_dir() / f"{map_name}.tri"
        try:
            updater.download_with_fallback(list(urls), dest, expected_sha256=sha256)
            return {"ok": True, "path": str(dest)}
        except Exception as exc:  # noqa: BLE001 - surface to UI
            log.warning("tri_download %s failed: %s", map_name, exc)
            return {"ok": False, "error": str(exc)}

    # --- Library 目录（用户可见数据目录：显示路径 / 在文件管理器打开）-------------
    def userdata_dir(self) -> str:
        """用户数据目录绝对路径（资料库 SQLite + demo blobs + 缓存 + 日志 + .tri overlay）。"""
        return str(self._userdata)

    def open_userdata_dir(self) -> dict:
        """在系统文件管理器中打开用户数据目录，便于备份/排错。

        返回 {ok, path} 或 {ok: False, error}。浏览器/无桥环境不暴露此方法。
        """
        import subprocess

        self._userdata.mkdir(parents=True, exist_ok=True)
        target = str(self._userdata)
        try:
            if sys.platform == "win32":
                os.startfile(target)  # type: ignore[attr-defined]  # noqa: S606 - 打开本地目录
            elif sys.platform == "darwin":
                subprocess.Popen(["open", target])  # noqa: S603,S607
            else:
                subprocess.Popen(["xdg-open", target])  # noqa: S603,S607
            return {"ok": True, "path": target}
        except Exception as exc:  # noqa: BLE001 - surface to UI
            log.warning("open_userdata_dir failed: %s", exc)
            return {"ok": False, "error": str(exc)}


def main() -> None:
    """gui-script entry point (see pyproject [project.gui-scripts])."""
    import webview

    # 强制在任意拖拽操作中捕获文件路径，即使前端使用标准浏览器
    # drop 事件（而非 pywebview DOM 事件系统）。默认为 0，只有
    # pywebview element.events.drop 注册监听器后才会计数；而我们
    # 使用 React onDrop，永远不会触发该计数。
    from webview.dom import _dnd_state
    _dnd_state["num_listeners"] = max(_dnd_state["num_listeners"], 1)

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

    # .tri overlay：userdata/tris 优先于内置（外置资产管理）。
    overlay_tris = storage / "tris"
    overlay_tris.mkdir(parents=True, exist_ok=True)
    _server, index_url = _start_static_server(WEB_DIR, overlay_tris=overlay_tris)
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
