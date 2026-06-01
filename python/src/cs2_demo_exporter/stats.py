"""playerStats aggregation (player-stats.json).

Aggregates per-player match stats from the already-built event rows (kills,
damages, rounds). Centralizing this keeps the v2 ADR/KAST/utility conventions
in one auditable place.

Damage / ADR contract (cs2-demo-format AGENTS.md):
  healthDamage     = min(healthDamageRaw, victimHealthBefore)   # capped effective
  damageHealth     = sum of capped effective damage
  adr              = damageHealth / rounds
Utility damage uses the same capped-effective basis. self / team / world deaths
are counted separately per the contract.
"""

from __future__ import annotations


def build_player_stats(
    players: list[dict],
    rounds: list[dict],
    kills: list[dict],
    damages: list[dict],
) -> list[dict]:
    """Aggregate player-stats.json rows from built event rows.

    TODO:
      - kills / deaths / assists (incl. flash-assist), headshots
      - damageHealth (capped) + adr = damageHealth / len(rounds)
      - KAST: per-round contributed (kill/assist/survived/traded)
      - utility damage (capped), self/team/world deaths excluded from K/D as specified
    Derive everything from the canonical rows so playerStats can't disagree with
    the per-event files.
    """
    raise NotImplementedError("stats.build_player_stats")
