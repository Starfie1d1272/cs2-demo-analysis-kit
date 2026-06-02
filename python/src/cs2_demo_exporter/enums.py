"""Schema-strict enum mappings for cs2-demo-format v2.

Pure data tables — no imports from exporter or demoparser2.
"""

from __future__ import annotations

import math
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


# grenade trajectories: parse_grenades() entity class -> v2 grenade type.
# Only the *Projectile classes carry a real in-flight trajectory; the held
# weapon classes (e.g. CMolotovGrenade) sit on the player with NaN coords.
# Incendiary and molotov both fly as CMolotovProjectile, so both map to
# "molotov" here — matching how inferno_expire detonations are tagged.
_GRENADE_PROJECTILE_TO_TYPE = {
    "CSmokeGrenadeProjectile": "smoke",
    "CFlashbangProjectile": "flashbang",
    "CHEGrenadeProjectile": "hegrenade",
    "CMolotovProjectile": "molotov",
    "CDecoyProjectile": "decoy",
}


def grenade_projectile_to_type(class_name: str) -> str | None:
    return _GRENADE_PROJECTILE_TO_TYPE.get(str(class_name or "").strip())


# ── inventory classification (for player economies) ─────────────────────────────
#
# parse_ticks(["inventory"]) returns weapon *display names*. Knives carry skin
# names (Karambit, M9 Bayonet, ...), so we classify by explicit primary/secondary/
# grenade sets and ignore everything else (knives, C4, Zeus, unknown).

_GRENADE_ITEMS = {
    "Smoke Grenade", "Flashbang", "High Explosive Grenade",
    "Incendiary Grenade", "Molotov", "Decoy Grenade",
}
_PISTOL_ITEMS = {
    "Glock-18", "USP-S", "P2000", "Dual Berettas", "P250", "Five-SeveN",
    "Tec-9", "CZ75-Auto", "Desert Eagle", "R8 Revolver",
}
_PRIMARY_ITEMS = {
    # SMG
    "MAC-10", "MP9", "MP7", "MP5-SD", "UMP-45", "P90", "PP-Bizon",
    # Rifle / sniper
    "Galil AR", "FAMAS", "AK-47", "M4A4", "M4A1-S", "SSG 08", "SG 553",
    "AUG", "AWP", "G3SG1", "SCAR-20",
    # Shotgun
    "Nova", "XM1014", "Sawed-Off", "MAG-7",
    # LMG
    "M249", "Negev",
}


def classify_inventory(items: Any) -> tuple[str | None, str | None, int]:
    """Return (primaryWeapon, secondaryWeapon, grenadeCount) from an inventory list.

    primary/secondary are the first matching gun in each slot; grenadeCount counts
    grenade items (max 4 per CS2 rules, not clamped here). Non-weapons (knife, C4,
    Zeus) and unknown names are ignored.
    """
    if not isinstance(items, (list, tuple)):
        return None, None, 0
    primary: str | None = None
    secondary: str | None = None
    grenades = 0
    for it in items:
        name = str(it or "").strip()
        if name in _GRENADE_ITEMS:
            grenades += 1
        elif primary is None and name in _PRIMARY_ITEMS:
            primary = name
        elif secondary is None and name in _PISTOL_ITEMS:
            secondary = name
    return primary, secondary, grenades


# ── active weapon normalization ───────────────────────────────────────────────
#
# demoparser2 tick props expose `active_weapon_name` / `weapon_name` as display
# names ("AK-47", "M4A1-S", ...). Replay consumers expect stable identifier-like
# strings, not display text or entity handles.

_WEAPON_DISPLAY_TO_CANONICAL = {
    # Pistols
    "glock-18": "glock",
    "usp-s": "usp_silencer",
    "p2000": "hkp2000",
    "dual berettas": "elite",
    "p250": "p250",
    "five-seven": "fiveseven",
    "tec-9": "tec9",
    "cz75-auto": "cz75a",
    "desert eagle": "deagle",
    "r8 revolver": "revolver",
    # SMG
    "mac-10": "mac10",
    "mp9": "mp9",
    "mp7": "mp7",
    "mp5-sd": "mp5sd",
    "ump-45": "ump45",
    "p90": "p90",
    "pp-bizon": "bizon",
    # Rifle / sniper
    "galil ar": "galilar",
    "famas": "famas",
    "ak-47": "ak47",
    "m4a4": "m4a1",
    "m4a1-s": "m4a1_silencer",
    "ssg 08": "ssg08",
    "sg 553": "sg556",
    "aug": "aug",
    "awp": "awp",
    "g3sg1": "g3sg1",
    "scar-20": "scar20",
    # Shotgun / LMG
    "nova": "nova",
    "xm1014": "xm1014",
    "sawed-off": "sawedoff",
    "mag-7": "mag7",
    "m249": "m249",
    "negev": "negev",
    # Utility / equipment
    "smoke grenade": "smokegrenade",
    "flashbang": "flashbang",
    "high explosive grenade": "hegrenade",
    "incendiary grenade": "incgrenade",
    "molotov": "molotov",
    "decoy grenade": "decoy",
    "zeus x27": "taser",
    "c4 explosive": "c4",
    "c4": "c4",
    "knife": "knife",
    "knife_t": "knife_t",
}


def normalize_weapon_name(raw: Any) -> str | None:
    """Return a stable weapon identifier, or None for handles/unknown values."""
    if isinstance(raw, float) and math.isnan(raw):
        return None
    text = str(raw or "").strip()
    if not text or text.isdigit() or text.lower() in {"nan", "none", "null"}:
        return None
    lower = text.lower()
    if lower.startswith("weapon_"):
        lower = lower[7:]
    if lower in _WEAPON_DISPLAY_TO_CANONICAL:
        return _WEAPON_DISPLAY_TO_CANONICAL[lower]
    ident = lower.replace("-", "_").replace(" ", "_")
    return ident if ident and ident[0].isalpha() and all(c.isalnum() or c == "_" for c in ident) else None


# ── bombs ──────────────────────────────────────────────────────────────────────
#
# The bomb_planted `site` field is a per-map bombsite *entity index*, not an A/B
# constant (dust2 430/431, inferno 81/429, ancient 433/434…), and its ordering
# does NOT map to A/B (reversed on de_inferno / de_ancient). So A/B is read
# straight from the demo: the CS2 engine tags each player's current named area
# in `last_place_name`, which is "BombsiteA" / "BombsiteB" when on a site. This
# is authoritative, map-agnostic, and needs no per-map calibration.

def bomb_site_from_place(place: Any) -> str | None:
    """Map a CS2 place name to "a"/"b"; None if it is not a bombsite area."""
    p = str(place or "").strip().lower()
    if p == "bombsitea":
        return "a"
    if p == "bombsiteb":
        return "b"
    return None


_BOMB_TYPE_MAP = {
    "plant": "plant_begin", "plant_begin": "plant_begin",
    "planted": "planted",
    "defuse": "defuse_begin", "defuse_begin": "defuse_begin",
    "defused": "defused", "defuse_complete": "defused",
    "explode": "exploded", "exploded": "exploded",
    "dropped": "dropped", "picked_up": "picked_up",
}
