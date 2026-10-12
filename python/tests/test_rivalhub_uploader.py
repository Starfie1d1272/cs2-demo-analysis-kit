"""Native boundary tests without a WebView, OS credential prompts or live website."""
import base64
import hashlib
import io
import json
import threading
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import Mock

import pytest

import zipfile
from cs2dak import updater
from cs2dak import rivalhub_uploader as uploader


@pytest.fixture
def api(tmp_path):
    bridge = uploader.UploaderApi(tmp_path)
    yield bridge
    bridge.close()


def test_connection_keeps_token_out_of_metadata(api, monkeypatch):
    vault = {}

    def credential(origin, value=None):
        if value is None:
            return vault.get(origin)
        vault[origin] = value
        return True

    monkeypatch.setattr(uploader, "credential", credential)
    api.configure("https://example.com/path")
    api.save_connection("pairing", "secret-token")
    assert "secret-token" not in api._metadata.read_text(encoding="utf-8")
    other = uploader.UploaderApi(api._userdata)
    try:
        assert other.connection() == {
            "baseUrl": "https://example.com", "pairingId": "pairing", "connected": True}
        other.configure("https://other.example")
        assert credential(other._origin) is None
    finally:
        other.close()


def test_file_hash_chunks_and_cleanup(api, tmp_path, monkeypatch):
    import cs2df.package
    source = tmp_path / "demo.dem"
    source.write_bytes(b"raw demo")
    api._files["demo"] = source
    assert api.hash_demo("demo") == hashlib.sha256(b"raw demo").hexdigest()
    payload = b"zip" * 500000
    monkeypatch.setattr(cs2df.package, "export_demo", lambda *a, **k: (payload, {}))
    api._jobs["demo"] = {"state": "running"}
    api._export("demo")
    assert api.export_status("demo")["state"] == "done"
    first = base64.b64decode(api.read_chunk("demo", 0))
    assert len(first) == 1024 * 1024
    assert first + base64.b64decode(api.read_chunk("demo", len(first))) == payload
    assert api.export_status("demo")["size"] == len(payload)
    api.cleanup("demo")
    assert list(Path(api._temp.name).iterdir()) == []
    assert source.read_bytes() == b"raw demo"


def test_bridge_rejects_paths_and_cross_origin_browser(api):
    api.configure("https://example.com")
    with pytest.raises(ValueError):
        api.open_website("https://evil.example/")
    with pytest.raises(ValueError):
        api.request("/admin", "GET")
    with pytest.raises(ValueError):
        api.cleanup("../../secret")
    with pytest.raises(ValueError):
        api.read_chunk("../../secret", 0)
    assert not api.record("demo", "failed", "secret token\n")


def test_install_runtime_archive_flattens_existing_root_and_preserves_data(tmp_path: Path) -> None:
    install = tmp_path / "dak-studio"
    (install / "_internal").mkdir(parents=True)
    (install / "_internal" / "old.txt").write_text("old", encoding="utf-8")
    (install / "dak-studio.exe").write_bytes(b"old")
    for name in ("userdata", "assets", "cache", "updates"):
        (install / name).mkdir()
        (install / name / "keep.txt").write_text(name, encoding="utf-8")
    nested = install / "dak-studio"
    nested.mkdir()
    (nested / "dak-studio.exe").write_bytes(b"stale nested")

    zip_path = tmp_path / "runtime.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("dak-studio/dak-studio.exe", b"new")
        zf.writestr("dak-studio/_internal/new.txt", b"new runtime")

    target = updater.install_runtime_archive(zip_path, install)

    assert target == install / "dak-studio.exe"
    assert target.read_bytes() == b"new"
    assert (install / "_internal" / "new.txt").read_bytes() == b"new runtime"
    assert not (install / "_internal" / "old.txt").exists()
    assert (nested / "dak-studio.exe").read_bytes() == b"stale nested"
    for name in ("userdata", "assets", "cache", "updates"):
        assert (install / name / "keep.txt").read_text(encoding="utf-8") == name
    assert not list(tmp_path.glob(".dak-runtime-*"))


def test_safe_extract_rejects_path_traversal(tmp_path: Path) -> None:
    zip_path = tmp_path / "bad.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("../escape.txt", b"nope")
    with zipfile.ZipFile(zip_path) as zf, pytest.raises(updater.UpdateError):
        updater.safe_extract_zip(zf, tmp_path / "out")
    assert not (tmp_path / "escape.txt").exists()


@pytest.mark.parametrize("path", ["/events", "/events?seriesDisposition=1"])
def test_events_negotiation_retains_native_authorization(api, monkeypatch, path):
    api.configure("https://example.com")
    monkeypatch.setattr(uploader, "credential", lambda origin: "test-token")
    response = io.BytesIO(b'{"events": []}')
    response.status = 200
    opener = Mock()
    opener.open.return_value = response
    monkeypatch.setattr(uploader.urllib.request, "build_opener", lambda *args: opener)
    assert api.request(path, "GET") == {"status": 200, "body": {"events": []}}
    request = opener.open.call_args.args[0]
    assert request.full_url == "https://example.com/api/integrations/dak" + path
    assert request.get_header("Authorization") == "Bearer test-token"


