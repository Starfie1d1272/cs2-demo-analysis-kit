"""RivalHub Demo Uploader: native files, ephemeral export, HTTP and OS credentials."""
from __future__ import annotations

import base64
import hashlib
import http.client
import json
import logging
import os
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from pathlib import Path

from cs2dak.credentials import (
    _windows_credential_delete,
    _windows_credential_get,
    _windows_credential_set,
)
from cs2dak.diagnostics import (
    export_logs as export_safe_logs,
)
from cs2dak.diagnostics import (
    log_failure,
    safe_metadata,
    sanitize_text,
)

SERVICE = "com.starfie1d.rivalhub-demo-uploader"
PREFIX = "/api/integrations/dak"
log = logging.getLogger("rivalhub-uploader")


def normalize_origin(value: str) -> str:
    parsed = urllib.parse.urlsplit(value.strip())
    if parsed.username or parsed.password or not parsed.hostname:
        raise ValueError("地址不能包含账号密码")
    local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not (parsed.scheme == "http" and local):
        raise ValueError("请使用 HTTPS 网站地址；HTTP 仅支持本机开发")
    return f"{parsed.scheme}://{parsed.netloc}"


def credential(origin: str, value: str | None = None) -> str | bool | None:
    account = hashlib.sha256(origin.encode()).hexdigest()
    if sys.platform == "win32":
        return (_windows_credential_get(SERVICE, account) if value is None
                else _windows_credential_set(SERVICE, account, value))
    if sys.platform != "darwin":
        raise RuntimeError("当前系统不支持安全凭据存储，请使用 Windows 或 macOS")
    args = (["find-generic-password", "-s", SERVICE, "-a", account, "-w"] if value is None
            else ["add-generic-password", "-U", "-s", SERVICE, "-a", account, "-w", value])
    result = subprocess.run(["/usr/bin/security", *args], capture_output=True, text=True,
                            timeout=30, check=False)
    if value is not None:
        return result.returncode == 0
    return result.stdout.rstrip("\r\n") if result.returncode == 0 else None


def delete_credential(origin: str) -> bool:
    account = hashlib.sha256(origin.encode()).hexdigest()
    if sys.platform == "win32":
        return _windows_credential_delete(SERVICE, account)
    if sys.platform != "darwin":
        raise RuntimeError("当前系统不支持安全凭据存储")
    result = subprocess.run(["/usr/bin/security", "delete-generic-password", "-s", SERVICE,
                             "-a", account], capture_output=True, text=True, timeout=30, check=False)
    # Keychain returns a nonzero code when the item is already absent.
    return result.returncode == 0 or "could not be found" in result.stderr.lower()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward device credentials to a redirect destination.
        return None


