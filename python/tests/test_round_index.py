from __future__ import annotations

import json
import math
import zipfile
from io import BytesIO
from typing import Any

from cs2dak.exporter import _assemble_zip
from cs2dak.rounds import _event_steamid


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


def test_event_steamid_treats_nan_as_missing_and_uses_fallback():
    assert _event_steamid({"user_steamid": math.nan, "steamid": 76561198000000001}) == "76561198000000001"


def test_grenade_cleanup_before_freeze_end_is_not_exported():
    raw = _base_raw()
    team_a = "76561198000000001"
    raw["grenade_throws"] = [
        {
            "tick": 5200,
            "grenade": "molotov",
            "destroy_tick": 5300,
            "steamid": team_a,
            "X": 1,
            "Y": 2,
            "Z": 3,
        }
    ]
    raw["grenade_detonations"] = [
        {
            "tick": 5300,
            "total_rounds_played": 1,
            "_grenade_type": "molotov",
            "user_steamid": team_a,
            "user_X": 1,
            "user_Y": 2,
            "user_Z": 3,
        }
    ]

    pkg = _read_zip(raw)

    assert [g for g in pkg["grenades.json"] if g["effectTick"] == 5300] == []


def test_bomb_events_before_freeze_end_are_not_exported():
    raw = _base_raw()
    team_a = "76561198000000001"
    raw["bomb_dropped"] = [
        {"tick": 5200, "total_rounds_played": 1, "user_steamid": team_a}
    ]

    pkg = _read_zip(raw)

    assert [b for b in pkg["bombs.json"] if b["tick"] == 5200] == []


def test_shots_before_freeze_end_are_not_exported():
    raw = _base_raw()
    team_a = "76561198000000001"
    raw["fires"] = [
        {
            "tick": 5200,
            "total_rounds_played": 1,
            "user_steamid": team_a,
            "weapon": "weapon_knife",
        },
        {
            "tick": 6500,
            "total_rounds_played": 1,
            "user_steamid": team_a,
            "weapon": "weapon_ak47",
        },
    ]

    pkg = _read_zip(raw)

    assert [(s["roundNumber"], s["tick"], s["weapon"]) for s in pkg["shots.json"]] == [
        (2, 6500, "weapon_ak47"),
    ]


def test_world_self_deaths_before_freeze_end_are_not_exported_or_counted():
    raw = _base_raw()
    team_b = "76561198000000002"
    raw["deaths"].insert(1, {
        "tick": 5200,
        "total_rounds_played": 1,
        "user_steamid": team_b,
        "attacker_steamid": team_b,
        "weapon": "world",
        "user_X": 10,
        "user_Y": 11,
        "user_Z": 12,
    })

    pkg = _read_zip(raw)
    player_b = next(row for row in pkg["player-stats.json"] if row["steamId64"] == team_b)

    assert [k for k in pkg["kills.json"] if k["tick"] == 5200] == []
    assert player_b["deaths"] == 2
    assert player_b["combatDeathCount"] == 2
    assert player_b["bombDeathCount"] == 0


def test_grenade_destroy_tick_after_round_end_is_cleared():
    raw = _base_raw()
    team_a = "76561198000000001"
    raw["grenade_throws"] = [
        {
            "tick": 7000,
            "grenade": "smoke",
            "destroy_tick": 12000,
            "steamid": team_a,
            "X": 1,
            "Y": 2,
            "Z": 3,
        }
    ]
    raw["grenade_detonations"] = [
        {
            "tick": 7100,
            "total_rounds_played": 1,
            "_grenade_type": "smoke",
            "user_steamid": team_a,
            "user_X": 4,
            "user_Y": 5,
            "user_Z": 6,
        }
    ]

    pkg = _read_zip(raw)
    grenade = next(g for g in pkg["grenades.json"] if g["effectTick"] == 7100)

    assert grenade["destroyTick"] is None


def test_phantom_round_end_before_freeze_is_dropped() -> None:
    """A bogus round_end firing before its freeze ends must not become a real
    round nor inflate the score (regression: 16:12 OT exported as 17:12)."""
    from cs2dak.rounds import build_rounds

    team_a = "76561198000000001"
    team_b = "76561198000000002"
    team_map = {team_a: "teamA", team_b: "teamB"}
    raw = {
        "player_info": [
            {"steamid": team_a, "name": "A", "team_num": 2},
            {"steamid": team_b, "name": "B", "team_num": 3},
        ],
        "round_starts": [
            {"tick": 1, "total_rounds_played": 0},
            {"tick": 7988, "total_rounds_played": 1},
        ],
        "round_freeze_ends": [
            {"tick": 2304, "total_rounds_played": 0},
            {"tick": 9268, "total_rounds_played": 1},
        ],
        "round_ends": [
            # Phantom: ends (576) before its own freeze-end (2304) — must be dropped.
            {"tick": 576, "total_rounds_played": 1, "winner": "CT", "reason": "time_ran_out"},
            # Real R1 conclusion.
            {"tick": 7540, "total_rounds_played": 1, "winner": "CT", "reason": "ct_win"},
            # Real R2 conclusion.
            {"tick": 14140, "total_rounds_played": 2, "winner": "T", "reason": "t_win"},
        ],
    }

    rounds, _ = build_rounds(raw, team_map)

    # Exactly two real rounds, R1 kept once (the real ct_win, not the phantom).
    assert [r["roundNumber"] for r in rounds] == [1, 2]
    assert rounds[0]["endReason"] == "ct_win"
    assert rounds[0]["endTick"] == 7540
