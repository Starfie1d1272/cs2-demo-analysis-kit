"""Smoke tests for the scaffold — verify the package imports and wires up.

Real fixture-based tests (parse a tiny golden .dem, build, validate against
cs2-demo-format/spec) come once the builders are implemented.
"""

from __future__ import annotations

import cs2_demo_exporter as pkg
from cs2_demo_exporter.package import FILENAMES, OPTIONAL


def test_schema_version_matches_contract():
    assert pkg.SCHEMA_VERSION == "cs2-demo-format/2.0"


def test_filenames_cover_all_manifest_logical_names():
    # The 11 required + 2 optional logical files of the v2 contract.
    required = {
        "manifest", "match", "players", "rounds", "playerStats",
        "playerEconomies", "kills", "damages", "blinds", "bombs",
        "grenades", "clutches",
    }
    assert required <= set(FILENAMES)
    assert set(OPTIONAL) == {"shots", "positions1s", "replay"}
    assert set(OPTIONAL) <= set(FILENAMES)


def test_cli_app_exposes_commands():
    from cs2_demo_exporter.cli import app

    assert app is not None
