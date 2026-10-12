"""updater.py 纯函数单测（下载/校验/暂存/解压定位）。

Windows 接力替换（apply_windows_update）依赖真实进程与文件锁，无法在
macOS/CI 端到端验证；这里只测 _find_app_root 与 _relaunch_bat 的构造。
"""

from __future__ import annotations

import hashlib
import subprocess
import sys
import zipfile
from contextlib import contextmanager, nullcontext
from pathlib import Path

import pytest

from cs2dak import updater


@contextmanager
def _deny_directory_delete(path):
    """Hold a real Windows directory handle without FILE_SHARE_DELETE."""
    import ctypes

    kernel = ctypes.windll.kernel32
    kernel.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
    kernel.CreateFileW.restype = ctypes.c_void_p
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    handle = kernel.CreateFileW(str(path), 0x80000000, 3, None, 3, 0x02000000, None)
    if handle == ctypes.c_void_p(-1).value:
        raise OSError("cannot lock synthetic directory")
    try:
        yield
    finally:
        kernel.CloseHandle(handle)


def _file_url(path: Path) -> str:
    return path.as_uri()


def test_sha256_file(tmp_path: Path) -> None:
    f = tmp_path / "blob.bin"
    data = b"dak-studio update payload"
    f.write_bytes(data)
    assert updater.sha256_file(f) == hashlib.sha256(data).hexdigest()


def test_updates_dir_created(tmp_path: Path) -> None:
    d = updater.updates_dir(tmp_path)
    assert d.exists() and d == tmp_path / "downloads"


def test_download_failover_and_verify(tmp_path: Path) -> None:
    good = tmp_path / "good.zip"
    payload = b"x" * 4096
    good.write_bytes(payload)
    sha = hashlib.sha256(payload).hexdigest()
    dest = tmp_path / "downloaded.zip"

    seen: list[int] = []
    result = updater.download_with_fallback(
        ["file:///definitely/missing.zip", _file_url(good)],
        dest,
        expected_sha256=sha,
        expected_size=len(payload),
        on_mirror=lambda i, _url: seen.append(i),
    )
    assert result == dest
    assert dest.read_bytes() == payload
    assert seen == [0, 1]  # 第一个失败，转移到第二个
    assert not dest.with_suffix(".zip.part").exists()  # .part 已清理


def test_download_sha_mismatch_raises(tmp_path: Path) -> None:
    f = tmp_path / "f.zip"
    f.write_bytes(b"hello")
    with pytest.raises(updater.UpdateError):
        updater.download_with_fallback([_file_url(f)], tmp_path / "out.zip", expected_sha256="00" * 32)


def test_download_size_mismatch_raises(tmp_path: Path) -> None:
    f = tmp_path / "f.zip"
    f.write_bytes(b"hello")
    with pytest.raises(updater.UpdateError):
        updater.download_with_fallback([_file_url(f)], tmp_path / "out.zip", expected_size=999)


def test_download_no_urls_raises(tmp_path: Path) -> None:
    with pytest.raises(updater.UpdateError):
        updater.download_with_fallback([], tmp_path / "out.zip")


def test_find_app_root_nested(tmp_path: Path) -> None:
    app = tmp_path / "dak-studio"
    app.mkdir()
    (app / "dak-studio.exe").write_bytes(b"MZ")
    assert updater._find_app_root(tmp_path, "dak-studio.exe") == app


def test_find_app_root_direct(tmp_path: Path) -> None:
    (tmp_path / "dak-studio.exe").write_bytes(b"MZ")
    assert updater._find_app_root(tmp_path, "dak-studio.exe") == tmp_path


def test_find_app_root_missing_raises(tmp_path: Path) -> None:
    with pytest.raises(updater.UpdateError):
        updater._find_app_root(tmp_path, "dak-studio.exe")


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


def test_install_runtime_archive_flattens_fresh_install(tmp_path: Path) -> None:
    install = tmp_path / "custom-root"
    zip_path = tmp_path / "runtime.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("dak-studio/dak-studio.exe", b"new")
        zf.writestr("dak-studio/_internal/runtime.txt", b"runtime")

    target = updater.install_runtime_archive(zip_path, install)

    assert target == install / "dak-studio.exe"
    assert (install / "_internal" / "runtime.txt").read_bytes() == b"runtime"
    assert not (install / "dak-studio" / "dak-studio.exe").exists()


def test_safe_extract_rejects_path_traversal(tmp_path: Path) -> None:
    zip_path = tmp_path / "bad.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("../escape.txt", b"nope")
    with zipfile.ZipFile(zip_path) as zf, pytest.raises(updater.UpdateError):
        updater.safe_extract_zip(zf, tmp_path / "out")
    assert not (tmp_path / "escape.txt").exists()


