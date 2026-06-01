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
