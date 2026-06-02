from cs2_demo_exporter.enums import normalize_weapon_name
from cs2_demo_exporter.exporter import (
    _economy_type,
    _is_pistol_conversion_round,
    _is_pistol_round,
)


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
