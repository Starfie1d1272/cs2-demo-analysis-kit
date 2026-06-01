"""Raw extraction layer: .dem -> RawDemo via demoparser2.

This module owns the ONLY dependency on demoparser2. Everything downstream
(builder, rounds, stats) consumes the neutral `RawDemo` shape, so the parser
can be swapped without touching the v2 mapping logic.

Keep this layer dumb: pull raw events and ticks, do NOT apply v2 semantics
(no capping, no side normalization, no warmup filtering) — that belongs in
`rounds.py` / `builder.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class RawDemo:
    """Neutral container for everything pulled out of one .dem file.

    Fields are intentionally close to demoparser2's output (lists of dict rows /
    DataFrame-like records) so the parser stays a thin adapter.
    """

    source_file_name: str
    sha256: str | None = None
    header: dict[str, Any] = field(default_factory=dict)  # map, tickrate, server, ...
    events: dict[str, list[dict[str, Any]]] = field(default_factory=dict)  # event_name -> rows
    ticks: list[dict[str, Any]] = field(default_factory=list)  # per-tick player snapshots


# Game events we need for v2. Extend as builder modules grow.
REQUIRED_EVENTS = (
    "round_start",
    "round_end",
    "player_death",
    "player_hurt",
    "bomb_planted",
    "bomb_defused",
    "bomb_exploded",
    "weapon_fire",
    "player_blind",
    "flashbang_detonate",
    "hegrenade_detonate",
    "smokegrenade_detonate",
    "molotov_detonate",
)


def parse_demo(dem_path: str | Path) -> RawDemo:
    """Parse a single .dem into a RawDemo.

    TODO:
      - open with demoparser2.DemoParser(str(dem_path))
      - parse_header() -> header (map_name, tickrate fallback, server_name, ...)
      - parse_events(REQUIRED_EVENTS) -> events
      - parse_ticks([...]) for positions / economy / active weapon snapshots
      - compute sha256 of the file bytes
    Raise a clear error (not a bare demoparser2 traceback) on a corrupt demo.
    """
    raise NotImplementedError("parser.parse_demo: wire up demoparser2 extraction")
