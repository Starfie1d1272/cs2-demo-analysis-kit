"""Boundary tests for native cs2df 5.x runner."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from cs2dak import cs2df_runner


def _write_fake_cs2df(
    directory: Path,
    *,
    version_output: str,
    exit_code: int = 0,
    stdout_lines: list[str] | None = None,
) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    lines = stdout_lines or []
    body = f"""import json
import sys
import zipfile
from pathlib import Path

args = sys.argv[1:]
if args == ["--version"]:
    print({version_output!r})
    sys.exit(0)
if args and args[0] == "export":
    out = Path(args[args.index("-o") + 1])
    for line in {lines!r}:
        print(line, flush=True)
    if {exit_code} != 0:
        sys.exit({exit_code})
    with zipfile.ZipFile(out, "w") as zf:
        zf.writestr("match.json", json.dumps({{"mapName": "de_inferno", "teamA": {{"name": "A", "score": 13}}, "teamB": {{"name": "B", "score": 10}}}}))
    sys.exit(0)
sys.exit(2)
"""
    if sys.platform == "win32":
        py_path = directory / "fake_cs2df.py"
        py_path.write_text(body, encoding="utf-8")
        cmd_path = directory / "cs2df.cmd"
        cmd_path.write_text(f'@echo off\r\n"{sys.executable}" "{py_path}" %*\r\n', encoding="utf-8")
        return cmd_path
    sh_path = directory / "cs2df"
    sh_path.write_text(f"#!{sys.executable}\n{body}", encoding="utf-8")
    sh_path.chmod(0o755)
    return sh_path


@pytest.fixture(autouse=True)
def _clear_verified_cache():
    cs2df_runner._VERIFIED_BINS.clear()
    yield
    cs2df_runner._VERIFIED_BINS.clear()


def test_rejects_python_4x_binary(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _write_fake_cs2df(tmp_path, version_output="cs2df 4.0.0")
    monkeypatch.setenv("CS2DF_BIN", str(fake))
    with pytest.raises(RuntimeError, match=r"5\.x"):
        cs2df_runner.resolve_cs2df_bin()


def test_resolves_bundled_meipass_binary(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CS2DF_BIN", raising=False)
    bundle_dir = tmp_path / "bundle"
    (bundle_dir / "bin").mkdir(parents=True)
    name = "cs2df.exe" if sys.platform.startswith("win") else "cs2df"
    bundled = bundle_dir / "bin" / name
    bundled.write_bytes(b"binary")
    monkeypatch.setattr(sys, "_MEIPASS", str(bundle_dir), raising=False)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(cs2df_runner, "verify_cs2df_version", lambda p: str(p))
    assert cs2df_runner.resolve_cs2df_bin() == str(bundled)


def test_export_dem_to_zip_streams_progress_and_reads_match(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = _write_fake_cs2df(
        tmp_path,
        version_output="cs2df 5.0.0",
        stdout_lines=[
            "  [  0.9%] open demo",
            "  [ 49.5%] replay grid (slowest stage)",
            "wrote out.zip (1.35 MB) in 3.5s",
        ],
    )
    monkeypatch.setenv("CS2DF_BIN", str(fake))
    dem = tmp_path / "match.dem"
    dem.write_bytes(b"HL2DEMO")
    out_zip = tmp_path / "out.zip"
    seen: list[tuple[str, float]] = []

    meta = cs2df_runner.export_dem_to_zip(
        dem,
        out_zip,
        research=True,
        compress_level=3,
        progress=lambda stage, frac: seen.append((stage, frac)),
    )
    assert meta["mapName"] == "de_inferno"
    assert out_zip.is_file()
    assert seen == [
        ("open demo", pytest.approx(0.009)),
        ("replay grid (slowest stage)", pytest.approx(0.495)),
    ]


def test_export_dem_to_zip_cleans_up_on_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = _write_fake_cs2df(
        tmp_path,
        version_output="cs2df 5.0.0",
        exit_code=1,
        stdout_lines=["error: corrupt demo header"],
    )
    monkeypatch.setenv("CS2DF_BIN", str(fake))
    dem = tmp_path / "bad.dem"
    dem.write_bytes(b"bad")
    out_zip = tmp_path / "bad.zip"
    with pytest.raises(RuntimeError, match="corrupt demo header"):
        cs2df_runner.export_dem_to_zip(dem, out_zip)
    assert not out_zip.exists()
