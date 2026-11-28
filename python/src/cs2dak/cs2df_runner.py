"""Native cs2df v5.x binary resolution and subprocess runner."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from collections import deque
from collections.abc import Callable
from pathlib import Path

_PROGRESS_RE = re.compile(r"^\s*\[\s*(\d+(?:\.\d+)?)%\]\s*(.+?)\s*$")
_VERSION_5_RE = re.compile(r"(?:^|\s)5\.\d+")
_VERIFIED_BINS: set[str] = set()
_VERIFY_LOCK = threading.Lock()


def _binary_name() -> str:
    return "cs2df.exe" if sys.platform.startswith("win") else "cs2df"


def _bundled_candidates() -> list[Path]:
    name = _binary_name()
    candidates: list[Path] = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        base = Path(meipass)
        candidates.append(base / "bin" / name)
        candidates.append(base / name)
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        candidates.append(exe_dir / "bin" / name)
        candidates.append(exe_dir / name)
    return candidates


def verify_cs2df_version(bin_path: str | Path) -> str:
    """Verify the resolved cs2df binary reports version 5.x."""
    resolved = str(bin_path)
    with _VERIFY_LOCK:
        if resolved in _VERIFIED_BINS:
            return resolved
    creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    try:
        proc = subprocess.run(
            [resolved, "--version"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            check=False,
            creationflags=creationflags,
        )
    except OSError as exc:
        raise RuntimeError(f"无法执行 cs2df --version（{resolved}）：{exc}") from exc
    output = (proc.stdout or proc.stderr or "").strip()
    if proc.returncode != 0 or not _VERSION_5_RE.search(output):
        raise RuntimeError(
            f"需要 cs2df 5.x 原生二进制，当前为：{output or f'exit {proc.returncode}'}（{resolved}）"
        )
    with _VERIFY_LOCK:
        _VERIFIED_BINS.add(resolved)
    return resolved


def resolve_cs2df_bin() -> str:
    """Resolve the native cs2df 5.x binary: CS2DF_BIN -> PyInstaller bundle -> PATH."""
    env_bin = os.environ.get("CS2DF_BIN", "").strip()
    if env_bin:
        candidate = Path(env_bin)
        if candidate.is_file():
            return verify_cs2df_version(candidate)
        found = shutil.which(env_bin)
        if found:
            return verify_cs2df_version(found)
        raise RuntimeError(f"CS2DF_BIN 指定的原生 cs2df 不可用：{env_bin}")

    for candidate in _bundled_candidates():
        if candidate.is_file():
            return verify_cs2df_version(candidate)

    found = shutil.which(_binary_name()) or shutil.which("cs2df")
    if found:
        return verify_cs2df_version(found)

    raise RuntimeError("未找到原生 cs2df 5.x 二进制（已检查 CS2DF_BIN、应用内置目录与 PATH）。")


def _read_match_meta(output_zip: Path) -> dict:
    with zipfile.ZipFile(output_zip) as archive:
        return json.loads(archive.read("match.json"))


def export_dem_to_zip(
    dem_path: str | Path,
    output_zip: str | Path,
    *,
    research: bool = False,
    compress_level: int = 3,
    progress: Callable[[str, float], None] | None = None,
    timeout_seconds: float | None = 600.0,
    cancel_event: threading.Event | None = None,
) -> dict:
    """Export one .dem file to output_zip using native cs2df 5.x and return match.json."""
    bin_path = resolve_cs2df_bin()
    src = Path(dem_path)
    dst = Path(output_zip)
    dst.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        bin_path,
        "export",
        str(src),
        "-o",
        str(dst),
        "--compress-level",
        str(compress_level),
    ]
    if research:
        cmd.append("--research")

    creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=creationflags,
    )

    tail: deque[str] = deque(maxlen=20)
    deadline = (time.monotonic() + timeout_seconds) if timeout_seconds is not None else None
    terminate_lock = threading.Lock()

    def _terminate() -> None:
        with terminate_lock:
            if proc.poll() is None:
                try:
                    proc.terminate()
                except OSError:
                    return
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    try:
                        proc.kill()
                    except OSError:
                        pass
                    try:
                        proc.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        pass

    watcher_stop = threading.Event()
    timed_out = False
    cancelled = False

    def _watchdog() -> None:
        nonlocal timed_out, cancelled
        while not watcher_stop.wait(0.05):
            if cancel_event is not None and cancel_event.is_set():
                cancelled = True
                _terminate()
                return
            if deadline is not None and time.monotonic() >= deadline:
                timed_out = True
                _terminate()
                return

    watchdog = threading.Thread(target=_watchdog, daemon=True)
    watchdog.start()
    succeeded = False
    try:
        if cancel_event is not None and cancel_event.is_set():
            cancelled = True
            _terminate()
        assert proc.stdout is not None
        for raw_line in proc.stdout:
            if cancel_event is not None and cancel_event.is_set():
                cancelled = True
                _terminate()
                break
            line = raw_line.strip()
            if not line:
                continue
            tail.append(line)
            if progress is not None:
                match = _PROGRESS_RE.match(line)
                if match:
                    pct = max(0.0, min(100.0, float(match.group(1))))
                    stage = match.group(2)
                    progress(stage, pct / 100.0)
        returncode = proc.wait()

        if cancelled:
            raise RuntimeError("cs2df 导出已取消")
        if timed_out:
            raise RuntimeError(f"cs2df 导出超时（>{timeout_seconds:.0f}s）")
        if returncode != 0:
            detail = "\n".join(tail) or f"exit {returncode}"
            raise RuntimeError(f"cs2df 导出失败（exit {returncode}）：{detail}")

        meta = _read_match_meta(dst)
        succeeded = True
        return meta
    finally:
        watcher_stop.set()
        if proc.poll() is None:
            _terminate()
        if proc.stdout is not None:
            try:
                proc.stdout.close()
            except OSError:
                pass
        if proc.stderr is not None:
            try:
                proc.stderr.close()
            except OSError:
                pass
        if proc.poll() is None:
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                pass
        watchdog.join(timeout=1)
        if not succeeded:
            dst.unlink(missing_ok=True)
