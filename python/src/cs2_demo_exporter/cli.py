"""Command-line interface.

    cs2-demo-exporter export demos/*.dem --out exports/
    cs2-demo-exporter export-batch demos/ --out rivalhub-exports.zip --workers 4
    cs2-demo-exporter validate exports/*.zip --spec-dir ../cs2-demo-format/spec

The CLI is a thin shell: it resolves paths, drives the
parse -> build -> package (-> validate) pipeline, and reports per-file results.
All real work lives in the library modules so RivalHub / other tools can import
the pipeline without the CLI.
"""

from __future__ import annotations

from pathlib import Path

import typer

from . import __version__
from .exporter import export_demo
from .validate import validate_zip

app = typer.Typer(
    add_completion=False,
    help="Parse CS2 .dem files into cs2-demo-format v2 ZIP exports.",
)


def _export_one(dem: Path, out_dir: Path) -> Path:
    """parse -> build -> package one demo; return the written ZIP path."""
    zip_bytes = export_demo(str(dem))
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = out_dir / f"{dem.stem}.zip"
    zip_path.write_bytes(zip_bytes)
    return zip_path


@app.command()
def export(
    demos: list[Path] = typer.Argument(..., help="One or more .dem files"),
    out: Path = typer.Option(Path("exports"), "--out", help="Output directory"),
) -> None:
    """Export one or more demos to individual v2 ZIPs."""
    for dem in demos:
        zip_path = _export_one(dem, out)
        typer.echo(f"ok  {dem.name} -> {zip_path}")


@app.command("export-batch")
def export_batch(
    demo_dir: Path = typer.Argument(..., help="Directory to scan for .dem files"),
    out: Path = typer.Option(..., "--out", help="Output ZIP bundling all exports"),
    workers: int = typer.Option(4, "--workers", help="Parallel parse workers"),
    fail_fast: bool = typer.Option(False, "--fail-fast", help="Stop on first failure"),
) -> None:
    """Batch-export a folder of demos into a single bundle ZIP + report.

    TODO: discover *.dem, run _export_one across a process pool (parser is
    CPU-bound and demoparser2 releases nothing useful for threads), collect a
    per-demo success/failure report, then zip the individual exports together.
    """
    raise NotImplementedError("cli.export_batch: implement parallel batch + report")


@app.command()
def validate(
    zips: list[Path] = typer.Argument(..., help="One or more produced .zip files"),
    spec_dir: Path = typer.Option(
        ..., "--spec-dir", help="Path to cs2-demo-format/spec with *.schema.json"
    ),
) -> None:
    """Validate produced ZIPs against the cs2-demo-format JSON Schemas."""
    failed = 0
    for z in zips:
        result = validate_zip(z, spec_dir)
        if result.ok:
            typer.echo(f"ok    {z.name}")
        else:
            failed += 1
            typer.echo(f"FAIL  {z.name}")
            for err in result.errors:
                typer.echo(f"        {err}")
    if failed:
        raise typer.Exit(code=1)


@app.command()
def gui() -> None:
    """Launch the desktop GUI (requires the `gui` extra: pywebview)."""
    try:
        from .gui.app import main as gui_main
    except ImportError as exc:  # pragma: no cover - depends on optional extra
        raise typer.BadParameter(
            "GUI deps missing. Install with: pip install 'cs2-demo-exporter[gui]'"
        ) from exc
    gui_main()


@app.command()
def version() -> None:
    """Print the exporter version."""
    typer.echo(__version__)


def main() -> None:
    """Console-script entry point (see pyproject [project.scripts])."""
    app()


if __name__ == "__main__":
    main()
