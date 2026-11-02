import type { MatchWorkspaceModel } from "@cs2dak/presentation";

export type QuickRoundFilter = "all" | "opening" | "first-death" | "clutch" | "utility";
type Round = MatchWorkspaceModel["rounds"][number];

export function matchesQuickRound(round: Round, filter: QuickRoundFilter, player: string | null): boolean {
  const fact = player ? round.playerFacts.find(f => f.steamId64 === player) : null;
  switch (filter) {
    case "all": return true;
    case "opening": return player ? !!fact && fact.openingDuel !== "none" : !!round.facets?.firstKillSteamId64;
    case "first-death": return !!player && fact?.openingDuel === "lost";
    case "clutch": return !!round.facets?.clutch && (!player || round.facets.clutch.steamId64 === player);
    case "utility": return !!player && !!round.facets?.utilityThrowerSteamIds?.includes(player);
  }
}

export function quickRoundTick(round: Round, filter: QuickRoundFilter): number | undefined {
  if (filter === "opening" || filter === "first-death") return round.facets?.firstKillTick ?? undefined;
  if (filter === "clutch") return round.facets?.clutch?.tick;
  return undefined;
}
