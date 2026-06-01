from __future__ import annotations

import json
import zipfile
from io import BytesIO
from typing import Any

from cs2_demo_exporter.exporter import _assemble_zip


def _read_zip(raw: dict[str, Any]) -> dict[str, Any]:
    data = _assemble_zip(raw, "synthetic.dem", "0" * 64)
    with zipfile.ZipFile(BytesIO(data)) as zf:
        return {name: json.loads(zf.read(name)) for name in zf.namelist()}


def _base_raw() -> dict[str, Any]:
    team_a = "76561198000000001"
    team_b = "76561198000000002"
    return {
        "header": {
            "map_name": "de_ancient",
            "playback_time": 180.0,
            "server_name": "test",
        },
        "tickrate": 64,
        "team_a_name": "Team A",
        "team_b_name": "Team B",
        "player_info": [
            {"steamid": team_a, "name": "A", "team_num": 2},
            {"steamid": team_b, "name": "B", "team_num": 3},
        ],
        "round_starts": [
            {"tick": 1016, "total_rounds_played": 0},
            {"tick": 5132, "total_rounds_played": 1},
        ],
        "round_freeze_ends": [
            {"tick": 2712, "total_rounds_played": 0},
            {"tick": 6412, "total_rounds_played": 1},
        ],
        "round_ends": [
            {"tick": 4812, "total_rounds_played": 1, "winner": "T", "reason": "ct_killed"},
            {"tick": 11066, "total_rounds_played": 2, "winner": "T", "reason": "bomb_exploded"},
        ],
        "deaths": [
            {
                "tick": 4075,
                "total_rounds_played": 0,
                "user_steamid": team_b,
                "attacker_steamid": team_a,
                "weapon": "ak47",
                "user_X": 1,
                "user_Y": 2,
                "user_Z": 3,
            },
            {
                "tick": 7228,
                "total_rounds_played": 1,
                "user_steamid": team_b,
                "attacker_steamid": team_a,
                "weapon": "ak47",
                "user_X": 4,
                "user_Y": 5,
                "user_Z": 6,
            },
        ],
        "hurts": [],
        "fires": [],
        "blinds": [],
        "bomb_planted": [
            {"tick": 4070, "total_rounds_played": 0, "user_steamid": team_a, "site": "a"},
            {"tick": 8442, "total_rounds_played": 1, "user_steamid": team_a, "site": "a"},
        ],
        "bomb_defused": [],
        "bomb_exploded": [
            {"tick": 11066, "total_rounds_played": 1, "user_steamid": team_a},
        ],
        "grenade_throws": [],
        "grenade_detonations": [],
        "positions_raw": [],
        "sample_ticks": [],
        "economy_raw": [],
        "freeze_ticks": [],
    }


def test_in_progress_events_use_canonical_round_windows_not_raw_total_rounds_played():
    pkg = _read_zip(_base_raw())

    assert [row["roundNumber"] for row in pkg["rounds.json"]] == [1, 2]
    assert [(row["roundNumber"], row["tick"]) for row in pkg["kills.json"]] == [
        (1, 4075),
        (2, 7228),
    ]
    assert [(row["roundNumber"], row["type"], row["tick"]) for row in pkg["bombs.json"]] == [
        (1, "planted", 4070),
        (2, "planted", 8442),
        (2, "exploded", 11066),
    ]


def test_exported_events_stay_inside_their_round_windows():
    pkg = _read_zip(_base_raw())
    rounds = {row["roundNumber"]: row for row in pkg["rounds.json"]}

    for kill in pkg["kills.json"]:
        round_row = rounds[kill["roundNumber"]]
        assert round_row["freezeEndTick"] <= kill["tick"] <= round_row["endTick"]

    for bomb in pkg["bombs.json"]:
        round_row = rounds[bomb["roundNumber"]]
        assert round_row["freezeEndTick"] <= bomb["tick"] <= round_row["endTick"]
