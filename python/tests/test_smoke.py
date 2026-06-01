"""Smoke tests — verify the package imports and schema contract."""

from __future__ import annotations

import cs2_demo_exporter as pkg


def test_schema_version_matches_contract():
    assert pkg.SCHEMA_VERSION == "cs2-demo-format/2.0"


def test_cli_app_exposes_commands():
    from cs2_demo_exporter.cli import app

    assert app is not None
