"""Smoke tests — verify the package imports and schema contract."""
from __future__ import annotations

import cs2dak as pkg


def test_schema_version_matches_contract():
    assert pkg.SCHEMA_VERSION == "cs2-demo-format/3.0"


def test_cli_app_exposes_commands():
    from cs2dak.cli import app

    assert app is not None


def test_cs2df_is_available():
    import cs2df

    assert cs2df is not None
