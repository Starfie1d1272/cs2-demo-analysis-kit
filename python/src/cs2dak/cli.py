"""Command-line interface.

    cs2dak version

This launcher is a thin shell for the DAK Studio desktop app.
All export logic lives in cs2df (the external cs2-demo-format v3 exporter);
cs2dak no longer bundles its own parser or builder.
"""

from __future__ import annotations

import typer

from . import __version__

app = typer.Typer(
    add_completion=False,
    help="cs2dak — Studio launcher for cs2df v3 exporter",
)


@app.command()
def version() -> None:
    """Print the cs2dak version."""
    typer.echo(__version__)


@app.callback(invoke_without_command=True)
def callback(ctx: typer.Context) -> None:
    """Keep the version subcommand and the no-argument version shortcut."""
    if ctx.invoked_subcommand is None:
        version()


def main() -> None:
    """Console-script entry point (see pyproject [project.scripts])."""
    app()


if __name__ == "__main__":
    main()
