"""Non-roster players (coaches/observers) must not appear in positions-1s or replay."""
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


def _make_raw(*, include_observer_in_positions: bool = True) -> dict[str, Any]:
    roster = [f"765611980000{str(i).zfill(5)}" for i in range(1, 11)]  # 10 roster players, each 17 digits
    observer = "76561198027104087"  # NOT in player_info

    player_info = [
        {"steamid": sid, "name": f"p{i}", "team_num": 2 if i <= 5 else 3}
        for i, sid in enumerate(roster, start=1)
    ]

    # One round: freeze_end=100, end=500
    round_starts      = [{"tick": 50,  "total_rounds_played": 0}]
    round_freeze_ends = [{"tick": 100, "total_rounds_played": 0}]
    round_ends        = [{"tick": 500, "total_rounds_played": 1, "winner": "T", "reason": "ct_killed"}]

    def _pos_row(steamid: str, tick: int) -> dict:
        return {
            "steamid": steamid, "tick": tick,
            "X": 100.0, "Y": 200.0, "Z": 50.0,
            "yaw": 90.0, "pitch": 0.0,
            "health": 100, "armor": 100,
            "active_weapon": "ak47", "active_weapon_name": "AK-47",
            "flash_duration": 0.0, "current_equip_value": 2700,
            "has_defuser": False, "has_c4": False,
        }

    # positions_raw: all 10 roster players + observer at tick 150
    positions_raw: list[dict] = []
    replay_raw: list[dict] = []
    for sid in roster:
        positions_raw.append(_pos_row(sid, 150))
        replay_raw.append(_pos_row(sid, 150))
    if include_observer_in_positions:
        positions_raw.append(_pos_row(observer, 150))
        replay_raw.append(_pos_row(observer, 150))

    return {
        "header": {"map_name": "de_mirage", "playback_time": 600.0},
        "tickrate": 64,
        "team_a_name": "Team Falcons",
        "team_b_name": "Team Spirit",
        "player_info": player_info,
        "round_starts": round_starts,
        "round_freeze_ends": round_freeze_ends,
        "round_ends": round_ends,
        "deaths": [],
        "hurts": [],
        "fires": [],
        "blinds": [],
        "bomb_planted": [],
        "bomb_defused": [],
        "bomb_exploded": [],
        "grenade_throws": [],
        "grenade_detonations": [],
        "positions_raw": positions_raw,
        "sample_ticks": [150],
        "replay_raw": replay_raw,
        "replay_ticks": [150],
        "economy_raw": [],
        "freeze_ticks": [],
    }


OBSERVER_SID = "76561198027104087"
ROSTER_SIDS = {f"765611980000{str(i).zfill(5)}" for i in range(1, 11)}
VALID_SIDES = {"t", "ct"}
VALID_TEAM_KEYS = {"teamA", "teamB"}


def test_positions_excludes_non_roster_observer():
    pkg = _read_zip(_make_raw(include_observer_in_positions=True))
    positions = pkg.get("positions-1s.json", [])

    steam_ids = {row["steamId64"] for row in positions}
    assert OBSERVER_SID not in steam_ids, "observer steamId must not appear in positions-1s"
    assert steam_ids == ROSTER_SIDS


def test_positions_all_side_and_teamkey_are_valid_enums():
    pkg = _read_zip(_make_raw(include_observer_in_positions=True))
    positions = pkg.get("positions-1s.json", [])
    assert positions, "positions-1s.json should be non-empty"

    for row in positions:
        assert row["side"] in VALID_SIDES, f"invalid side: {row['side']}"
        assert row["teamKey"] in VALID_TEAM_KEYS, f"invalid teamKey: {row['teamKey']}"


def test_replay_excludes_non_roster_observer():
    pkg = _read_zip(_make_raw(include_observer_in_positions=True))
    replay = pkg.get("replay.json")
    assert replay is not None

    for rnd in replay["rounds"]:
        for player in rnd["players"]:
            assert player["steamId64"] != OBSERVER_SID, \
                "observer steamId must not appear in replay"
            assert player["steamId64"] in ROSTER_SIDS


def test_replay_all_side_and_teamkey_are_valid_enums():
    pkg = _read_zip(_make_raw(include_observer_in_positions=True))
    replay = pkg.get("replay.json")
    assert replay is not None

    for rnd in replay["rounds"]:
        for player in rnd["players"]:
            assert player["side"] in VALID_SIDES, f"invalid side: {player['side']}"
            assert player["teamKey"] in VALID_TEAM_KEYS, f"invalid teamKey: {player['teamKey']}"
