"""Serialize an ExportBundle to a cs2-demo-format v2 ZIP.

Owns the logical-name -> filename mapping (mirrors the manifest `files` block in
cs2-demo-format schemas/index.ts). JSON is written with no NaN/Infinity allowed
(json.dump(allow_nan=False)) so a producer error surfaces here instead of in the
consumer.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

from .builder import ExportBundle

# Manifest logical name -> filename inside the ZIP.
FILENAMES: dict[str, str] = {
    "manifest": "manifest.json",
    "match": "match.json",
    "players": "players.json",
    "rounds": "rounds.json",
    "playerStats": "player-stats.json",
    "playerEconomies": "player-economies.json",
    "kills": "kills.json",
    "damages": "damages.json",
    "blinds": "blinds.json",
    "bombs": "bombs.json",
    "grenades": "grenades.json",
    "clutches": "clutches.json",
    "shots": "shots.json",            # optional
    "positions1s": "positions-1s.json",  # optional
    "replay": "replay.json",           # optional
}

# Bundles that may be omitted entirely (optional in the manifest).
OPTIONAL = ("shots", "positions1s", "replay")


def _dumps(obj) -> str:
    # allow_nan=False makes NaN/Infinity raise instead of emitting invalid JSON.
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def write_zip(bundle: ExportBundle, out_path: str | Path) -> Path:
    """Write the bundle to `out_path` and return the final path."""
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    payloads = {
        "manifest": bundle.manifest,
        "match": bundle.match,
        "players": bundle.players,
        "rounds": bundle.rounds,
        "playerStats": bundle.playerStats,
        "playerEconomies": bundle.playerEconomies,
        "kills": bundle.kills,
        "damages": bundle.damages,
        "blinds": bundle.blinds,
        "bombs": bundle.bombs,
        "grenades": bundle.grenades,
        "clutches": bundle.clutches,
        "shots": bundle.shots,
        "positions1s": bundle.positions1s,
        "replay": bundle.replay,
    }

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in payloads.items():
            if name in OPTIONAL and data is None:
                continue
            zf.writestr(FILENAMES[name], _dumps(data))
    return out
