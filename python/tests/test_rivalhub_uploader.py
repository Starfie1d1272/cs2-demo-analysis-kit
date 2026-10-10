"""Native boundary tests without a WebView, OS credential prompts or live website."""
import base64
import hashlib
import io
from pathlib import Path
from unittest.mock import Mock

import pytest

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
    assert "secret-token" not in api._metadata.read_text()
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
    monkeypatch.setattr(cs2df.package, "export_demo", lambda *a, **k: (b"zip" * 500000, {}))
    api._jobs["demo"] = {"state": "running"}
    api._export("demo")
    assert api.export_status("demo")["state"] == "done"
    assert len(base64.b64decode(api.read_chunk("demo", 0))) == 1024 * 1024
    api.cleanup("demo")
    assert list(Path(api._temp.name).iterdir()) == []
    assert source.read_bytes() == b"raw demo"


def test_export_failure_is_actionable_and_cleanup_safe(api, tmp_path, monkeypatch):
    import cs2df.package
    api._files["demo"] = tmp_path / "missing.dem"
    api._jobs["demo"] = {"state": "running"}
    monkeypatch.setattr(cs2df.package, "export_demo", Mock(side_effect=ValueError("invalid header")))
    api._export("demo")
    assert api.export_status("demo")["error"] == "PARSE_FAILED：invalid header"
    api.cleanup("demo")
    assert list(Path(api._temp.name).iterdir()) == []


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


def test_events_negotiation_still_rejects_unknown_queries_and_missing_credentials(api, monkeypatch):
    api.configure("https://example.com")
    monkeypatch.setattr(uploader, "credential", lambda origin: None)
    assert api.request("/events?seriesDisposition=1", "GET")["status"] == 401
    with pytest.raises(ValueError):
        api.request("/events?seriesDisposition=1&redirect=evil", "GET")


def test_frontend_startup_errors_are_safe_to_export(api, caplog):
    api.report_ui_error("TypeError: failed Bearer secret-token", "stack Bearer another-secret")
    assert "ui startup error" in caplog.text
    assert "secret-token" not in caplog.text
    assert "another-secret" not in caplog.text


@pytest.mark.parametrize("value", ["http://remote.example", "https://u:p@example.com", "file:///x"])
def test_invalid_website(value):
    with pytest.raises(ValueError):
        uploader.normalize_origin(value)


def test_replacing_connection_clears_old_credential(api, monkeypatch):
    vault = {}
    monkeypatch.setattr(uploader, "credential", lambda origin, value=None: vault.get(origin) if value is None else vault.setdefault(origin, value) is not None)
    deleted = []
    monkeypatch.setattr(uploader, "delete_credential", lambda origin: deleted.append(origin) or vault.pop(origin, None) is not None)
    api.configure("https://old.example")
    api.save_connection("old-pair", "old-token")
    api.configure("https://new.example")
    api.save_connection("new-pair", "new-token")
    assert deleted == ["https://old.example"]
    assert vault == {"https://new.example": "new-token"}
    assert api.connection()["baseUrl"] == "https://new.example"


def test_bootstrap_persists_clr_import_failure_and_inner_cause(tmp_path, monkeypatch):
    import builtins
    import logging
    import sys
    from cs2dak import uploader_startup as startup

    class ManagedError(Exception):
        InnerException = ValueError("managed inner reason")

    original_import = builtins.__import__

    def fail_webview(name, *args, **kwargs):
        if name == "webview":
            try:
                raise ManagedError("Loader.Initialize unavailable")
            except ManagedError as cause:
                raise RuntimeError("CLR failed") from cause
        return original_import(name, *args, **kwargs)

    logger = logging.Logger("isolated-uploader")
    monkeypatch.setattr(uploader, "log", logger)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "中文 空格"))
    monkeypatch.setattr(builtins, "__import__", fail_webview)
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(startup, "windows_runtimes", lambda: {
        "netfx_release": 528040, "webview2_user": "130.0.1.2"})
    monkeypatch.setattr(startup, "load_windows_runtime", lambda: None)
    shown = Mock()
    monkeypatch.setattr(startup, "show_failure", shown)
    try:
        with pytest.raises(SystemExit) as exit_info:
            uploader.main()
        assert exit_info.value.code == 1
        evidence = shown.call_args.args[0].read_text(encoding="utf-8")
        assert "Loader.Initialize unavailable" in evidence
        assert "managed inner reason" in evidence
        assert "CLR failed" in evidence
        assert "package pythonnet=" in evidence
        assert "executable=" in evidence
        assert "windows runtimes=" in evidence
    finally:
        for handler in logger.handlers:
            logging.getLogger("pywebview").removeHandler(handler)
            handler.close()


@pytest.mark.parametrize("runtimes, expected", [
    ({"netfx_release": 461808, "webview2_user": "130.0.1.2"}, ""),
    ({"netfx_release": 528040, "webview2_machine": "130.0.1.2"}, ""),
    ({"netfx_release": 461308, "webview2_machine": "130.0.1.2"}, ".NET Framework"),
    ({"netfx_release": 528040, "webview2_user": "0.0.0.0"}, "WebView2"),
])
def test_windows_prerequisite_guidance(runtimes, expected):
    from cs2dak.uploader_startup import prerequisite_error
    message = prerequisite_error(runtimes)
    if expected:
        assert expected in message
        assert "https://" in message
    else:
        assert message == ""
