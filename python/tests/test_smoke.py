"""Smoke tests — verify the package imports and schema contract."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import cs2dak as pkg


def test_schema_version_matches_contract():
    assert pkg.SCHEMA_VERSION == "cs2-demo-format/2.0"


def test_cli_app_exposes_commands():
    from cs2dak.cli import app

    assert app is not None


def test_batch_bundle_contains_exports_and_report(tmp_path):
    from cs2dak.cli import _write_batch_bundle

    export_dir = tmp_path / "exports"
    export_dir.mkdir()
    (export_dir / "a.zip").write_bytes(b"fake-a")
    (export_dir / "b.zip").write_bytes(b"fake-b")
    out = tmp_path / "bundle.zip"

    _write_batch_bundle(out, export_dir, [
        {"demo": "a.dem", "zip": "exports/a.zip", "ok": True, "error": None, "durationSeconds": 1.5, "demoBytes": 10_000_000, "zipBytes": 6_000_000},
        {"demo": "b.dem", "zip": "exports/b.zip", "ok": False, "error": "boom", "durationSeconds": 0.5, "demoBytes": 20_000_000, "zipBytes": 0},
    ], duration_seconds=2.0)

    with zipfile.ZipFile(out) as zf:
        assert sorted(zf.namelist()) == ["exports/a.zip", "exports/b.zip", "report.json"]
        report = json.loads(zf.read("report.json"))

    assert report["total"] == 2
    assert report["ok"] == 1
    assert report["failed"] == 1
    assert report["durationSeconds"] == 2.0
    assert report["demoBytes"] == 30_000_000
    assert report["zipBytes"] == 6_000_000
    assert report["demoMegabytesPerSecond"] == 15.0


def test_validate_zip_uses_format_validator():
    from cs2dak.validate import validate_zip

    fixture = Path(__file__).resolve().parents[2] / "fixtures/input/cs2dak-sanitized-de_ancient.zip"
    result = validate_zip(fixture)

    assert result.ok, "\n".join(result.errors[:20])


def test_default_workers_uses_available_cpu_count(monkeypatch):
    from cs2dak import cli

    monkeypatch.setattr(cli.os, "cpu_count", lambda: 16)
    if hasattr(cli.os, "process_cpu_count"):
        monkeypatch.setattr(cli.os, "process_cpu_count", lambda: 12)

    expected = 12 if hasattr(cli.os, "process_cpu_count") else 16
    assert cli._default_workers() == expected


def test_default_workers_falls_back_to_one(monkeypatch):
    from cs2dak import cli

    monkeypatch.setattr(cli.os, "cpu_count", lambda: None)
    if hasattr(cli.os, "process_cpu_count"):
        monkeypatch.setattr(cli.os, "process_cpu_count", lambda: None)

    assert cli._default_workers() == 1
