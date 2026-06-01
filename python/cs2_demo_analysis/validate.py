"""Lightweight Python-side validation for generated analysis artifacts.

The canonical schemas live in packages/contract. This helper is intentionally
small: Python consumers should treat generated JSON as the integration surface
until a full Python implementation is justified by fixtures.
"""

from __future__ import annotations

from typing import Any


def validate_analysis_bundle(value: dict[str, Any]) -> list[str]:
    """Return a list of human-readable validation errors."""

    errors: list[str] = []
    if value.get("version") != "cs2-demo-analysis-kit/0.2":
        errors.append("version must be cs2-demo-analysis-kit/0.2")
    if value.get("sourceSchemaVersion") != "cs2-demo-format/2.0":
        errors.append("sourceSchemaVersion must be cs2-demo-format/2.0")
    if not isinstance(value.get("scoreboard"), list):
        errors.append("scoreboard must be a list")
    if not isinstance(value.get("playerIndicators"), list):
        errors.append("playerIndicators must be a list")
    if not isinstance(value.get("playerRoundFacts"), list):
        errors.append("playerRoundFacts must be a list")
    if not isinstance(value.get("timeline"), list):
        errors.append("timeline must be a list")
    if not isinstance(value.get("qa"), dict):
        errors.append("qa must be an object")
    return errors
