from __future__ import annotations

import builtins
import logging
import sys
from types import SimpleNamespace

import pytest

from cs2dak import studio


@pytest.fixture
def studio_logging():
    previous = studio.log.handlers[:]
    level, propagate = studio.log.level, studio.log.propagate
    studio.log.handlers = []
    yield
    for handler in studio.log.handlers:
        handler.close()
    studio.log.handlers = previous
    studio.log.setLevel(level)
    studio.log.propagate = propagate


def test_logging_rotates_and_redacts_with_preconfigured_root(tmp_path, studio_logging):
    studio._setup_logging(tmp_path)
    handler = next(h for h in studio.log.handlers if isinstance(h, logging.FileHandler))
    handler.maxBytes = 250
    for _ in range(12):
        studio.log.error("request token=secret-token %s", "x" * 100)
    paths = list(tmp_path.glob("studio.log*"))
    assert 1 < len(paths) <= 4
    assert all("secret-token" not in p.read_text(encoding="utf-8") for p in paths)


def test_startup_dependency_failure_is_logged_before_webview_import(monkeypatch, tmp_path, studio_logging):
    original = builtins.__import__

    def fail_webview(name, *args, **kwargs):
        if name == "webview":
            raise ModuleNotFoundError("No module named 'webview'")
        return original(name, *args, **kwargs)

    monkeypatch.setattr(studio, "_studio_userdata", lambda: tmp_path)
    monkeypatch.setattr(builtins, "__import__", fail_webview)
    with pytest.raises(SystemExit, match="uv sync --extra gui") as error:
        studio.main()
    log_path = studio._logs_dir_for(tmp_path) / "studio.log"
    assert str(log_path) in str(error.value)
    assert "webview" in log_path.read_text(encoding="utf-8")
    assert "studio.startup" in log_path.read_text(encoding="utf-8")


@pytest.mark.parametrize("cancel", [False, True])
def test_log_export_success_and_cancel(monkeypatch, tmp_path, studio_logging, cancel):
    monkeypatch.setattr(studio, "_studio_userdata", lambda: tmp_path)
    studio._setup_logging(studio._logs_dir_for(tmp_path))
    studio.log.error("export diagnostic token=hidden")
    destination = tmp_path / "export.log"
    monkeypatch.setitem(sys.modules, "webview", SimpleNamespace(FileDialog=SimpleNamespace(SAVE=1)))
    api = studio.StudioApi()
    api._window = SimpleNamespace(create_file_dialog=lambda *a, **k: None if cancel else [str(destination)])
    result = api.export_diagnostics()
    if cancel:
        assert result == {"ok": False, "cancelled": True}
        assert not destination.exists()
    else:
        assert result["ok"] is True
        assert "export diagnostic" in destination.read_text(encoding="utf-8")
        assert "hidden" not in destination.read_text(encoding="utf-8")


def test_logging_falls_back_to_actual_temp_path(monkeypatch, tmp_path, studio_logging):
    from pathlib import Path

    blocked = tmp_path / "read-only"
    fallback = tmp_path / "fallback"
    original_mkdir = Path.mkdir

    def mkdir(path, *args, **kwargs):
        if path == blocked:
            raise PermissionError("userdata read-only")
        return original_mkdir(path, *args, **kwargs)

    monkeypatch.setattr(Path, "mkdir", mkdir)
    monkeypatch.setattr(studio.tempfile, "gettempdir", lambda: str(fallback))
    actual = studio._setup_logging(blocked)
    assert actual == fallback / "dak-studio-logs" / "studio.log"
    assert actual.is_file()
    assert "userdata read-only" in actual.read_text(encoding="utf-8")


def test_userdata_failure_still_reports_actual_diagnostic_log(monkeypatch, tmp_path, studio_logging):
    def unavailable_userdata():
        raise PermissionError("userdata unavailable")

    monkeypatch.setattr(studio, "_studio_userdata", unavailable_userdata)
    monkeypatch.setattr(studio.tempfile, "gettempdir", lambda: str(tmp_path))
    with pytest.raises(SystemExit) as error:
        studio.main()
    actual = tmp_path / "dak-studio-logs" / "studio.log"
    assert str(actual) in str(error.value)
    assert "userdata unavailable" in actual.read_text(encoding="utf-8")


def test_frontend_diagnostic_is_sanitized_in_exported_log(monkeypatch, tmp_path, studio_logging):
    monkeypatch.setattr(studio, "_studio_userdata", lambda: tmp_path)
    actual = studio._setup_logging(studio._logs_dir_for(tmp_path))
    api = studio.StudioApi()
    assert api.report_diagnostic({"stage": "worker.parse.fallback", "fileId": "match-1",
                                  "message": "worker unavailable token=secret", "raw": "unsafe-body"})["ok"]
    text = actual.read_text(encoding="utf-8")
    assert "worker.parse.fallback" in text
    assert "match-1" in text
    assert "secret" not in text
    assert "unsafe-body" not in text
