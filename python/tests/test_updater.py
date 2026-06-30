"""updater.py 纯函数单测（下载/校验/暂存/解压定位）。

Windows 接力替换（apply_windows_update）依赖真实进程与文件锁，无法在
macOS/CI 端到端验证；这里只测 _find_app_root 与 _relaunch_bat 的构造。
"""

from __future__ import annotations

import hashlib
import subprocess
import zipfile
from pathlib import Path

import pytest

from cs2dak import updater


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
