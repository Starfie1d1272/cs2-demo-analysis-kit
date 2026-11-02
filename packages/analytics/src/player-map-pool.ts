import { buildSeasonCohortFromRows } from "@cs2dak/cohort";
import { supportedMapNameSchema } from "@cs2dak/tactics";
import { buildAllPlayerSeasonProfiles } from "./player.js";
import { playerMapPoolRowSchema, type PlayerMapPoolRow, type PlayerMapRoleProfile, type SupportedMapName } from "@cs2dak/tactics";


export interface PlayerMapPerformanceInput {
  mapName: SupportedMapName; matchCount: number; roundCount: number; wins: number; losses: number;
  rr: number | null; adr: number | null; kast: number | null; openingKills: number; openingDeaths: number; mainWeapon: string | null;
}

export function buildPlayerMapPool(performance: PlayerMapPerformanceInput[], profile: PlayerMapRoleProfile | null): PlayerMapPoolRow[] {
  return performance.map((row) => {
    const roleRows = profile?.perMapEvidence.filter((evidence) => evidence.mapName === row.mapName) ?? [];
    const side = (value: "t" | "ct") => roleRows.find((evidence) => evidence.side === value);
    const label = (value: "t" | "ct") => {
      const evidence = side(value); const group = evidence?.positionGroups[0];
      if (!group) return null;
      return profile?.positionGroupDisplay.find((display) => display.mapName === row.mapName && display.side === value && display.positionGroupId === group.positionGroupId)?.displayName ?? "未映射位置";
    };
    const qualityWeight = roleRows.reduce((sum, evidence) => sum + evidence.sample.eligibleSeconds, 0);
    const weighted = (pick: (evidence: (typeof roleRows)[number]) => number) => qualityWeight === 0 ? 0 : roleRows.reduce((sum, evidence) => sum + pick(evidence) * evidence.sample.eligibleSeconds, 0) / qualityWeight;
    return playerMapPoolRowSchema.parse({
      ...row, winRate: row.matchCount ? row.wins / row.matchCount : null,
      globalWeaponDuty: profile?.weaponDuty ?? null,
      mapSideAwpUsage: roleRows.map((evidence) => ({ side: evidence.side, duty: evidence.awp.duty, qualifiedRounds: evidence.awp.qualifiedLongGunRounds, activeSeconds: evidence.awp.activeSeconds })),
      tPositionGroup: label("t"), ctPositionGroup: label("ct"), tResponsibility: side("t")?.responsibility ?? "unknown", ctResponsibility: side("ct")?.responsibility ?? "unknown",
      roleMatchCount: new Set(roleRows.filter(evidence => evidence.sample.eligibleRounds > 0).flatMap(evidence => evidence.matchIds)).size,
      sampleQuality: weighted((evidence) => evidence.sample.dataQuality), confidence: weighted((evidence) => evidence.confidence),
      evidence: roleRows.flatMap((evidence) => evidence.representativeRounds.map((ref) => ({ ...ref, reason: `${row.mapName} 地图池代表回合`, role: "example" as const }))).slice(0, 6),
    });
  }).sort((a, b) => b.matchCount - a.matchCount || a.mapName.localeCompare(b.mapName));
}

export interface MapPoolMatchSummary { matchId: string; mapName: string; teamAScore: number; teamBScore: number }
export function buildPlayerMapPerformance(input: {
  playerKey: string; identityMap: import("@cs2dak/cohort").PlayerIdentityMap;
  matches: readonly MapPoolMatchSummary[]; cohortRows: readonly import("@cs2dak/cohort").SeasonCohortFactRow[];
  weaponRows: readonly import("./player-weapon-stats.js").PlayerWeaponCountRow[];
}): { rows: PlayerMapPerformanceInput[]; unsupportedMapNames: string[] } {
  const matchById = new Map(input.matches.map(match => [match.matchId, match]));
  const isPlayer = (id: string) => {
    const mapped = input.identityMap[id];
    return (mapped == null ? `steam:${id}` : typeof mapped === "string" ? mapped : mapped.playerKey) === input.playerKey;
  };
  const grouped = new Map<string, import("@cs2dak/cohort").SeasonCohortFactRow[]>();
  for (const row of input.cohortRows.filter(row => isPlayer(row.steamId64))) {
    const map = matchById.get(row.matchId)?.mapName;
    if (map) grouped.set(map, [...(grouped.get(map) ?? []), row]);
  }
  const rows: PlayerMapPerformanceInput[] = [], unsupportedMapNames: string[] = [];
  for (const [mapName, cohortRows] of grouped) {
    const parsed = supportedMapNameSchema.safeParse(mapName);
    if (!parsed.success) { unsupportedMapNames.push(mapName); continue; }
    const matchIds = [...new Set(cohortRows.map(row => row.matchId))];
    const bundle = buildSeasonCohortFromRows(cohortRows, { identityMap: input.identityMap, matchCount: matchIds.length });
    const profile = buildAllPlayerSeasonProfiles(bundle).find(row => row.playerKey === input.playerKey);
    const indicators = bundle.players.find(row => row.playerKey === input.playerKey)?.indicators;
    let wins = 0, losses = 0;
    for (const id of matchIds) {
      const match = matchById.get(id), row = cohortRows.find(item => item.matchId === id);
      if (!match || !row) continue;
      const difference = row.teamKey === "teamA" ? match.teamAScore - match.teamBScore : match.teamBScore - match.teamAScore;
      if (difference > 0) wins++; else if (difference < 0) losses++;
    }
    const weapons = new Map<string, number>();
    for (const row of input.weaponRows) if (isPlayer(row.steamId64) && matchIds.includes(row.matchId)) weapons.set(row.weapon, (weapons.get(row.weapon) ?? 0) + row.kills);
    rows.push({ mapName: parsed.data, matchCount: matchIds.length, roundCount: indicators?.totalRounds ?? 0, wins, losses,
      rr: profile?.rating.rivalhubRR ?? null, adr: indicators?.adr ?? null, kast: indicators?.kast ?? null,
      openingKills: indicators?.firstKillCount ?? 0, openingDeaths: indicators?.firstDeathCount ?? 0,
      mainWeapon: [...weapons].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null });
  }
  return { rows, unsupportedMapNames: unsupportedMapNames.sort() };
}
