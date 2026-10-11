"""Old Studio installer terminal outcomes without GUI or network access."""
import io
from unittest.mock import Mock

import pytest

from cs2dak import installer, updater
from cs2dak.diagnostics import SourceFailures


def shell():
    result = installer.SimpleInstaller.__new__(installer.SimpleInstaller)
    result.cancelled = False
    result.root = Mock()
    result.root.after.side_effect = lambda _delay, fn: fn()
    result._update = Mock()
    result._set_ui_state = Mock()
    result.detail_var = Mock()
    result.status_var = Mock()
    return result


def test_cancel_is_terminal_and_does_not_try_next_source(tmp_path, monkeypatch):
    app = shell()

    def download(*_args, **_kwargs):
        app.cancelled = True
        raise installer.InstallCancelled("canceled")

    attempt = Mock(side_effect=download)
    monkeypatch.setattr(installer, "download_with_progress", attempt)
    with pytest.raises(installer.InstallCancelled):
        app._download_asset({"urls": ["first", "second"]}, str(tmp_path / "data"), "runtime")
    attempt.assert_called_once()


def test_cancel_before_download_avoids_network(tmp_path, monkeypatch):
    network = Mock()
    monkeypatch.setattr(installer.urllib.request, "urlopen", network)
    with pytest.raises(installer.InstallCancelled):
        installer.download_with_progress("https://example.test", str(tmp_path / "data"), should_cancel=lambda: True)
    network.assert_not_called()


def test_cancel_during_read_removes_partial_file(tmp_path, monkeypatch):
    response = io.BytesIO(b"payload")
    response.headers = {"Content-Length": "7"}
    monkeypatch.setattr(installer.urllib.request, "urlopen", lambda *_a, **_k: response)
    canceled = False

    def progress(*_args):
        nonlocal canceled
        canceled = True

    dest = tmp_path / "data"
    with pytest.raises(installer.InstallCancelled):
        installer.download_with_progress("https://example.test", str(dest), on_progress=progress, should_cancel=lambda: canceled)
    assert not dest.exists() and not dest.with_suffix(".part").exists()


def test_cancel_restores_terminal_ui_without_failure_dialog(tmp_path, monkeypatch):
    app = shell()
    app._fetch_manifest = Mock(side_effect=installer.InstallCancelled("canceled"))
    dialog = Mock()
    monkeypatch.setattr(installer.tkinter.messagebox, "showerror", dialog)
    app._install_run(str(tmp_path))
    app._set_ui_state.assert_called_with(installing=False, done=False)
    app._update.assert_called_with("已取消安装，可重新开始", 0)
    dialog.assert_not_called()


@pytest.mark.parametrize("boundary", ["manifest", "asset", "updater"])
def test_all_mirror_errors_are_bounded_and_redacted(boundary, tmp_path, monkeypatch):
    failures = [OSError("first https://user:private@example.test?token=private"), ValueError("second sha256 failure")]
    if boundary == "manifest":
        monkeypatch.setattr(installer.urllib.request, "urlopen", Mock(side_effect=failures))
        run = shell()._fetch_manifest
    elif boundary == "asset":
        monkeypatch.setattr(installer, "download_with_progress", Mock(side_effect=failures))
        run = lambda: shell()._download_asset({"urls": ["a", "b"]}, str(tmp_path / "data"), "runtime")
    else:
        monkeypatch.setattr(updater, "_download_one", Mock(side_effect=failures))
        run = lambda: updater.download_with_fallback(["a", "b"], tmp_path / "data")
    with pytest.raises(SourceFailures) as failure:
        run()
    assert len(failure.value.failures) == 2
    assert "first" in str(failure.value) and "second sha256 failure" in str(failure.value)
    assert "private" not in str(failure.value)
    assert failure.value.failures[0]["source"] == 1
    for _ in range(20):
        failure.value.add(3, ValueError("extra"))
    assert len(failure.value.failures) == 8 and failure.value.omitted == 14


def test_mirror_history_retains_safe_inner_cause():
    try:
        try:
            raise OSError("inner refused https://user:private@example.test")
        except OSError as inner:
            raise RuntimeError("outer download failed") from inner
    except RuntimeError as outer:
        failure = SourceFailures("download failed", "install_download")
        failure.add(1, outer)
    assert "inner refused" in failure.failures[0]["cause"]
    assert "inner refused" in str(failure) and "private" not in str(failure)
