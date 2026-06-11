"""Formal round model — strict v2 round semantics (see cs2-demo-format contract).

Rules enforced here:
  - roundNumber starts at 1 and is continuous; warmup / round 0 is dropped.
  - side is only "t" | "ct"; "unknown" in a formal round is a producer error.
  - teamKey is only "teamA" | "teamB".

Every downstream builder filters events through `_RoundModel` so warmup rows
never leak into kills/damages/positions etc.
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass, field

from .enums import normalize_round_end_reason


# ── tiny helpers (duplicated from exporter to avoid circular import) ──────────

def _sid(val) -> str | None:
    """Parse 17-digit SteamID64 from any demoparser2 representation."""
    if val is None or val == 0:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    if isinstance(val, str) and val.strip().lower() in {"", "0", "nan", "none"}:
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
    # Indexes built in __post_init__; events are resolved per-row across every
    # builder, so these turn O(rounds) scans into O(1)/O(log rounds) lookups.
    _by_round: dict[int, _RoundWindow] = field(init=False, repr=False, default_factory=dict)
    _sorted_starts: list[int] = field(init=False, repr=False, default_factory=list)
    _sorted_windows: list[_RoundWindow] = field(init=False, repr=False, default_factory=list)

    def __post_init__(self) -> None:
        self._by_round = {w.round_number: w for w in self.windows}
        ordered = sorted(self.windows, key=lambda w: w.start_tick)
        self._sorted_windows = ordered
        self._sorted_starts = [w.start_tick for w in ordered]

    def window_for_round(self, round_number: int) -> _RoundWindow | None:
        return self._by_round.get(round_number)

    def has_round(self, round_number: int) -> bool:
        return round_number in self._by_round

    def round_for_tick(self, tick: int) -> int | None:
        # Windows are sorted by start_tick and non-overlapping: the candidate is
        # the last window whose start_tick <= tick; confirm tick is within it
        # (ticks falling in inter-round gaps resolve to None, as before).
        i = bisect.bisect_right(self._sorted_starts, tick) - 1
        if i < 0:
            return None
        window = self._sorted_windows[i]
        return window.round_number if window.start_tick <= tick <= window.end_tick else None

    def round_for_event(self, row: dict) -> int | None:
        tick = int(row.get("tick") or 0)
        if tick > 0:
            return self.round_for_tick(tick)
        raw_round = _rn(row)
        fallback = raw_round + 1
        return fallback if fallback > 0 else None


def _event_steamid(row: dict) -> str | None:
    """Steam64 from demoparser2 player extras (not raw userid entity slot)."""
    for key in ("user_steamid", "steamid", "attacker_steamid"):
        sid = _sid(row.get(key))
        if sid is not None:
            return sid
    return None


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

    # A single round can emit multiple round_end events (e.g. a bogus warmup /
    # restart end fired before the real one). Keep only the latest-tick end per
    # round number so the same round is never counted twice.
    best_by_round: dict[int, dict] = {}
    for r in raw.get("round_ends", []):
        n = _rn(r)
        if n <= 0:
            continue
        prev = best_by_round.get(n)
        if prev is None or int(r.get("tick") or 0) > int(prev.get("tick") or 0):
            best_by_round[n] = r
    round_ends_sorted = [best_by_round[n] for n in sorted(best_by_round)]

    for r in round_ends_sorted:
        n = _rn(r)
        if n <= 0:
            continue

        end_tick = int(r.get("tick") or 0)
        s_tick = start_tick.get(n, 0)
        fz_tick = freeze_tick.get(n, 0)

        # A real round must end after its own freeze period; an end at or before
        # freeze-end is a bogus warmup/restart event — drop it (don't score it).
        if fz_tick > 0 and 0 < end_tick <= fz_tick:
            continue

        team_a_side, team_b_side = _sides_for_round(raw, team_map, n, fz_tick)
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

def _sides_for_round(
    raw: dict,
    team_map: dict[str, str],
    round_number: int,
    freeze_end_tick: int | None = None,
) -> tuple[str, str]:
    """Infer teamA/teamB side from freeze samples; formula is only fallback."""
    sampled = _sampled_side_for_round(raw, team_map, round_number, freeze_end_tick)
    if sampled is not None:
        return sampled

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
            team_a_side = "ct" if team_a_initial == "t" else "t"
        else:
            team_a_side = team_a_initial
    team_b_side = team_b_initial if team_a_side == team_a_initial else team_a_initial
    return team_a_side, team_b_side


def _sampled_side_for_round(
    raw: dict,
    team_map: dict[str, str],
    round_number: int,
    freeze_end_tick: int | None,
) -> tuple[str, str] | None:
    expected_tick = (freeze_end_tick or 0) + 16
    counts: dict[str, dict[str, int]] = {"teamA": {"t": 0, "ct": 0}, "teamB": {"t": 0, "ct": 0}}

    for row in raw.get("round_side_samples", []):
        tick = int(row.get("tick") or 0)
        if expected_tick > 16 and tick != expected_tick:
            continue
        if expected_tick <= 16:
            raw_round = _rn(row)
            if raw_round and raw_round + 1 != round_number:
                continue
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

    team_a_side = _majority_side(counts["teamA"])
    team_b_side = _majority_side(counts["teamB"])
    if team_a_side and team_b_side and team_a_side != team_b_side:
        return team_a_side, team_b_side
    if team_a_side:
        return team_a_side, "ct" if team_a_side == "t" else "t"
    if team_b_side:
        return ("ct" if team_b_side == "t" else "t"), team_b_side
    return None


def _majority_side(side_counts: dict[str, int]) -> str | None:
    if side_counts["t"] == 0 and side_counts["ct"] == 0:
        return None
    if side_counts["t"] == side_counts["ct"]:
        return None
    return "t" if side_counts["t"] > side_counts["ct"] else "ct"


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
