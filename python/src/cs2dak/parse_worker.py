"""demoparser2 extraction -> raw event dict for the v2 exporter.

Provenance: ported from DrEAmSs59/CS2-insight-agent
(backend/app/rivalhub_parse_worker.py) with the author's permission. The
`demoparser2` import is lazy (inside parse_demo) so this package can be
imported — and the pure builders in exporter.py tested — without the native
parser installed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from demoparser2 import DemoParser  # type: ignore

# 进度回调：(阶段名, 0..1 完成度)。各阶段权重按实测耗时占比粗估，
# 仅用于 UI 进度条，不要求精确。
ProgressFn = Callable[[str, float], None]


_GRENADE_EVENTS = [
    ("smokegrenade_detonate", "smoke"),
    ("flashbang_detonate", "flashbang"),
    ("hegrenade_detonate", "hegrenade"),
    ("inferno_expire", "molotov"),
    ("decoy_detonate", "decoy"),
]


def _rows(result: Any) -> list[dict]:
    """Convert demoparser2 result (DataFrame or list) to list of dicts."""
    if result is None:
        return []
    if hasattr(result, "to_dict"):
        return result.to_dict(orient="records")
    return list(result)


def _safe_event(
    parser: DemoParser,
    event: str,
    other: list[str] | None = None,
    player: list[str] | None = None,
) -> list[dict]:
    try:
        kwargs: dict[str, list[str]] = {}
        if other is not None:
            kwargs["other"] = other
        if player is not None:
            kwargs["player"] = player
        if kwargs:
            return _rows(parser.parse_event(event, **kwargs))
        return _rows(parser.parse_event(event))
    except Exception:
        return []


def _safe_events(
    parser: DemoParser,
    names: list[str],
    other: list[str] | None = None,
    player: list[str] | None = None,
) -> dict[str, list[dict]]:
    """Batch-parse several events in ONE demo scan via parse_events.

    `other`/`player` are shared across the batch (demoparser2 applies the same
    extra props to every event; props an event lacks come back as NaN columns,
    which the builders ignore). Falls back to per-event parse_event on failure.
    Returns {event_name: rows}; events with no occurrences map to [].
    """
    kwargs: dict[str, list[str]] = {}
    if other is not None:
        kwargs["other"] = other
    if player is not None:
        kwargs["player"] = player
    try:
        pairs = parser.parse_events(names, **kwargs)
        out = {name: _rows(df) for name, df in pairs}
    except Exception:
        out = {name: _safe_event(parser, name, other=other, player=player) for name in names}
    for name in names:
        out.setdefault(name, [])
    return out


# steamid/XYZ for grenade detonations — resolve thrower via player extras
# (raw userid is an entity slot, not a Steam64).
_GRENADE_PLAYER_FIELDS = ["steamid", "X", "Y", "Z"]


def _nearest_path(path: dict[int, tuple], t: int) -> tuple:
    """Position in `path` (tick→xyz) at the tick nearest to `t`."""
    if not path:
        return (0.0, 0.0, 0.0)
    k = min(path.keys(), key=lambda kt: abs(kt - t))
    return path[k]


def _extract_grenade_paths(
    parser: DemoParser, sample_ticks: list[int]
) -> tuple[list[dict], list[dict]]:
    """Throw origins + in-flight trajectories from parse_grenades().

    Each thrown grenade is a *Projectile entity with a per-tick flight path.
    Returns (throws, trajectories):
      throws       — first/last per throw, shaped for _build_grenades:
                     {grenade_entity_id, grenade, tick, destroy_tick, steamid, X, Y, Z}.
      trajectories — flight path sampled onto the replay grid (`sample_ticks`),
                     for replay rendering: {grenade, steamid, start_tick, xs, ys, zs}.
                     Flight phase only; the static smoke/fire effect afterwards
                     lives in grenades.json (effectPosition + destroyTick).
    """
    from .enums import grenade_projectile_to_type

    try:
        g = parser.parse_grenades()
    except Exception:
        return [], []
    if g is None or not hasattr(g, "columns") or "grenade_entity_id" not in g.columns:
        return [], []
    try:
        proj = g[g["grenade_type"].astype(str).str.endswith("Projectile")]
        proj = proj.dropna(subset=["x", "y", "z"]).sort_values(
            ["grenade_entity_id", "tick"])
        if proj.empty:
            return [], []
        # Entity ids are recycled across the match, so the same id covers many
        # different grenades. Start a new throw whenever the id changes or the
        # per-tick flight path breaks (gap > ~1s), then take first/last per throw.
        eid = proj["grenade_entity_id"]
        tick = proj["tick"]
        seg = ((eid != eid.shift()) | ((tick - tick.shift()) > 64)).cumsum()
        proj = proj.assign(_seg=seg)
        grouped = proj.groupby("_seg", sort=False)
        first = grouped.first()
        last_tick = grouped["tick"].last()
    except Exception:
        return [], []

    grid = sorted({int(t) for t in (sample_ticks or [])})

    throws: list[dict] = []
    trajectories: list[dict] = []
    for seg_id, seg_rows in grouped:
        row = first.loc[seg_id]
        gtype = grenade_projectile_to_type(row.get("grenade_type"))
        if gtype is None:
            continue
        eid_val = row.get("grenade_entity_id")
        throw_tick = int(row["tick"])
        last = int(last_tick.loc[seg_id])
        steamid = row.get("steamid")
        throws.append({
            "grenade_entity_id": int(eid_val) if eid_val is not None else None,
            "grenade": gtype,
            "tick": throw_tick,
            "destroy_tick": last,
            "steamid": steamid,
            "X": float(row["x"]),
            "Y": float(row["y"]),
            "Z": float(row["z"]),
        })

        # sample the flight path onto the replay grid ticks within [throw, last]
        path = {
            int(t): (x, y, z)
            for t, x, y, z in zip(
                seg_rows["tick"], seg_rows["x"], seg_rows["y"], seg_rows["z"]
            )
        }
        gticks = [t for t in grid if throw_tick <= t <= last]
        if not gticks:
            # flight shorter than one grid step → single frame at the throw
            gticks = [throw_tick]
            path.setdefault(throw_tick, (row["x"], row["y"], row["z"]))
        xs: list[int] = []
        ys: list[int] = []
        zs: list[int] = []
        for t in gticks:
            pos = path.get(t) or _nearest_path(path, t)
            xs.append(int(round(pos[0])))
            ys.append(int(round(pos[1])))
            zs.append(int(round(pos[2])))
        # Smoke/decoy *Projectile entities linger at rest for the whole effect,
        # so the path has a stationary tail (per-frame motion ~0). Trim trailing
        # at-rest frames (<10 u/frame ≈ jitter, well below a roll's ~16+); keep
        # the flight arc + roll-to-rest. The static effect lives in grenades.json.
        while len(xs) >= 2 and (
            (xs[-1] - xs[-2]) ** 2
            + (ys[-1] - ys[-2]) ** 2
            + (zs[-1] - zs[-2]) ** 2
        ) <= 100:
            xs.pop()
            ys.pop()
            zs.pop()
        trajectories.append({
            "grenade": gtype,
            "steamid": steamid,
            "start_tick": gticks[0],
            "xs": xs,
            "ys": ys,
            "zs": zs,
        })

    return throws, trajectories


def parse_demo(dem_path: str, progress: ProgressFn | None = None) -> dict[str, Any]:
    """Full event extraction. Returns a plain dict — all values must be JSON-serializable."""
    from demoparser2 import DemoParser  # type: ignore  # lazy: native dep

    def _p(stage: str, frac: float) -> None:
        if progress is not None:
            progress(stage, frac)

    _p("打开 demo", 0.01)
    p = DemoParser(dem_path)

    # ── header ───────────────────────────────────────────────────
    try:
        header = dict(p.parse_header())
    except BaseException:
        header = {}

    try:
        tickrate = int(float(header.get("tick_rate") or 64))
    except (TypeError, ValueError):
        tickrate = 64

    _p("解析回合事件", 0.05)
    # ── round boundaries + blinds + match-start announce ─────────
    # One scan: events that need no player= props. The union `other` carries
    # every field any of them reads; events lacking a field get NaN columns
    # (ignored downstream). total_rounds_played anchors each event to a round.
    g_round = _safe_events(p,
        ["round_start", "round_freeze_end", "round_end", "player_blind",
         "round_announce_match_start"],
        other=["winner", "reason", "legacy", "blind_duration", "total_rounds_played"],
    )
    round_starts      = g_round["round_start"]
    round_freeze_ends = g_round["round_freeze_end"]
    round_ends        = g_round["round_end"]
    blinds            = g_round["player_blind"]
    announce_rows     = g_round["round_announce_match_start"]

    _p("解析击杀", 0.15)
    # ── player deaths ────────────────────────────────────────────
    # X/Y/Z are player entity props — pass via player= so demoparser2
    # prefixes them as attacker_X/Y/Z and user_X/Y/Z automatically.
    # active_weapon gives attacker_active_weapon and user_active_weapon.
    deaths = _safe_event(p, "player_death",
        other=[
            "headshot", "noscope", "thrusmoke", "penetrated", "penetrated_objects",
            "assistedflash", "attackerblind",
            "total_rounds_played",
        ],
        player=["X", "Y", "Z", "active_weapon"],
    )

    _p("解析伤害", 0.25)
    # ── damages ──────────────────────────────────────────────────
    # player= gives attacker_X/Y/Z and user_X/Y/Z for attacker/victim positions.
    hurts = _safe_event(p, "player_hurt", other=[
        "weapon", "hitgroup", "dmg_health", "dmg_armor", "health", "armor",
        "total_rounds_played",
    ], player=["X", "Y", "Z"])

    _p("解析开枪", 0.35)
    # ── shots ────────────────────────────────────────────────────
    # player= gives user_vel_X/Y/Z (velocity) and user_yaw/user_pitch (aim).
    fires = _safe_event(p, "weapon_fire", other=["weapon", "total_rounds_played"],
                        player=["vel_X", "vel_Y", "vel_Z", "yaw", "pitch"])

    _p("解析炸弹事件", 0.45)
    # ── bombs ────────────────────────────────────────────────────
    # One scan for all 7 bomb lifecycle events; player=["steamid"] adds
    # user_steamid to identify the actor. begin/dropped/pickup feed the v2
    # plant_begin/defuse_begin/dropped/picked_up event types.
    g_bomb = _safe_events(p,
        ["bomb_planted", "bomb_defused", "bomb_exploded",
         "bomb_beginplant", "bomb_begindefuse", "bomb_dropped", "bomb_pickup"],
        other=["site", "total_rounds_played"],
        player=["steamid", "X", "Y", "Z", "last_place_name"])
    bomb_planted     = g_bomb["bomb_planted"]
    bomb_defused     = g_bomb["bomb_defused"]
    bomb_exploded    = g_bomb["bomb_exploded"]
    bomb_beginplant  = g_bomb["bomb_beginplant"]
    bomb_begindefuse = g_bomb["bomb_begindefuse"]
    bomb_dropped     = g_bomb["bomb_dropped"]
    bomb_pickup      = g_bomb["bomb_pickup"]

    _p("解析道具引爆", 0.52)
    # ── grenades ─────────────────────────────────────────────────
    # One scan for all detonation types; tag each row with its v2 grenade type.
    g_nade = _safe_events(p, [name for name, _ in _GRENADE_EVENTS],
                          other=["total_rounds_played"], player=_GRENADE_PLAYER_FIELDS)
    grenade_detonations: list[dict] = []
    for ev_name, gtype in _GRENADE_EVENTS:
        grenade_detonations.extend(
            {**r, "_grenade_type": gtype} for r in g_nade[ev_name]
        )

    # ── player info at match start ───────────────────────────────
    if announce_rows:
        match_start_tick = int(announce_rows[0]["tick"])
    elif round_freeze_ends:
        match_start_tick = int(round_freeze_ends[0]["tick"])
    else:
        match_start_tick = 1

    # ── team names from CCSTeam entity ──────────────────────────
    team_a_name: str | None = None
    team_b_name: str | None = None
    try:
        team_rows = _rows(p.parse_ticks(
            ["CCSTeam.m_szClanTeamname", "CCSTeam.m_iTeamNum"],
            ticks=[match_start_tick],
        ))
        for row in team_rows:
            tn = row.get("CCSTeam.m_iTeamNum")
            name = str(row.get("CCSTeam.m_szClanTeamname") or "").strip()
            if not name or name.lower() in ("ct", "terrorist", "t", "team a", "team b"):
                continue
            if tn == 2:
                team_a_name = name
            elif tn == 3:
                team_b_name = name
    except BaseException:
        pass

    try:
        player_info = _rows(p.parse_ticks(
            ["name", "steamid", "team_num", "team_name"],
            ticks=[match_start_tick],
        ))
    except BaseException:
        player_info = []

    # ── positions (~1 Hz) + replay (~8 Hz): single parse over replay ticks ──
    _p("解析走位回放（最耗时）", 0.60)
    replay_step = max(1, tickrate // 8)  # 8 Hz
    replay_ticks = _build_sample_ticks(round_ends, round_freeze_ends, tickrate,
                                       step=replay_step)
    all_positions: list[dict] = []
    sample_ticks: list[int] = []
    if replay_ticks:
        try:
            all_positions = _rows(p.parse_ticks(
                [
                    "steamid", "team_num", "X", "Y", "Z", "yaw", "pitch",
                    "health", "armor", "active_weapon", "active_weapon_name", "flash_duration",
                    "current_equip_value", "has_defuser", "has_c4", "last_place_name",
                    # inventory carries "C4 Explosive" for the bomb carrier; this
                    # build's has_c4/is_bomb_carrier tick props return None, so the
                    # inventory is the reliable per-frame C4-ownership signal.
                    "inventory",
                ],
                ticks=replay_ticks,
            ))
            # derive 1 Hz subset: every Nth = tickrate / replay_step
            subsample = max(1, tickrate // replay_step)
            sample_tick_set = {replay_ticks[i] for i in range(0, len(replay_ticks), subsample)}
            sample_ticks = sorted(sample_tick_set)
        except BaseException:
            all_positions = []
    positions_raw = [r for r in all_positions if r.get("tick") in sample_tick_set]
    replay_raw = all_positions

    _p("解析道具轨迹", 0.85)
    # ── grenades: throw origins + flight paths sampled onto replay grid ──
    # One parse_grenades() scan; trajectories align to the 8 Hz replay ticks.
    grenade_throws, grenade_trajectories = _extract_grenade_paths(p, replay_ticks)

    _p("解析经济", 0.93)
    # ── economy: player state at each freeze_end tick ────────────
    freeze_ticks = sorted({int(r["tick"]) for r in round_freeze_ends if r.get("tick")})
    economy_raw: list[dict] = []
    if freeze_ticks:
        try:
            economy_raw = _rows(p.parse_ticks(
                [
                    "steamid", "team_num", "cash_spent_this_round", "current_equip_value",
                    "start_balance", "armor", "has_helmet", "has_defuser", "inventory",
                ],
                ticks=freeze_ticks,
            ))
        except BaseException:
            economy_raw = []

    return {
        "header": header,
        "tickrate": tickrate,
        "match_start_tick": match_start_tick,
        "team_a_name": team_a_name,
        "team_b_name": team_b_name,
        "player_info": player_info,
        "round_starts": round_starts,
        "round_freeze_ends": round_freeze_ends,
        "round_ends": round_ends,
        "deaths": deaths,
        "hurts": hurts,
        "fires": fires,
        "blinds": blinds,
        "bomb_planted": bomb_planted,
        "bomb_defused": bomb_defused,
        "bomb_exploded": bomb_exploded,
        "bomb_beginplant": bomb_beginplant,
        "bomb_begindefuse": bomb_begindefuse,
        "bomb_dropped": bomb_dropped,
        "bomb_pickup": bomb_pickup,
        "grenade_detonations": grenade_detonations,
        "grenade_throws": grenade_throws,
        "grenade_trajectories": grenade_trajectories,
        "positions_raw": positions_raw,
        "sample_ticks": sample_ticks,
        "replay_raw": replay_raw,
        "replay_ticks": replay_ticks,
        "economy_raw": economy_raw,
        "freeze_ticks": freeze_ticks,
    }


def _build_sample_ticks(
    round_ends: list[dict],
    round_freeze_ends: list[dict],
    tickrate: int,
    step: int | None = None,
) -> list[int]:
    """Return sorted unique sample ticks at interval `step` within active play.

    total_rounds_played at round_freeze_end = N-1 for round N, so store
    at actual_round = rn + 1. total_rounds_played at round_end = N, which
    then matches actual_round for the correct freeze tick lookup.
    """
    if step is None:
        step = tickrate  # default: ~1 Hz
    freeze_by_round: dict[int, int] = {}
    for r in round_freeze_ends:
        rn = int(r.get("total_rounds_played") or 0)
        t = int(r.get("tick") or 0)
        actual_round = rn + 1
        if actual_round > 0 and t > 0:
            freeze_by_round[actual_round] = t

    ticks: list[int] = []
    for r in round_ends:
        rn = int(r.get("total_rounds_played") or 0)
        end_t = int(r.get("tick") or 0)
        start_t = freeze_by_round.get(rn, 0)  # rn == actual_round for round_end
        if start_t <= 0 or end_t <= start_t:
            continue
        t = start_t
        while t < end_t:
            ticks.append(t)
            t += step
    return sorted(set(ticks))
