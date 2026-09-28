"""Native boundary tests without a WebView, OS credential prompts or live website."""
import base64
import hashlib
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
