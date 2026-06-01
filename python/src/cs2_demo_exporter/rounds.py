"""Formal round model — strict v2 round semantics (see cs2-demo-format contract).

Rules enforced here:
  - roundNumber starts at 1 and is continuous; warmup / round 0 is dropped.
  - side is only "t" | "ct"; "unknown" in a formal round is a producer error.
  - teamKey is only "teamA" | "teamB".

Every downstream builder filters events through `_RoundModel` so warmup rows
never leak into kills/damages/positions etc.
"""

from __future__ import annotations

from dataclasses import dataclass

from .enums import normalize_round_end_reason


# ── tiny helpers (duplicated from exporter to avoid circular import) ──────────

def _sid(val) -> str | None:
    """Parse 17-digit SteamID64 from any demoparser2 representation."""
    if val is None or val == 0:
        return None
    s = str(int(val))
    return s if len(s) == 17 and s.isdigit() else None


def _rn(row: dict) -> int:
    return int(row.get("total_rounds_played") or 0)


# ── round model ────────────────────────────────────────────────────────────────

@dataclass
class _RoundWindow:
    round_number: int
    start_tick: int
    freeze_end_tick: int
    end_tick: int


@dataclass
class _RoundModel:
    windows: list[_RoundWindow]
    side_map: dict[tuple[int, str], str]

    def round_for_tick(self, tick: int) -> int | None:
        for window in self.windows:
            if window.start_tick <= tick <= window.end_tick:
                return window.round_number
        return None

    def round_for_event(self, row: dict) -> int | None:
        tick = int(row.get("tick") or 0)
        if tick > 0:
            return self.round_for_tick(tick)
        raw_round = _rn(row)
        fallback = raw_round + 1
        return fallback if fallback > 0 else None


def _event_steamid(row: dict) -> str | None:
    """Steam64 from demoparser2 player extras (not raw userid entity slot)."""
    return _sid(
        row.get("user_steamid")
        or row.get("steamid")
        or row.get("attacker_steamid")
    )


# ── round builder ──────────────────────────────────────────────────────────────

def build_rounds(
    raw: dict, team_map: dict[str, str]
) -> tuple[list[dict], _RoundModel]:
    """Return (rounds_list, side_map) from raw demoparser2 output.

    side_map[(roundNumber, teamKey)] = "t" | "ct"

    total_rounds_played at round_freeze_end/round_start = N-1 for round N
    (rounds completed so far), so we store at actual_round = n + 1.
    total_rounds_played at round_end = N (the round that just completed).
    """
    freeze_tick: dict[int, int] = {}
    for r in raw.get("round_freeze_ends", []):
        n = _rn(r)
        t = int(r.get("tick") or 0)
        actual_round = n + 1
        if actual_round > 0 and t > 0:
            freeze_tick[actual_round] = t

    start_tick: dict[int, int] = {}
    for r in raw.get("round_starts", []):
        n = _rn(r)
        t = int(r.get("tick") or 0)
        actual_round = n + 1
        if actual_round > 0 and t > 0 and actual_round not in start_tick:
            start_tick[actual_round] = t

    team_a_score = 0
    team_b_score = 0
    out: list[dict] = []
    side_map: dict[tuple[int, str], str] = {}
    windows: list[_RoundWindow] = []

    round_ends_sorted = sorted(
        raw.get("round_ends", []),
        key=lambda r: _rn(r)
    )
    for r in round_ends_sorted:
        n = _rn(r)
        if n <= 0:
            continue

        end_tick = int(r.get("tick") or 0)
        s_tick = start_tick.get(n, 0)
        fz_tick = freeze_tick.get(n, 0)

        team_a_side, team_b_side = _sides_for_round(raw, team_map, n)
        side_map[(n, "teamA")] = team_a_side
        side_map[(n, "teamB")] = team_b_side

        # v2: startTick, freezeEndTick, endTick must all be >= 1
        if s_tick <= 0 or fz_tick <= 0 or end_tick <= 0:
            winner_raw = str(r.get("winner") or "").lower()
            if winner_raw in ("t", "2"):
                winner_key = "teamA" if team_a_side == "t" else "teamB"
            elif winner_raw in ("ct", "3"):
                winner_key = "teamA" if team_a_side == "ct" else "teamB"
            else:
                winner_key = None

            if winner_key == "teamA":
                team_a_score += 1
            elif winner_key == "teamB":
                team_b_score += 1
            continue

        winner_raw = str(r.get("winner") or "").lower()
        if winner_raw in ("t", "2"):
            winner_side = "t"
            winner_key = "teamA" if team_a_side == "t" else "teamB"
        elif winner_raw in ("ct", "3"):
            winner_side = "ct"
            winner_key = "teamA" if team_a_side == "ct" else "teamB"
        else:
            winner_side = None
            winner_key = None

        if not winner_key or not winner_side:
            continue

        end_reason = normalize_round_end_reason(r.get("reason"))

        out.append({
            "roundNumber": n,
            "startTick": s_tick,
            "freezeEndTick": fz_tick,
            "endTick": end_tick,
            "teamASide": team_a_side,
            "teamBSide": team_b_side,
            "teamAScoreBefore": team_a_score,
            "teamBScoreBefore": team_b_score,
            "teamAEconomy": None,
            "teamBEconomy": None,
            "winnerTeamKey": winner_key,
            "winnerSide": winner_side,
            "endReason": end_reason,
        })
        windows.append(_RoundWindow(n, s_tick, fz_tick, end_tick))

        if winner_key == "teamA":
            team_a_score += 1
        elif winner_key == "teamB":
            team_b_score += 1

    # Replace any None economy with "semi"
    for rd in out:
        if rd["teamAEconomy"] is None:
            rd["teamAEconomy"] = "semi"
        if rd["teamBEconomy"] is None:
            rd["teamBEconomy"] = "semi"

    return out, _RoundModel(windows=windows, side_map=side_map)


# ── side inference ─────────────────────────────────────────────────────────────

def _sides_for_round(raw: dict, team_map: dict[str, str], round_number: int) -> tuple[str, str]:
    """Infer teamA/teamB side for MR12 + OT from player_info, falling back to A=T."""
    start_side_by_team = _starting_side_by_team(raw, team_map)
    team_a_initial = start_side_by_team.get("teamA", "t")
    team_b_initial = "ct" if team_a_initial == "t" else "t"
    if round_number <= 12:
        team_a_side = team_a_initial
    elif round_number <= 24:
        team_a_side = "ct" if team_a_initial == "t" else "t"
    else:
        ot_block = (round_number - 25) // 3
        if ot_block % 2 == 0:
            team_a_side = team_a_initial
        else:
            team_a_side = "ct" if team_a_initial == "t" else "t"
    team_b_side = team_b_initial if team_a_side == team_a_initial else team_a_initial
    return team_a_side, team_b_side


def _starting_side_by_team(raw: dict, team_map: dict[str, str]) -> dict[str, str]:
    counts: dict[str, dict[str, int]] = {"teamA": {"t": 0, "ct": 0}, "teamB": {"t": 0, "ct": 0}}
    for row in raw.get("player_info", []):
        sid = _sid(row.get("steamid"))
        key = team_map.get(sid or "")
        if key not in counts:
            continue
        try:
            team_num = int(row.get("team_num") or 0)
        except (TypeError, ValueError):
            continue
        side = "t" if team_num == 2 else "ct" if team_num == 3 else None
        if side:
            counts[key][side] += 1
    out: dict[str, str] = {}
    for key, side_counts in counts.items():
        out[key] = "t" if side_counts["t"] >= side_counts["ct"] else "ct"
    return out
