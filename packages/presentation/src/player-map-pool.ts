import { playerMapPoolRowSchema, type PlayerMapPoolRow, type PlayerMapRoleProfile, type SupportedMapName } from "@cs2dak/contract";

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
      sampleQuality: weighted((evidence) => evidence.sample.dataQuality), confidence: weighted((evidence) => evidence.confidence),
      evidence: roleRows.flatMap((evidence) => evidence.representativeRounds.map((ref) => ({ ...ref, reason: `${row.mapName} 地图池代表回合`, role: "example" as const }))).slice(0, 6),
    });
  }).sort((a, b) => b.matchCount - a.matchCount || a.mapName.localeCompare(b.mapName));
}