def test_cancel_undoes_only_owned_authorization_and_restores_previous(api, monkeypatch):
    vault = {}

    def credential(origin, value=None):
        if value is None:
            return vault.get(origin)
        vault[origin] = value
        return True

    monkeypatch.setattr(uploader, "credential", credential)
    monkeypatch.setattr(uploader, "delete_credential", lambda origin: vault.pop(origin, None) is not None)
    api.configure("https://old.example")
    api.save_connection("original", "old-token")
    api.configure("https://new.example")
    api.save_connection("canceled", "canceled-token", "https://new.example")
    api.configure("https://new.example", "canceled")
    assert vault == {"https://old.example": "old-token"}
    assert api.connection()["pairingId"] == "original"
    # A late cancellation cannot clear the next successfully saved pairing.
    api.configure("https://new.example")
    api.save_connection("next", "next-token", "https://new.example")
    api.configure("https://new.example", "canceled")
    assert vault == {"https://new.example": "next-token"}
    assert api.connection()["pairingId"] == "next"


def test_obsolete_origin_cannot_save_credential(api, monkeypatch):
    write = Mock()
    monkeypatch.setattr(uploader, "credential", write)
    api.configure("https://next.example")
    with pytest.raises(RuntimeError, match="PAIRING_SUPERSEDED"):
        api.save_connection("old", "private", "https://old.example")
    write.assert_not_called()


def test_runtime_install_refuses_to_overwrite_custom_data(tmp_path, monkeypatch):
    install = tmp_path / "install"
    data = install / "_internal" / "custom-data"
    data.mkdir(parents=True)
    (data / "studio.sqlite").write_bytes(b"original-db")
    monkeypatch.setenv("DAK_STUDIO_DATA_DIR", str(data))
    archive = tmp_path / "runtime.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("dak-studio/dak-studio.exe", b"new-runtime")
        zf.writestr("dak-studio/_internal/runtime.bin", b"new-runtime")
    with pytest.raises(updater.UpdateError, match="未删除原资料"):
        updater.install_runtime_archive(archive, install)
    assert (data / "studio.sqlite").read_bytes() == b"original-db"


def test_native_apply_refuses_custom_data_outside_preserved_directories(tmp_path, monkeypatch):
    from cs2dak import studio
    install = tmp_path / "install"
    data = install / "custom-data"
    data.mkdir(parents=True)
    (data / "demo.zip").write_bytes(b"original-zip")
    monkeypatch.setattr(studio, "_studio_userdata", lambda: data)
    api = studio.StudioApi()
    api._update_jobs["fixture"] = SimpleNamespace(staged_path=tmp_path / "runtime.zip", state="ready")
    monkeypatch.setattr(studio.sys, "platform", "win32")
    monkeypatch.setattr(updater, "current_install_dir", lambda: install)
    monkeypatch.setattr(updater, "apply_windows_update", lambda *_args: (_ for _ in ()).throw(AssertionError("must not launch relay")))
    result = api.update_apply("fixture")
    assert not result["ok"]
    assert "自定义资料位置" in result["error"]
    assert (data / "demo.zip").read_bytes() == b"original-zip"


def test_real_webview_reflection_never_reads_native_window(tmp_path, monkeypatch):
    import webview
    from webview import util
    touched, scripts = [], []

    class NativeWindow:
        @property
        def native(self):
            touched.append("native")
            raise AssertionError("native getter must never be reflected")

        def run_js(self, script):
            scripts.append(script)

        create_file_dialog = Mock(return_value=None)

    class InlineThread:
        def __init__(self, target):
            self.target = target

        def start(self):
            self.target()

    monkeypatch.setattr(util, "Thread", InlineThread)
    monkeypatch.setattr(util, "load_js_files", lambda *args: ("bootstrap", "%(functions)s"))
    class Event:
        def __init__(self):
            self.count = 0
            self._callbacks = []

        def __iadd__(self, callback):
            self._callbacks.append(callback)
            return self

        def set(self):
            self.count += 1
            for callback in self._callbacks:
                callback()

    window = NativeWindow()
    window._functions = {}
    window._expose_lock = threading.Lock()
    window.events = SimpleNamespace(before_load=Event(), _pywebviewready=Event(), loaded=Event())

    def create_window(*args, js_api, **kwargs):
        window._js_api = js_api
        return window

    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    monkeypatch.setattr(webview, "create_window", create_window)
    monkeypatch.setattr(webview, "start", lambda **kwargs: util.inject_pywebview("edgechromium", window))
    monkeypatch.setattr(uploader, "__file__", str(tmp_path / "rivalhub_uploader.py"))
    (tmp_path / "rivalhub_uploader_web").mkdir()
    (tmp_path / "rivalhub_uploader_web" / "index.html").write_text("<html></html>")
    handlers = list(uploader.log.handlers)
    try:
        # Drive the actual production assignment in main, rather than duplicating its private name.
        uploader.main()
        api = window._js_api
        assert touched == []
        methods = {value["func"] for value in json.loads(scripts[-1])}
        expected = {
            "connection", "configure", "save_connection", "open_website", "request",
            "select_demos", "hash_demo", "start_export", "export_status", "read_chunk",
            "cleanup", "record", "export_logs", "report_ui_error",
        }
        assert methods == expected | {"close"}
        assert window.events._pywebviewready.count == 1
        assert api.select_demos() == []
        assert api.export_logs() is False
        calls = window.create_file_dialog.call_args_list
        assert calls[0].args[0] == webview.FileDialog.OPEN
        assert calls[1].args[0] == webview.FileDialog.SAVE
    finally:
        for handler in list(uploader.log.handlers):
            if handler not in handlers:
                uploader.log.removeHandler(handler)
                import logging
                logging.getLogger("pywebview").removeHandler(handler)
                handler.close()
