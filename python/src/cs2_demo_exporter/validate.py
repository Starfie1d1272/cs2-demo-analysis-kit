"""Validate a produced ZIP with the canonical cs2-demo-format validator."""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)


def validate_zip(zip_path: str | Path, spec_dir: str | Path | None = None) -> ValidationResult:
    """Validate one v2 ZIP using cs2-demo-format/tools/validate.py.

    The format repository owns both generated schemas and package-level QA. This
    wrapper only locates that installed checkout and adapts its process result to
    the exporter's CLI result type.
    """
    zip_path = Path(zip_path)
    try:
        format_root = _find_format_root(spec_dir)
    except FileNotFoundError as exc:
        return ValidationResult(False, [str(exc)])
    spec_path = Path(spec_dir) if spec_dir is not None else format_root / "spec"
    tool_path = format_root / "tools" / "validate.py"

    if not tool_path.exists():
        return ValidationResult(False, [f"cs2-demo-format validator not found: {tool_path}"])
    if not spec_path.exists():
        return ValidationResult(False, [f"cs2-demo-format spec directory not found: {spec_path}"])

    proc = subprocess.run(
        [sys.executable, str(tool_path), str(zip_path), "--spec", str(spec_path)],
        text=True,
        capture_output=True,
        check=False,
    )
    output = [line for line in (proc.stdout + proc.stderr).splitlines() if line.strip()]
    return ValidationResult(proc.returncode == 0, [] if proc.returncode == 0 else output)


def _find_format_root(spec_dir: str | Path | None = None) -> Path:
    import os

    if spec_dir is not None:
        spec_path = Path(spec_dir).resolve()
        return spec_path.parent if spec_path.name == "spec" else spec_path

    # Honour CS2DAK_SPEC_DIR for CI/sandbox environments without pnpm.
    env_spec = os.environ.get("CS2DAK_SPEC_DIR")
    if env_spec:
        candidate = Path(env_spec).resolve()
        if (candidate / "tools" / "validate.py").exists() and (candidate / "spec").exists():
            return candidate

    here = Path(__file__).resolve()
    repo_root = here.parents[3]
    pnpm_roots = (
        sorted((repo_root / "node_modules" / ".pnpm").glob("*/node_modules/cs2-demo-format"))
        if (repo_root / "node_modules" / ".pnpm").exists()
        else []
    )
    candidates = [
        repo_root / "node_modules" / "cs2-demo-format",
        *pnpm_roots,
        repo_root.parent / "cs2-demo-format",
    ]

    for candidate in candidates:
        if (candidate / "tools" / "validate.py").exists() and (candidate / "spec").exists():
            return candidate

    raise FileNotFoundError(
        "Could not locate cs2-demo-format. Run pnpm install or pass --spec-dir."
    )
