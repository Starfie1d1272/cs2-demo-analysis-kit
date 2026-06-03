from cs2dak.enums import normalize_weapon_name
from cs2dak.exporter import (
    _build_damages,
    _build_economies,
    _build_player_stats,
    _economy_type,
    _is_pistol_conversion_round,
    _is_pistol_round,
)
from cs2dak.rounds import _RoundModel, _RoundWindow


def test_pistol_rounds_are_fixed_mr12_rounds_not_total_round_dependent():
    assert _is_pistol_round(1)
    assert _is_pistol_round(13)
    assert not _is_pistol_round(11)
    assert not _is_pistol_round(15)
    assert not _is_pistol_round(25)

    assert _economy_type(650, 800, 850, 13) == "pistol"
    assert _economy_type(650, 800, 850, 11) == "eco"


def test_pistol_winner_follow_up_is_team_conversion_only():
    rounds = [
        {"roundNumber": 1, "winnerTeamKey": "teamA"},
        {"roundNumber": 13, "winnerTeamKey": "teamB"},
    ]

    assert _is_pistol_conversion_round(2, "teamA", rounds)
    assert not _is_pistol_conversion_round(2, "teamB", rounds)
    assert _is_pistol_conversion_round(14, "teamB", rounds)
    assert not _is_pistol_conversion_round(14, "teamA", rounds)
    assert not _is_pistol_conversion_round(25, "teamA", rounds)


def test_pistol_conversion_round_exports_as_full_contract_economy():
    team_a = [f"7656119800000000{i}" for i in range(1, 6)]
    team_b = [f"7656119800000000{i}" for i in range(6, 10)] + ["76561198000000010"]
    team_map = {sid: "teamA" for sid in team_a} | {sid: "teamB" for sid in team_b}
    round_model = _RoundModel(
        windows=[
            _RoundWindow(round_number=1, start_tick=1, freeze_end_tick=10, end_tick=100),
            _RoundWindow(round_number=2, start_tick=101, freeze_end_tick=110, end_tick=200),
        ],
        side_map={
            (1, "teamA"): "t", (1, "teamB"): "ct",
            (2, "teamA"): "t", (2, "teamB"): "ct",
        },
    )
    rounds = [
        {"roundNumber": 1, "winnerTeamKey": "teamA", "teamAEconomy": None, "teamBEconomy": None},
        {"roundNumber": 2, "winnerTeamKey": "teamA", "teamAEconomy": None, "teamBEconomy": None},
    ]
    raw = {
        "economy_raw": [
            {
                "tick": 110,
                "steamid": sid,
                "cash_spent_this_round": 0,
                "current_equip_value": 800,
                "start_balance": 3500,
                "armor": 0,
                "has_helmet": False,
                "has_defuser": False,
                "inventory": "",
            }
            for sid in team_a
        ]
    }

    _build_economies(raw, team_map, round_model, rounds)

    assert rounds[1]["teamAEconomy"] == "full"
    assert rounds[1]["teamAEconomy"] != "conversion"


def test_economy_thresholds_keep_sub_1000_save_bucket_and_regular_ak_armor_force():
    assert _economy_type(700, 800, 700, 2) == "eco"
    assert _economy_type(1150, 1350, 1150, 2) == "force"
    assert _economy_type(3350, 3400, 3350, 8) == "force"
    assert _economy_type(3200, 8000, 4200, 8) == "full"


def test_normalize_weapon_name_prefers_names_and_rejects_numeric_handles():
    assert normalize_weapon_name("AK-47") == "ak47"
    assert normalize_weapon_name("M4A1-S") == "m4a1_silencer"
    assert normalize_weapon_name("USP-S") == "usp_silencer"
    assert normalize_weapon_name("weapon_awp") == "awp"
    assert normalize_weapon_name("7667885") is None


def test_effective_damage_is_capped_per_victim_per_round():
    attacker = "76561198000000001"
    victim = "76561198000000002"
    team_map = {attacker: "teamA", victim: "teamB"}
    round_model = _RoundModel(
        windows=[_RoundWindow(round_number=1, start_tick=1, freeze_end_tick=1, end_tick=100)],
        side_map={(1, "teamA"): "t", (1, "teamB"): "ct"},
    )
    raw = {
        "hurts": [
            {
                "tick": 10,
                "user_steamid": victim,
                "attacker_steamid": attacker,
                "weapon": "ak47",
                "hitgroup": "chest",
                "dmg_health": 40,
                "dmg_armor": 0,
                "health": 60,
                "armor": 100,
            },
            {
                "tick": 20,
                "user_steamid": victim,
                "attacker_steamid": attacker,
                "weapon": "ak47",
                "hitgroup": "chest",
                "dmg_health": 90,
                "dmg_armor": 0,
                "health": 10,
                "armor": 100,
            },
        ],
    }

    damages = _build_damages(raw, team_map, round_model)
    player_stats = _build_player_stats(
        raw,
        team_map,
        round_model,
        rounds=[{
            "roundNumber": 1,
            "startTick": 1,
            "freezeEndTick": 1,
            "endTick": 100,
            "teamASide": "t",
            "teamBSide": "ct",
            "winnerTeamKey": "teamA",
            "winnerSide": "t",
        }],
        kills_list=[],
        blinds_list=[],
    )

    assert [row["healthDamage"] for row in damages] == [40, 60]
    assert damages[1]["victimHealthBefore"] == 60
    assert damages[1]["victimHealthAfter"] == 0

    attacker_stats = next(row for row in player_stats if row["steamId64"] == attacker)
    assert attacker_stats["damageHealth"] == 100
    assert attacker_stats["adr"] == 100
