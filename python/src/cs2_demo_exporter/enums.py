"""Schema-strict enum mappings for cs2-demo-format v2.

Pure data tables — no imports from exporter or demoparser2.
"""

from __future__ import annotations

from typing import Any

# ── hit groups ────────────────────────────────────────────────────────────────

_HITGROUP_ENUM = {"generic", "head", "chest", "stomach", "left_arm", "right_arm",
                  "left_leg", "right_leg", "gear", "neck"}

_HITGROUP_MAP = {
    "head": "head", "chest": "chest", "stomach": "stomach",
    "leftarm": "left_arm", "left arm": "left_arm", "left_arm": "left_arm",
    "rightarm": "right_arm", "right arm": "right_arm", "right_arm": "right_arm",
    "leftleg": "left_leg", "left leg": "left_leg", "left_leg": "left_leg",
    "rightleg": "right_leg", "right leg": "right_leg", "right_leg": "right_leg",
    "gear": "gear", "neck": "neck", "generic": "generic",
}


def normalize_hitgroup(raw: str) -> str:
    """Map demoparser2 hitgroup string to hitgroupSchema enum value; fallback 'generic'."""
    return _HITGROUP_MAP.get(str(raw or "").lower().strip(), "generic")


# ── round end reasons ─────────────────────────────────────────────────────────

_END_REASON_ENUM = {"t_win", "ct_win", "target_bombed", "bomb_defused", "time_ran_out"}

_ROUND_END_REASON_MAP = {
    1: "target_bombed",
    7: "bomb_defused",
    8: "ct_win",
    9: "t_win",
    12: "time_ran_out",
}

_ROUND_END_REASON_STR_MAP = {
    "t_killed": "ct_win",
    "ct_killed": "t_win",
    "t_eliminated": "ct_win",
    "ct_eliminated": "t_win",
    "bomb_exploded": "target_bombed",
    "target_bombed": "target_bombed",
    "bomb_defused": "bomb_defused",
    "draw": "time_ran_out",
    "round_draw": "time_ran_out",
}


def normalize_round_end_reason(raw: Any) -> str:
    """Map demoparser2 round_end.reason (int or str) to v2 endReason enum; fallback 'time_ran_out'."""
    if raw is None or raw == "":
        return "time_ran_out"
    if isinstance(raw, bool):
        return "time_ran_out"
    if isinstance(raw, (int, float)):
        result = _ROUND_END_REASON_MAP.get(int(raw))
        return result if result in _END_REASON_ENUM else "time_ran_out"
    text = str(raw).strip()
    if not text:
        return "time_ran_out"
    key = text.lower().replace(" ", "_")
    if key in _ROUND_END_REASON_STR_MAP:
        mapped = _ROUND_END_REASON_STR_MAP[key]
        return mapped if mapped in _END_REASON_ENUM else "time_ran_out"
    if key in _END_REASON_ENUM:
        return key
    try:
        code = int(text)
        result = _ROUND_END_REASON_MAP.get(code)
        return result if result in _END_REASON_ENUM else "time_ran_out"
    except ValueError:
        return "time_ran_out"


# ── grenades ───────────────────────────────────────────────────────────────────

_GRENADE_TYPE_ENUM = {"flashbang", "smoke", "molotov", "incendiary", "hegrenade", "decoy"}
_GRENADE_WEAPON_TO_TYPE = {
    "smokegrenade": "smoke", "flashbang": "flashbang",
    "hegrenade": "hegrenade", "molotov": "molotov",
    "incgrenade": "incendiary", "decoy": "decoy",
}


def weapon_to_grenade_type(weapon: str) -> str | None:
    return _GRENADE_WEAPON_TO_TYPE.get(str(weapon or "").strip().lower())


# ── bombs ──────────────────────────────────────────────────────────────────────

_BOMB_TYPE_MAP = {
    "plant": "plant_begin", "plant_begin": "plant_begin",
    "planted": "planted",
    "defuse": "defuse_begin", "defuse_begin": "defuse_begin",
    "defused": "defused", "defuse_complete": "defused",
    "explode": "exploded", "exploded": "exploded",
    "dropped": "dropped", "picked_up": "picked_up",
}
