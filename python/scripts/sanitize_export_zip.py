"""Create a shareable demo-package fixture from a real exporter ZIP.

The script keeps gameplay rows intact but rewrites player identity fields so
the fixture can be committed publicly.
"""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from pathlib import Path
from typing import Any

STEAM_ID_RE = re.compile(r"^\d{17}$")
FAKE_STEAM_BASE = 76561198000000000


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    args = parser.parse_args()

    payloads = read_payloads(args.source)
    steam_ids = collect_steam_ids(payloads)
    steam_map = {
        steam_id: str(FAKE_STEAM_BASE + index + 1)
        for index, steam_id in enumerate(sorted(steam_ids))
    }
    sanitized = {name: sanitize_json(payload, steam_map) for name, payload in payloads.items()}
    scrub_manifest(sanitized.get("manifest.json"))
    scrub_match(sanitized.get("match.json"))
    scrub_players(sanitized.get("players.json"))
    write_payloads(args.target, sanitized)


def read_payloads(path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(path) as zf:
        return {
            info.filename: json.loads(zf.read(info.filename))
            for info in zf.infolist()
            if info.filename.endswith(".json")
        }


def collect_steam_ids(value: Any) -> set[str]:
    if isinstance(value, str):
        return {value} if STEAM_ID_RE.match(value) else set()
    if isinstance(value, list):
        out: set[str] = set()
        for item in value:
            out.update(collect_steam_ids(item))
        return out
    if isinstance(value, dict):
        out: set[str] = set()
        for item in value.values():
            out.update(collect_steam_ids(item))
        return out
    return set()


def sanitize_json(value: Any, steam_map: dict[str, str]) -> Any:
    if isinstance(value, str):
        return steam_map.get(value, value)
    if isinstance(value, list):
        return [sanitize_json(item, steam_map) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_json(item, steam_map) for key, item in value.items()}
    return value


def scrub_manifest(value: Any) -> None:
    if not isinstance(value, dict):
        return
    demo = value.get("demo")
    if isinstance(demo, dict):
        demo["hash"] = "0" * 64
        demo["sourceFileName"] = "sanitized-sample.dem"
    value["exportedAt"] = "2026-06-01T00:00:00+00:00"


def scrub_match(value: Any) -> None:
    if not isinstance(value, dict):
        return
    if isinstance(value.get("teamA"), dict):
        value["teamA"]["name"] = "Team A"
    if isinstance(value.get("teamB"), dict):
        value["teamB"]["name"] = "Team B"
    if "serverName" in value:
        value["serverName"] = "Sanitized server"


def scrub_players(value: Any) -> None:
    if not isinstance(value, list):
        return
    for index, player in enumerate(value, start=1):
        if isinstance(player, dict):
            player["name"] = f"Player {index:02d}"


def write_payloads(path: Path, payloads: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(payloads):
            zf.writestr(
                name,
                json.dumps(payloads[name], ensure_ascii=False, separators=(",", ":"), allow_nan=False),
            )


if __name__ == "__main__":
    main()
