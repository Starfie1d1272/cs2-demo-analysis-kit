"""Formal round model + side/team normalization.

This is where v2's strict round semantics live (see cs2-demo-format AGENTS.md):
  - roundNumber starts at 1 and is continuous; warmup / round 0 is dropped.
  - side is only "t" | "ct"; "unknown" in a formal round is a producer error.
  - teamKey is only "teamA" | "teamB"; real names live in match.teamA/teamB.name.

Every downstream builder filters events through `FormalRounds` so warmup rows
never leak into kills/damages/etc.
"""

from __future__ import annotations

from dataclasses import dataclass

from .parser import RawDemo


@dataclass
class RoundWindow:
    """Tick boundaries of one formal round, used to bucket events."""

    round_number: int  # 1-based, continuous
    start_tick: int
    end_tick: int


@dataclass
class FormalRounds:
    """Resolved formal-round model for a demo."""

    windows: list[RoundWindow]
    # steamId64 -> teamKey ("teamA"/"teamB") and the side that team played per round.
    team_of_player: dict[str, str]
    # (round_number, teamKey) -> side ("t"/"ct"), accounting for the halftime swap.
    side_of_team: dict[tuple[int, str], str]

    def round_for_tick(self, tick: int) -> int | None:
        """Return the 1-based formal round number for a tick, or None if warmup."""
        for w in self.windows:
            if w.start_tick <= tick <= w.end_tick:
                return w.round_number
        return None


def resolve_rounds(raw: RawDemo) -> FormalRounds:
    """Build the formal-round model from raw round_start/round_end events.

    TODO:
      - drop warmup (is_warmup / negative or 0 round) rows
      - renumber to continuous 1..N
      - map each team to teamA/teamB stably across the halftime swap
      - resolve t/ct side per (round, team); reject "unknown" in formal rounds
    """
    raise NotImplementedError("rounds.resolve_rounds: implement formal round model")