class UploaderApi:
    def __init__(self, userdata: Path):
        self._window = None
        self._userdata = userdata
        self._metadata = userdata / "connection.json"
        self._temp = tempfile.TemporaryDirectory(prefix="rivalhub-uploader-")
        self._files: dict[str, Path] = {}
        self._jobs: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._closed = False
        self._origin = ""

    def connection(self) -> dict:
        if not self._metadata.exists():
            return {"baseUrl": "", "connected": False}
        data = json.loads(self._metadata.read_text())
        self._origin = normalize_origin(data["baseUrl"])
        return {**data, "connected": bool(credential(self._origin))}

    def configure(self, base_url: str) -> bool:
        self._origin = normalize_origin(base_url)
        return True

    def save_connection(self, pairing_id: str, token: str) -> bool:
        if not self._origin or not token or not credential(self._origin, token):
            raise RuntimeError("CREDENTIAL_SAVE：系统安全存储拒绝保存授权，请检查钥匙串或凭据管理器")
        previous = json.loads(self._metadata.read_text()).get("baseUrl") if self._metadata.exists() else None
        if previous and normalize_origin(previous) != self._origin and not delete_credential(normalize_origin(previous)):
            delete_credential(self._origin)
            raise RuntimeError("CREDENTIAL_REPLACE：无法清除旧网站授权，请检查系统安全存储")
        data = {"baseUrl": self._origin, "pairingId": pairing_id}
        staging = self._metadata.with_suffix(".tmp")
        staging.write_text(json.dumps(data), encoding="utf-8")
        staging.replace(self._metadata)
        log.info("connection saved host=%s", urllib.parse.urlsplit(self._origin).hostname)
        return True

    def open_website(self, url: str = "") -> bool:
        target = url or self._origin
        if normalize_origin(target) != self._origin:
            raise ValueError("授权页面必须属于当前 RivalHub 网站")
        if not webbrowser.open(target):
            raise RuntimeError("BROWSER_OPEN：无法打开浏览器，请手动打开 RivalHub 后重试连接")
        return True

    def request(self, path: str, method: str, body=None, key: str | None = None) -> dict:
        allowed = {("/pairing/start", "POST"), ("/pairing/poll", "POST"),
                   ("/events", "GET"), ("/events?seriesDisposition=1", "GET"),
                   ("/evidence", "POST")}
        if (path, method) not in allowed or not self._origin:
            raise ValueError("不支持的请求")
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if path in {"/events", "/events?seriesDisposition=1", "/evidence"}:
            token = credential(self._origin)
            if not token:
                return {"status": 401, "body": {"error": {"message": "授权不存在，请重新连接 RivalHub"}}}
            headers["Authorization"] = f"Bearer {token}"
        if key:
            headers["Idempotency-Key"] = key
        req = urllib.request.Request(self._origin + PREFIX + path, method=method, headers=headers,
                                     data=json.dumps(body).encode() if body is not None else None)
        status = 0
        request_id = ""

        def response_data(response, response_status):
            nonlocal status, request_id
            status = response_status
            response_headers = getattr(response, "headers", None)
            if response_headers:
                request_id = sanitize_text(response_headers.get("X-Request-Id", ""), 160)
            try:
                data = json.load(response)
            except (ValueError, OSError, http.client.HTTPException) as exc:
                failure = log_failure(log, exc, "http.response")
                failure.update(code="INVALID_RESPONSE", status=status, requestId=request_id)
                return {"status": status, "requestId": request_id,
                        "body": {"error": {"code": "INVALID_RESPONSE",
                                           "message": f"网站响应无效 HTTP {status}：{failure['message']}"}},
                        "diagnostic": safe_metadata(failure)}
            if not request_id and isinstance(data, dict):
                candidate = data.get("requestId")
                if not isinstance(candidate, str) and isinstance(data.get("error"), dict):
                    candidate = data["error"].get("requestId")
                if isinstance(candidate, str):
                    request_id = sanitize_text(candidate, 160)
            log.info("http method=%s path=%s status=%s requestId=%s", method, path, status, request_id)
            result = {"status": status, "body": data}
            if request_id:
                result["requestId"] = request_id
            return result

        try:
            with urllib.request.build_opener(NoRedirect()).open(req, timeout=90) as response:
                return response_data(response, response.status)
        except urllib.error.HTTPError as exc:
            with exc:
                return response_data(exc, exc.code)
        except (OSError, ValueError, http.client.HTTPException) as exc:
            failure = log_failure(log, exc, "http.request")
            failure.update(code="NETWORK", status=status, requestId=request_id)
            return {"status": status, "requestId": request_id,
                    "body": {"error": {"code": "NETWORK", "message":
                             f"NETWORK：无法连接网站，请检查网络和网站地址后重试；{failure['message']}"}},
                    "diagnostic": safe_metadata(failure)}

    def select_demos(self) -> list[dict]:
        import webview
        paths = self._window.create_file_dialog(webview.FileDialog.OPEN, allow_multiple=True,
                                               file_types=("CS2 Demo (*.dem)",))
        result = []
        for value in paths or []:
            path = Path(value)
            if path.suffix.lower() != ".dem" or not path.is_file():
                continue
            key = uuid.uuid4().hex[:12]
            self._files[key] = path
            log.info("demo=%s selected file=%s", key, json.dumps(path.name, ensure_ascii=False))
            result.append({"id": key, "name": path.name})
        return result

    def hash_demo(self, key: str) -> str:
        with self._files[key].open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        log.info("demo=%s hash complete", key)
        return digest

    def start_export(self, key: str) -> bool:
        with self._lock:
            if any(job["state"] == "running" for job in self._jobs.values()):
                raise RuntimeError("已有 Demo 正在解析，请稍候")
            self._jobs[key] = {"state": "running", "progress": 0, "stage": "正在读取 Demo"}
        threading.Thread(target=self._export, args=(key,), daemon=True).start()
        return True

    def _export(self, key: str):
        try:
            from cs2df.package import export_demo

            def progress(stage, fraction):
                stage = sanitize_text(stage, 80)
                fraction = max(0.0, min(1.0, float(fraction)))
                self._jobs[key].update(stage=stage, progress=fraction)
                log.info("demo=%s export stage=%s progress=%.3f", key, stage, fraction)

            data, _ = export_demo(str(self._files[key]), progress=progress)
            with self._lock:
                if self._closed:
                    return
                (Path(self._temp.name) / key).write_bytes(data)
                self._jobs[key].update(state="done", size=len(data), progress=1)
            log.info("demo=%s export complete bytes=%d", key, len(data))
        except BaseException as exc:
            # Rust parser panics inherit BaseException; retain cancellation semantics.
            if not isinstance(exc, Exception) and not (
                type(exc).__module__ == "pyo3_runtime" and type(exc).__name__ == "PanicException"
            ):
                raise
            failure = log_failure(log, exc, "export:" + self._jobs[key].get("stage", "parse"))
            failure.update(code="PARSE_FAILED", fileId=key)
            self._jobs[key].update(state="error", error=f"PARSE_FAILED：{failure['message']}",
                                   diagnostic=safe_metadata(failure))

    def export_status(self, key: str) -> dict:
        return dict(self._jobs[key])

    def read_chunk(self, key: str, offset: int) -> str:
        if key not in self._jobs or self._jobs[key]["state"] != "done" or offset < 0:
            raise ValueError("解析结果尚未就绪")
        with (Path(self._temp.name) / key).open("rb") as source:
            source.seek(offset)
            return base64.b64encode(source.read(1024 * 1024)).decode("ascii")

    def cleanup(self, key: str) -> bool:
        if key not in self._files:
            raise ValueError("未知 Demo")
        (Path(self._temp.name) / key).unlink(missing_ok=True)
        self._jobs.pop(key, None)
        log.info("demo=%s temporary data removed", key)
        return True

    def record(self, key: str, phase: str, code: str = "", diagnostic=None) -> bool:
        # Only controlled identifiers; never accept arbitrary response bodies or tokens into logs.
        import re
        if not all(re.fullmatch(r"[A-Za-z0-9_-]{0,64}", value) for value in (key, phase, code)):
            return False
        log.info("demo=%s phase=%s code=%s diagnostic=%s", key, phase, code,
                 json.dumps(safe_metadata(diagnostic), ensure_ascii=False))
        return True

    def report_ui_error(self, message: str, stack: str = "", diagnostic=None) -> bool:
        log.error("ui startup error message=%s stack=%s diagnostic=%s",
                  json.dumps(sanitize_text(message, 1000)), json.dumps(sanitize_text(stack, 4000)),
                  json.dumps(safe_metadata(diagnostic), ensure_ascii=False))
        return True

    def export_logs(self) -> bool:
        import webview
        target = self._window.create_file_dialog(webview.FileDialog.SAVE,
                                               save_filename="rivalhub-uploader.log")
        if not target:
            return False
        destination = target if isinstance(target, str) else target[0]
        return export_safe_logs(log, Path(destination), self._userdata / "uploader.log")

    def close(self):
        with self._lock:
            self._closed = True
            self._temp.cleanup()


