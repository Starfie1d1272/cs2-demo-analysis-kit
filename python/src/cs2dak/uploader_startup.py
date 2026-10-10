"""Windows uploader preflight and diagnostics; no CLR/WebView imports here."""
from __future__ import annotations

import ctypes
import hashlib
import logging
import os
import platform
import sys
import tempfile
import traceback
from importlib.metadata import PackageNotFoundError, version
from logging.handlers import RotatingFileHandler
from pathlib import Path

NETFX_KEY = r"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full"
WEBVIEW_KEY = r"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
NETFX_URL = "https://dotnet.microsoft.com/en-us/download/dotnet-framework/net48"
WEBVIEW_URL = "https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section"


def windows_runtimes() -> dict:
    import winreg

    def read(root, key, name, view):
        try:
            with winreg.OpenKey(root, key, 0, winreg.KEY_READ | view) as handle:
                return winreg.QueryValueEx(handle, name)[0]
        except FileNotFoundError:
            return None

    return {
        "netfx_release": read(winreg.HKEY_LOCAL_MACHINE, NETFX_KEY, "Release",
                              winreg.KEY_WOW64_32KEY),
        "webview2_user": read(winreg.HKEY_CURRENT_USER, WEBVIEW_KEY, "pv", 0),
        "webview2_machine": read(winreg.HKEY_LOCAL_MACHINE, WEBVIEW_KEY, "pv",
                                 winreg.KEY_WOW64_32KEY),
    }


def prerequisite_error(runtimes: dict) -> str:
    missing = []
    release = runtimes.get("netfx_release")
    if not isinstance(release, int) or release < 461808:
        missing.append(f"需要 .NET Framework 4.7.2 或更高版本；官方 4.8 安装/修复：{NETFX_URL}")
    versions = (runtimes.get("webview2_user"), runtimes.get("webview2_machine"))
    if not any(isinstance(v, str) and v.strip() not in {"", "0.0.0.0"} for v in versions):
        missing.append(f"需要 Microsoft Edge WebView2 Evergreen Runtime（x64）：{WEBVIEW_URL}")
    return "\n".join(missing)


def load_windows_runtime():
    # pywebview 6.2.1 catches its first CLR import failure and retries coreclr,
    # hiding the original netfx error. Load the supported runtime here first.
    from pythonnet import load
    load("netfx")


def setup_logging(userdata: Path, logger: logging.Logger) -> Path:
    """Prefer existing userdata log; preserve evidence even if that directory is unwritable."""
    try:
        userdata.mkdir(parents=True, exist_ok=True)
        handler = RotatingFileHandler(userdata / "uploader.log", maxBytes=1024 * 1024,
                                      backupCount=2, encoding="utf-8")
    except OSError:
        fallback = Path(tempfile.mkdtemp(prefix="rivalhub-uploader-startup-"))
        handler = RotatingFileHandler(fallback / "uploader.log", maxBytes=1024 * 1024,
                                      backupCount=2, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    # pywebview can catch and log backend errors rather than re-raise them.
    logging.getLogger("pywebview").addHandler(handler)
    return Path(handler.baseFilename)


def log_environment(logger: logging.Logger):
    logger.info("startup python=%s windows=%s machine=%s executable=%s cwd=%s frozen=%s",
                sys.version, platform.platform(), platform.machine(), sys.executable,
                Path.cwd(), getattr(sys, "frozen", False))
    for package in ("cs2dak", "pywebview", "pythonnet", "clr-loader"):
        try:
            value = version(package)
        except PackageNotFoundError:
            value = "metadata unavailable"
        logger.info("package %s=%s", package, value)
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
    logger.info("runtime root=%s PYTHONNET_RUNTIME=%s", root, os.environ.get("PYTHONNET_RUNTIME"))
    if getattr(sys, "frozen", False):
        for name in ("python312.dll", "Python.Runtime.dll", "ClrLoader.dll", "netstandard.dll"):
            files = list(root.rglob(name))
            if not files:
                logger.warning("bundled DLL missing: %s", name)
            for path in files:
                with path.open("rb") as stream:
                    digest = hashlib.file_digest(stream, "sha256").hexdigest()
                logger.info("bundled DLL path=%s bytes=%d sha256=%s", path, path.stat().st_size, digest)


def log_failure(logger: logging.Logger, exc: BaseException):
    logger.error("startup failed\n%s", "".join(traceback.format_exception(exc)))
    # Python traceback preserves __cause__/__context__; managed InnerException isn't a Python cause.
    pending = [exc]
    seen = set()
    while pending and len(seen) < 32:
        error = pending.pop()
        if id(error) in seen:
            continue
        seen.add(id(error))
        logger.error("exception %s: %s", type(error).__name__, error)
        for attr in ("InnerException", "__cause__", "__context__"):
            inner = getattr(error, attr, None)
            if inner is not None:
                pending.append(inner)
    for handler in logger.handlers:
        handler.flush()


def show_failure(logfile: Path, detail: str = ""):
    message = ("RivalHub Demo Uploader 启动失败。\n" + detail + "\n\n"
               f"诊断日志：{logfile}\n"
               "请保留日志并反馈；可重运行官方安装器修复应用文件。请勿单独移动内部 EXE。")
    if sys.platform == "win32":
        ctypes.windll.user32.MessageBoxW(None, message, "RivalHub Demo Uploader", 0x10)
    elif sys.stderr is not None:
        print(message, file=sys.stderr)
