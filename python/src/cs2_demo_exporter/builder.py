"""RawDemo -> cs2-demo-format v2 in-memory bundle.

The builder orchestrates the per-file row builders and returns an `ExportBundle`
that `package.write_zip` serializes. It does NOT touch disk or demoparser2.

Strict-v2 rules enforced here / by the row builders:
  - no "unknown" side, no 0/negative ticks, no warmup rows
  - damages carry both healthDamageRaw and capped healthDamage
  - kills carry flashAssisterSteamId64, killerActiveWeapon, victimActiveWeapon
  - NaN / Infinity must never reach the output
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from . import SCHEMA_VERSION
from .economy import build_player_economies
from .parser import RawDemo
from .rounds import resolve_rounds
from .stats import build_player_stats


@dataclass
class ExportBundle:
    """Everything that goes into one v2 ZIP, keyed by manifest logical name."""

    manifest: dict[str, Any] = field(default_factory=dict)
    match: dict[str, Any] = field(default_factory=dict)
    players: list[dict] = field(default_factory=list)
    rounds: list[dict] = field(default_factory=list)
    playerStats: list[dict] = field(default_factory=list)
    playerEconomies: list[dict] = field(default_factory=list)
    kills: list[dict] = field(default_factory=list)
    damages: list[dict] = field(default_factory=list)
    blinds: list[dict] = field(default_factory=list)
    bombs: list[dict] = field(default_factory=list)
    grenades: list[dict] = field(default_factory=list)
    clutches: list[dict] = field(default_factory=list)
    shots: list[dict] | None = None          # optional in manifest
    positions1s: list[dict] | None = None    # optional in manifest


def build_bundle(raw: RawDemo, *, exporter_version: str) -> ExportBundle:
    """Turn a parsed demo into a complete v2 bundle.

    Order matters: rounds first (everything filters through formal rounds), then
    the per-event rows, then aggregates (playerStats) derived from those rows.
    """
    rounds = resolve_rounds(raw)

    bundle = ExportBundle()
    # --- per-file row builders (each raises NotImplementedError for now) ---
    bundle.players = _build_players(raw)
    bundle.match = _build_match(raw, bundle.players)
    bundle.rounds = _build_rounds(raw, rounds)
    bundle.kills = _build_kills(raw, rounds)
    bundle.damages = _build_damages(raw, rounds)
    bundle.blinds = _build_blinds(raw, rounds)
    bundle.bombs = _build_bombs(raw, rounds)
    bundle.grenades = _build_grenades(raw, rounds)
    bundle.clutches = _build_clutches(raw, rounds)
    bundle.shots = _build_shots(raw, rounds)
    bundle.positions1s = _build_positions(raw, rounds)
    bundle.playerEconomies = build_player_economies(raw, rounds)
    bundle.playerStats = build_player_stats(
        bundle.players, bundle.rounds, bundle.kills, bundle.damages
    )
    bundle.manifest = _build_manifest(raw, bundle, exporter_version=exporter_version)
    return bundle


# --- per-file builders: fill these in one at a time, validating after each ---

def _build_match(raw: RawDemo, players: list[dict]) -> dict:
    raise NotImplementedError("builder._build_match")


def _build_players(raw: RawDemo) -> list[dict]:
    raise NotImplementedError("builder._build_players")


def _build_rounds(raw: RawDemo, rounds) -> list[dict]:
    raise NotImplementedError("builder._build_rounds")


def _build_kills(raw: RawDemo, rounds) -> list[dict]:
    raise NotImplementedError("builder._build_kills")


def _build_damages(raw: RawDemo, rounds) -> list[dict]:
    raise NotImplementedError("builder._build_damages")


def _build_blinds(raw: RawDemo, rounds) -> list[dict]:
    raise NotImplementedError("builder._build_blinds")


def _build_bombs(raw: RawDemo, rounds) -> list[dict]:
    raise NotImplementedError("builder._build_bombs")


def _build_grenades(raw: RawDemo, rounds) -> list[dict]:
    raise NotImplementedError("builder._build_grenades")


def _build_clutches(raw: RawDemo, rounds) -> list[dict]:
    raise NotImplementedError("builder._build_clutches")


def _build_shots(raw: RawDemo, rounds) -> list[dict] | None:
    raise NotImplementedError("builder._build_shots")


def _build_positions(raw: RawDemo, rounds) -> list[dict] | None:
    raise NotImplementedError("builder._build_positions")


def _build_manifest(raw: RawDemo, bundle: ExportBundle, *, exporter_version: str) -> dict:
    """Assemble manifest.json. The `files` map must match package.FILENAMES and
    omit shots/positions1s when those bundles are None."""
    raise NotImplementedError("builder._build_manifest")