def main():
    from cs2dak.uploader_startup import (
        load_windows_runtime,
        log_environment,
        log_failure,
        prerequisite_error,
        setup_logging,
        show_failure,
        windows_runtimes,
    )

    base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "Library" / "Application Support"))
    userdata = base / "RivalHub Demo Uploader"
    logfile = setup_logging(userdata, log)
    api = None
    previous_thread_hook = threading.excepthook

    def thread_failure(args):
        log_failure(log, args.exc_value, "background.thread")
        previous_thread_hook(args)

    threading.excepthook = thread_failure
    stage = "startup.environment"
    try:
        log_environment(log)
        if sys.platform == "win32":
            runtimes = windows_runtimes()
            log.info("windows runtimes=%s", runtimes)
            problem = prerequisite_error(runtimes)
            if problem:
                raise RuntimeError(problem)
            stage = "startup.netfx"
            load_windows_runtime()
        # Import only after persistent diagnostics and Windows preflight are available.
        stage = "startup.webview-import"
        import webview

        stage = "startup.frontend"
        api = UploaderApi(userdata)
        web = (Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).parent)
        page = web / "rivalhub_uploader_web" / "index.html"
        if not page.is_file():
            raise RuntimeError("前端文件缺失，请重运行官方安装器；开发环境先运行 scripts/package-uploader.sh")
        api._window = webview.create_window("RivalHub Demo Uploader", str(page), js_api=api,
                                           width=1080, height=800, min_size=(820, 640))
        api._window.events.loaded += lambda: log.info("webview loaded")
        stage = "startup.webview-start"
        webview.start(private_mode=True, **({"gui": "edgechromium"} if sys.platform == "win32" else {}))
    except Exception as exc:
        failure = log_failure(log, exc, stage)
        detail = failure.get("guidance", failure["message"])
        show_failure(logfile, detail)
        raise SystemExit(1) from exc
    finally:
        threading.excepthook = previous_thread_hook
        if api is not None:
            try:
                api.close()
                log.info("closed; temporary exports removed")
            except Exception as exc:  # noqa: BLE001 - Cleanup must not replace an active startup failure.
                log_failure(log, exc, "shutdown.cleanup")


if __name__ == "__main__":
    main()
