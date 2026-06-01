"""Validate a produced ZIP against the cs2-demo-format JSON Schemas.

The contract ships generated JSON Schema in `cs2-demo-format/spec/*.schema.json`.
This module loads those schemas and checks each file in the ZIP, plus
package-level QA (manifest.files matches actual entries, schemaVersion, no
NaN/Infinity). Mirrors what `cs2-demo-format/tools/validate.py` does, so a ZIP
that passes here should pass the canonical validator too.

Point it at a local checkout of cs2-demo-format/spec via --spec-dir, or bundle a
pinned copy of the schemas later.
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)


def validate_zip(zip_path: str | Path, spec_dir: str | Path) -> ValidationResult:
    """Validate one v2 ZIP against the schemas in `spec_dir`.

    TODO:
      - load manifest.json, assert schemaVersion == "cs2-demo-format/2.0"
      - for each file, jsonschema.validate against spec/<name>.schema.json
      - assert manifest.files entries exist in the archive and vice-versa
      - assert no NaN/Infinity slipped through (json.load already rejects them)
    """
    raise NotImplementedError("validate.validate_zip: wire up jsonschema checks")


def _open_members(zip_path: str | Path) -> dict[str, bytes]:
    with zipfile.ZipFile(zip_path) as zf:
        return {n: zf.read(n) for n in zf.namelist()}
