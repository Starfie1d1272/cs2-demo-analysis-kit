import logging
import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from cs2dak import rivalhub_uploader as uploader
from cs2dak import studio


def dialog_module(monkeypatch):
    monkeypatch.setitem(sys.modules, "webview", SimpleNamespace(FileDialog=SimpleNamespace(OPEN=1)))


def test_uploader_cancel_rejected_and_partial_selection(tmp_path, monkeypatch, caplog):
    dialog_module(monkeypatch)
    api = uploader.UploaderApi(tmp_path)
    api._window = SimpleNamespace(create_file_dialog=Mock(return_value=None))
    caplog.set_level(logging.INFO, logger="rivalhub-uploader")
    try:
        assert api.select_demos() == []
        assert "FILE_SELECTION_CANCELLED" in caplog.text
        wrong, missing = tmp_path / "synthetic-private.zip", tmp_path / "synthetic-private.dem"
        api._window.create_file_dialog.return_value = [str(wrong), str(missing)]
        with pytest.raises(RuntimeError, match="FILE_SELECTION_REJECTED"):
            api.select_demos()
        assert "FILE_EXTENSION_REJECTED" in caplog.text
        assert "FILE_MISSING" in caplog.text
        assert "synthetic-private" not in caplog.text
        valid = tmp_path / "sample.dem"
        valid.write_bytes(b"demo")
        api._window.create_file_dialog.return_value = [str(missing), str(valid)]
        assert len(api.select_demos()) == 1
        assert "accepted=1 rejected=1" in caplog.text
    finally:
        api.close()


def test_uploader_dialog_failure_is_logged_safely(tmp_path, monkeypatch, caplog):
    dialog_module(monkeypatch)
    api = uploader.UploaderApi(tmp_path)
    api._window = SimpleNamespace(create_file_dialog=Mock(side_effect=RuntimeError("dialog accessToken=synthetic-secret /home/synthetic/demo")))
    try:
        with pytest.raises(RuntimeError, match="FILE_DIALOG_FAILED"):
            api.select_demos()
        assert "selection.dialog" in caplog.text
        assert "synthetic-secret" not in caplog.text
        assert "/home/synthetic" not in caplog.text
    finally:
        api.close()


@pytest.mark.parametrize("fallback", [None, ["/synthetic/demo.zip"], RuntimeError("fallback pollToken=synthetic-secondary")])
def test_studio_dialog_fallback_retains_primary_and_secondary(monkeypatch, caplog, fallback):
    dialog_module(monkeypatch)
    api = studio.StudioApi.__new__(studio.StudioApi)
    api._window = SimpleNamespace(create_file_dialog=Mock(side_effect=[RuntimeError("filtered accessToken=synthetic-primary"), fallback]))
    caplog.set_level(logging.INFO, logger=studio.log.name)
    if isinstance(fallback, Exception):
        with pytest.raises(RuntimeError, match="FILE_DIALOG_FAILED"):
            api.pick_dems()
        assert "selection.dialog.fallback" in caplog.text
    else:
        assert api.pick_dems() == (fallback or [])
        assert f"outcome={'selected' if fallback else 'cancelled'}" in caplog.text
    assert "selection.dialog.filtered" in caplog.text
    assert "synthetic-primary" not in caplog.text
    assert "synthetic-secondary" not in caplog.text
    assert "/synthetic/demo.zip" not in caplog.text


def test_uploader_read_failure_is_distinct_from_absence(tmp_path, monkeypatch, caplog):
    dialog_module(monkeypatch)
    api = uploader.UploaderApi(tmp_path)
    source = tmp_path / "private-source.dem"
    api._window = SimpleNamespace(create_file_dialog=Mock(return_value=[str(source)]))
    original_stat = type(source).stat

    def denied(path, *args, **kwargs):
        if path == source:
            raise PermissionError("read denied accessToken=synthetic-read-secret /home/synthetic/demo")
        return original_stat(path, *args, **kwargs)

    monkeypatch.setattr(type(source), "stat", denied)
    try:
        with pytest.raises(RuntimeError, match="FILE_SELECTION_REJECTED"):
            api.select_demos()
        assert "selection.read" in caplog.text
        assert "PermissionError" in caplog.text
        assert "FILE_MISSING" not in caplog.text
        assert "synthetic-read-secret" not in caplog.text
        assert "/home/synthetic" not in caplog.text
    finally:
        api.close()