def test_relaunch_bat_mentions_pid_and_paths(tmp_path: Path) -> None:
    install = tmp_path / "dak-studio"
    new = tmp_path / "extract" / "dak-studio"
    bat = updater._relaunch_bat(4321, install, new, "dak-studio.exe")
    assert "4321" in bat
    assert str(install) in bat
    assert "userdata" in bat  # 便携式数据搬迁
    assert "assets" in bat and "cache" in bat and "updates" in bat
    assert "apply-update.log" in bat
    assert "| find" not in bat
    assert "DAK_PID_FOUND" in bat and "/FO CSV" in bat
    assert ":moveold" in bat and ":movenew" in bat
    assert "old move failed, restart existing app" in bat
    assert "del " in bat  # 自删脚本


def test_apply_windows_update_launches_relay_from_stage_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    install = tmp_path / "dak-studio"
    install.mkdir()
    zip_path = tmp_path / "update.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("dak-studio/dak-studio.exe", b"MZ")

    calls: list[dict] = []

    def fake_popen(args: list[str], **kwargs: object) -> object:
        calls.append({"args": args, **kwargs})
        return object()

    monkeypatch.setattr(updater.sys, "platform", "win32")
    monkeypatch.setattr(updater.time, "strftime", lambda _fmt: "20260627010101")
    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    bat_path = updater.apply_windows_update(zip_path, install, "dak-studio.exe", 4321)

    stage_root = tmp_path / ".dak-update-20260627010101"
    assert bat_path == stage_root / "apply-update.bat"
    assert bat_path.exists()
    assert calls
    assert calls[0]["args"] == ["cmd", "/c", str(bat_path)]
    assert calls[0]["cwd"] == str(stage_root)
    assert calls[0]["creationflags"] & 0x08000000  # CREATE_NO_WINDOW
    assert not calls[0]["creationflags"] & 0x00000008  # DETACHED_PROCESS


def test_cleanup_failure_does_not_replace_download_history(tmp_path, monkeypatch, caplog):
    part = tmp_path / "data.part"
    original = Path.unlink
    calls = 0

    def unlink(path, *args, **kwargs):
        nonlocal calls
        if path == part:
            calls += 1
            if calls == 2:
                raise PermissionError("cleanup denied")
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", unlink)
    monkeypatch.setattr(updater, "_download_one", lambda *_args: (_ for _ in ()).throw(OSError("network unavailable")))
    with pytest.raises(updater.UpdateError, match="network unavailable") as failure:
        updater.download_with_fallback(["first"], tmp_path / "data")
    assert failure.value.failures[0]["message"] == "network unavailable"
    assert "update_download.cleanup" in caplog.text


@pytest.mark.parametrize("name", updater.PERSISTENT_INSTALL_DIRS)
def test_nested_legacy_persistent_data_stops_install_before_deletion(tmp_path, name):
    install = tmp_path / "install"
    nested = install / "dak-studio"
    (nested / name).mkdir(parents=True)
    (nested / name / "original.bin").write_bytes(b"preserved")
    (nested / "dak-studio.exe").write_bytes(b"old-exe")
    (install / "userdata").mkdir(exist_ok=True)
    (install / "userdata" / "outer.bin").write_bytes(b"outer")
    archive = tmp_path / "runtime.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("dak-studio/dak-studio.exe", b"new-exe")
    with pytest.raises(updater.UpdateError, match="未删除旧目录"):
        updater.install_runtime_archive(archive, install)
    assert (nested / name / "original.bin").read_bytes() == b"preserved"
    assert (nested / "dak-studio.exe").read_bytes() == b"old-exe"
    assert (install / "userdata" / "outer.bin").read_bytes() == b"outer"
    assert not (install / "dak-studio.exe").exists()


