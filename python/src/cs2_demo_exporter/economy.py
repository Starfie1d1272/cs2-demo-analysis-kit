"""Economy classification + player-economies rows.

economyType is one of: "pistol" | "eco" | "semi" | "force" | "full"
(see cs2-demo-format economyTypeSchema). The classification thresholds are the
single most bikeshed-prone bit of the export, so they live here in isolation
with the algorithm documented next to the code.

player-economies.json rows carry per-round loadout: equipmentValue, armor,
helmet, defuseKit, weapons, grenadeCount, etc. — pulled from tick snapshots at
round freeze-time end.
"""

from __future__ import annotations

from .parser import RawDemo
from .rounds import FormalRounds


def classify_economy(equipment_value: int, is_pistol_round: bool) -> str:
    """Map a team's round-start equipment value to an economyType.

    TODO: port the agreed thresholds (mirror cs2-demo-format's documented
    algorithm / the economy-classification reference). Pistol rounds (1 and 13)
    are always "pistol".
    """
    raise NotImplementedError("economy.classify_economy: port thresholds")


def build_player_economies(raw: RawDemo, rounds: FormalRounds) -> list[dict]:
    """Build player-economies.json rows from freeze-time tick snapshots."""
    raise NotImplementedError("economy.build_player_economies")
