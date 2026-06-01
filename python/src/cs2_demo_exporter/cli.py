"""Command-line interface.

    cs2-demo-exporter export demos/*.dem --out exports/
    cs2-demo-exporter export-batch demos/ --out rivalhub-exports.zip
    cs2-demo-exporter validate exports/*.zip --spec-dir ../cs2-demo-format/spec

The CLI is a thin shell: it resolves paths, drives the
parse -> build -> package (-> validate) pipeline, and reports per-file results.
All real work lives in the library modules so RivalHub / other tools can import
the pipeline without the CLI.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
import zipfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
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


def _export_one_report(dem: Path, out_dir: Path) -> dict:
    started = time.perf_counter()
    try:
        zip_path = _export_one(dem, out_dir)
        duration = time.perf_counter() - started
        return {
            "demo": str(dem),
            "zip": f"exports/{zip_path.name}",
            "ok": True,
            "error": None,
            "durationSeconds": round(duration, 3),
            "demoBytes": dem.stat().st_size,
            "zipBytes": zip_path.stat().st_size,
        }
    except Exception as exc:
        duration = time.perf_counter() - started
        return {
            "demo": str(dem),
            "zip": None,
            "ok": False,
            "error": str(exc),
            "durationSeconds": round(duration, 3),
            "demoBytes": dem.stat().st_size if dem.exists() else 0,
            "zipBytes": 0,
        }


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
    workers: int | None = typer.Option(None, "--workers", help="Parallel parse workers; defaults to logical CPU count"),
    fail_fast: bool = typer.Option(False, "--fail-fast", help="Stop on first failure"),
) -> None:
    """Batch-export a folder of demos into a single bundle ZIP + report.

    Discover *.dem, run exports across a process pool, collect a per-demo
    success/failure report, then zip the individual exports together.
    """
    demos = sorted(demo_dir.glob("*.dem"))
    if not demos:
        raise typer.BadParameter(f"No .dem files found in {demo_dir}")
    workers = _default_workers() if workers is None else workers
    if workers < 1:
        raise typer.BadParameter("--workers must be >= 1")

    out.parent.mkdir(parents=True, exist_ok=True)
    report: list[dict] = []
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="cs2-demo-exporter-") as tmp:
        tmp_dir = Path(tmp)
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_export_one_report, dem, tmp_dir): dem for dem in demos}
            for future in as_completed(futures):
                dem = futures[future]
                row = future.result()
                report.append(row)
                if row["ok"]:
                    mbps = _mbps(row["demoBytes"], row["durationSeconds"])
                    typer.echo(f"ok  {dem.name} -> {Path(row['zip']).name} ({row['durationSeconds']:.1f}s, {mbps:.1f} MB/s)")
                else:
                    typer.echo(f"FAIL {dem.name}: {row['error']} ({row['durationSeconds']:.1f}s)")
                    if fail_fast:
                        for pending in futures:
                            pending.cancel()
                        raise typer.Exit(code=1)

        duration = time.perf_counter() - started
        _write_batch_bundle(out, tmp_dir, report, duration_seconds=duration)

    failed = sum(1 for row in report if not row["ok"])
    demo_mbps = _mbps(sum(row["demoBytes"] for row in report), duration)
    typer.echo(f"wrote {out} ({len(report) - failed} ok, {failed} failed, {duration:.1f}s, {demo_mbps:.1f} MB/s)")
    if failed:
        raise typer.Exit(code=1)


@app.command()
def validate(
    zips: list[Path] = typer.Argument(..., help="One or more produced .zip files"),
    spec_dir: Path | None = typer.Option(
        None, "--spec-dir", help="Path to cs2-demo-format/spec with *.schema.json"
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


def _write_batch_bundle(out: Path, tmp_dir: Path, report: list[dict], duration_seconds: float) -> None:
    demo_bytes = sum(row["demoBytes"] for row in report)
    zip_bytes = sum(row["zipBytes"] for row in report)
    payload = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "total": len(report),
        "ok": sum(1 for row in report if row["ok"]),
        "failed": sum(1 for row in report if not row["ok"]),
        "durationSeconds": round(duration_seconds, 3),
        "demoBytes": demo_bytes,
        "zipBytes": zip_bytes,
        "demoMegabytesPerSecond": round(_mbps(demo_bytes, duration_seconds), 3),
        "zipMegabytesPerSecond": round(_mbps(zip_bytes, duration_seconds), 3),
        "compressionRatio": round(zip_bytes / demo_bytes, 4) if demo_bytes else None,
        "items": sorted(report, key=lambda row: row["demo"]),
    }
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for zip_path in sorted(tmp_dir.glob("*.zip")):
            zf.write(zip_path, f"exports/{zip_path.name}")
        zf.writestr("report.json", json.dumps(payload, ensure_ascii=False, indent=2))


def _mbps(byte_count: int | float, duration_seconds: int | float) -> float:
    return (byte_count / 1_000_000) / duration_seconds if duration_seconds else 0.0


def _default_workers() -> int:
    process_cpu_count = getattr(os, "process_cpu_count", None)
    count = process_cpu_count() if process_cpu_count else os.cpu_count()
    return max(1, count or 1)


if __name__ == "__main__":
    main()