@pytest.mark.skipif(sys.platform != "win32", reason="requires real cmd.exe directory move semantics")
@pytest.mark.parametrize("failed_name", updater.PERSISTENT_INSTALL_DIRS)
@pytest.mark.parametrize("failure_mode", ["target_conflict", "move_denied"])
def test_windows_relay_failure_retains_data_and_does_not_launch(tmp_path, monkeypatch, failed_name, failure_mode):
    monkeypatch.setattr(updater.time, "strftime", lambda _fmt: "fixture")
    install = tmp_path / "install"
    old = tmp_path / "install.old-fixture"
    install.mkdir()
    for name in updater.PERSISTENT_INSTALL_DIRS:
        (old / name).mkdir(parents=True)
        (old / name / "original.bin").write_bytes(name.encode())
    if failure_mode == "target_conflict":
        (install / failed_name).write_bytes(b"blocked")
    bat = updater._relaunch_bat(1, install, tmp_path / "new", "dak-studio.exe")
    body = bat[bat.index(":newmoved\n"):]
    # Execute the real migration and cleanup branch in isolated fixture directories.
    # Replace launches with a marker so no app/editor windows are opened in CI.
    body = body.replace(f'start "" "{install / "dak-studio.exe"}"', 'echo launched > "%~dp0launched.txt"')
    body = body.replace('start "" notepad.exe "%LOG%"', 'rem editor suppressed for synthetic test')
    script = tmp_path / "relay.bat"
    script.write_text('@echo off\nset "LOG=%~dp0apply-update.log"\n' + body, encoding="utf-8")
    lock = _deny_directory_delete(old / failed_name) if failure_mode == "move_denied" else nullcontext()
    with lock:
        result = subprocess.run(["cmd", "/c", str(script)], cwd=tmp_path, capture_output=True, timeout=20, check=False)
    assert result.returncode == 1
    assert old.exists()
    assert not (tmp_path / "launched.txt").exists()
    assert script.exists()
    assert "Do not delete either directory" in (tmp_path / "apply-update.log").read_text()
    for name in updater.PERSISTENT_INSTALL_DIRS:
        preserved = old / name / "original.bin"
        migrated = install / name / "original.bin"
        assert (preserved if preserved.exists() else migrated).read_bytes() == name.encode()


@pytest.mark.skipif(sys.platform != "win32", reason="requires real cmd.exe")
def test_old_relay_failure_reproduction_uses_only_temporary_fixture(tmp_path):
    old = tmp_path / "old"
    new = tmp_path / "new"
    (old / "userdata").mkdir(parents=True)
    (old / "userdata" / "studio.sqlite").write_bytes(b"synthetic-db")
    new.mkdir()
    script = tmp_path / "old-relay.bat"
    script.write_text(f'@echo off\nmove "{old / "userdata"}" "{new / "userdata"}" >nul 2>&1\nrmdir /s /q "{old}" >nul 2>&1\n', encoding="utf-8")
    with _deny_directory_delete(old / "userdata"):
        subprocess.run(["cmd", "/c", str(script)], cwd=tmp_path, capture_output=True, check=False, timeout=20)
    assert not (old / "userdata" / "studio.sqlite").exists()
    assert not (new / "userdata" / "studio.sqlite").exists()


def test_manual_install_stops_before_overwriting_custom_data_inside_runtime(tmp_path, monkeypatch):
    install = tmp_path / "install"
    data = install / "_internal" / "custom-data"
    data.mkdir(parents=True)
    (data / "studio.sqlite").write_bytes(b"original-db")
    (data / "demo.zip").write_bytes(b"original-zip")
    monkeypatch.setenv("DAK_STUDIO_DATA_DIR", str(data))
    archive = tmp_path / "runtime.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("dak-studio/dak-studio.exe", b"new-runtime")
        zf.writestr("dak-studio/_internal/runtime.bin", b"new-runtime")
    with pytest.raises(updater.UpdateError, match="未删除原资料"):
        updater.install_runtime_archive(archive, install)
    assert (data / "studio.sqlite").read_bytes() == b"original-db"
    assert (data / "demo.zip").read_bytes() == b"original-zip"


def test_native_runtime_refuses_to_move_custom_data_outside_preserved_directories(tmp_path, monkeypatch):
    from types import SimpleNamespace

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


@pytest.mark.skipif(sys.platform != "win32", reason="requires real cmd.exe")
def test_successful_relay_retains_non_whitelist_custom_data_in_old_root(tmp_path, monkeypatch):
    monkeypatch.setattr(updater.time, "strftime", lambda _fmt: "fixture")
    install = tmp_path / "install"
    old = tmp_path / "install.old-fixture"
    install.mkdir()
    custom = old / "custom-data"
    custom.mkdir(parents=True)
    (custom / "studio.sqlite").write_bytes(b"original-db")
    (custom / "demo.zip").write_bytes(b"original-zip")
    bat = updater._relaunch_bat(1, install, tmp_path / "new", "dak-studio.exe")
    body = bat[bat.index(":newmoved\n"):].replace(f'start "" "{install / "dak-studio.exe"}"', 'echo started > "%~dp0launched.txt"')
    script = tmp_path / "success-relay.bat"
    script.write_text('@echo off\nset "LOG=%~dp0apply-update.log"\n' + body, encoding="utf-8")
    subprocess.run(["cmd", "/c", str(script)], cwd=tmp_path, capture_output=True, check=True, timeout=20)
    assert (tmp_path / "launched.txt").exists()
    assert (custom / "studio.sqlite").read_bytes() == b"original-db"
    assert (custom / "demo.zip").read_bytes() == b"original-zip"
