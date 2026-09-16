import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DemoPackage, PackageKill } from "@cs2dak/contract";
import { aggregatePlayerRoundPerformanceFacts, buildPlayerRoundPerformanceFacts, loadDemoPackageFromZip } from "../../../../packages/core/src/index";
import { buildRivalHubDemoEvidenceV1, fixtureIdentity, fixtureTarget, matchRivalHubParticipants, matchRivalHubParticipantsForReview, normalizeRivalHubDemoPackage, resolveRivalHubParticipants, resolveRivalHubParticipantsFromEventRoster, resolveRivalHubParticipantsForReview, selectRivalHubMap, type RivalHubEvidenceTarget, type RivalHubTeamOrientation } from "./rivalhub-evidence";
import { matchRivalHubMap, type RivalHubMatchCandidate } from "./rivalhub-match";
import type { RivalHubRemoteMap, RivalHubRemotePlayer, RivalHubRemoteTeam } from "./rivalhub-contract";

const target: RivalHubEvidenceTarget = {
  seasonId: "00000000-0000-4000-8000-000000000001",
  stageKey: "swiss",
  matchId: "00000000-0000-4000-8000-000000000002",
  matchMapId: "00000000-0000-4000-8000-000000000003",
  mapOrder: 1,
  entryAId: "00000000-0000-4000-8000-000000000004",
  entryBId: "00000000-0000-4000-8000-000000000005",
  expectedMapName: "de_ancient",
  evidenceRevision: "revision-1",
};

function packageFor(ids: string[]): DemoPackage {
  return {
    match: { mapName: "de_ancient", tickrate: 64, teamA: { name: "Alpha", score: 13 }, teamB: { name: "Beta", score: 9 } },
    players: ids.map((steamId64, index) => ({ steamId64, name: `Player ${index}`, teamKey: index < 5 ? "teamA" : "teamB" })),
  } as unknown as DemoPackage;
}

function lineup(ids: string[], orientation: RivalHubTeamOrientation = "direct"): RivalHubRemotePlayer[] {
  return ids.map((steamId64, index) => ({
    steamId64,
    name: `Canonical ${index}`,
    userId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    eventRosterMemberId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    isStarter: true,
    entryId: orientation === "direct"
      ? (index < 5 ? target.entryAId : target.entryBId)
      : (index < 5 ? target.entryBId : target.entryAId),
  }));
}

function eventRosterTeams(ids: string[], orientation: RivalHubTeamOrientation = "direct"): RivalHubRemoteTeam[] {
  return ["teamA", "teamB"].map((teamKey, teamIndex) => ({
    key: `00000000-0000-4000-8000-${String(teamIndex + 10).padStart(12, "0")}`,
    name: `Event Team ${teamIndex}`,
    players: ids.slice(teamIndex * 5, teamIndex * 5 + 5).map((steamId64, index) => ({
      steamId64,
      name: `Event Player ${teamIndex * 5 + index}`,
      userId: `10000000-0000-4000-8000-${String(teamIndex * 5 + index + 1).padStart(12, "0")}`,
      eventRosterMemberId: `20000000-0000-4000-8000-${String(teamIndex * 5 + index + 1).padStart(12, "0")}`,
      isStarter: false,
      entryId: orientation === "direct"
        ? (teamKey === "teamA" ? target.entryAId : target.entryBId)
        : (teamKey === "teamA" ? target.entryBId : target.entryAId),
    })),
  }));
}

function remoteMap(id: string, scoreA: number | null = 13, scoreB: number | null = 9): RivalHubRemoteMap {
  return {
    id,
    order: 1,
    mapName: "de_ancient",
    scoreA,
    scoreB,
    completedAt: "2026-09-13T00:00:00.000Z",
    evidenceRevision: "revision-1",
    target: { ...target, matchMapId: id, stageRunId: null },
    lineup: [],
    demoStatus: "finished_pending_demo",
    demoIssues: [],
    importId: null,
    demoSha256: null,
  };
}

let stableFixture: DemoPackage;
let evidenceFixture: DemoPackage;

beforeAll(async () => {
  const bytes = await readFile(resolve(process.cwd(), "fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip"));
  stableFixture = await loadDemoPackageFromZip(bytes);
  evidenceFixture = await loadDemoPackageFromZip(bytes, { profile: "evidence" });
});

function evidenceKill(overrides: Partial<PackageKill>): PackageKill {
  return {
    roundNumber: 1,
    tick: 100,
    killerIndex: null,
    victimIndex: 0,
    weapon: "ak47",
    killerActiveWeapon: "ak47",
    victimActiveWeapon: "ak47",
    headshot: false,
    flashAssist: false,
    tradeKill: false,
    tradeDeath: false,
    throughSmoke: false,
    noScope: false,
    penetratedObjects: 0,
    assisterIndex: null,
    flashAssisterIndex: null,
    killerPosition: { x: 100, y: 100, z: 0 },
    victimPosition: { x: 200, y: 200, z: 0 },
    ...overrides,
  } as PackageKill;
}

function evidencePackageWithTeamkill(): { pkg: DemoPackage; identities: Map<string, ReturnType<typeof fixtureIdentity>> } {
  const ids = Array.from({ length: 4 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
  const target = fixtureTarget();
  const pkg = {
    manifest: {
      ...stableFixture.manifest,
      demo: { ...stableFixture.manifest.demo, hash: "b".repeat(64), sourceFileName: "teamkill.dem" },
      mapName: "de_ancient",
    },
    match: {
      mapName: "de_ancient",
      tickrate: 64,
      durationSeconds: 16,
      serverName: null,
      source: "test",
      teamA: { teamKey: "teamA", name: "Alpha", score: 1 },
      teamB: { teamKey: "teamB", name: "Beta", score: 0 },
    },
    players: ids.map((steamId64, index) => ({ steamId64, name: `Player ${index}`, teamKey: index < 2 ? "teamA" : "teamB" })),
    rounds: [{
      roundNumber: 1,
      startTick: 1,
      freezeEndTick: 10,
      endTick: 200,
      teamASide: "t",
      teamBSide: "ct",
      teamAScoreBefore: 0,
      teamBScoreBefore: 0,
      teamAEconomy: "full",
      teamBEconomy: "full",
      winnerTeamKey: "teamA",
      winnerSide: "t",
      endReason: "t_win",
    }],
    kills: [
      evidenceKill({ tick: 100, killerIndex: 0, victimIndex: 2, headshot: true }),
      evidenceKill({ tick: 110, killerIndex: 0, victimIndex: 1, headshot: true, tradeKill: true, noScope: true, penetratedObjects: 1 }),
    ],
    playerEconomies: [],
    damages: [],
    blinds: [],
    bombs: [],
    grenades: [],
    clutches: [],
    playerStats: [],
  } as unknown as DemoPackage;
  const facts = buildPlayerRoundPerformanceFacts(pkg);
  const summaries = aggregatePlayerRoundPerformanceFacts(facts);
  const statsTemplate = stableFixture.playerStats[0]!;
  pkg.playerStats = pkg.players.map((player, playerIndex) => {
    const summary = summaries.get(player.steamId64)!;
    const clutch = (count: 1 | 2 | 3 | 4 | 5) => summary.clutch.byOpponentCount[String(count) as "1" | "2" | "3" | "4" | "5"];
    return {
      ...statsTemplate,
      playerIndex,
      rounds: summary.rounds,
      kills: summary.kills,
      deaths: summary.deaths,
      assists: summary.assists,
      damageHealth: summary.damage,
      adr: summary.rounds > 0 ? summary.damage / summary.rounds : 0,
      utilityDamage: summary.utility.utilityDamage,
      averageUtilityDamagePerRound: summary.rounds > 0 ? summary.utility.utilityDamage / summary.rounds : 0,
      headshotCount: summary.headshots,
      firstKillCount: summary.firstKills,
      firstDeathCount: summary.firstDeaths,
      tradeKillCount: summary.tradeKills,
      tradeDeathCount: summary.tradedDeaths,
      kast: summary.rounds > 0 ? (summary.kastRounds / summary.rounds) * 100 : 0,
      oneKillCount: summary.oneKillRounds,
      twoKillCount: summary.twoKillRounds,
      threeKillCount: summary.threeKillRounds,
      fourKillCount: summary.fourKillRounds,
      fiveKillCount: summary.fiveKillRounds,
      vsOneCount: clutch(1).attempts,
      vsOneWonCount: clutch(1).wins,
      vsOneLostCount: clutch(1).attempts - clutch(1).wins,
      vsTwoCount: clutch(2).attempts,
      vsTwoWonCount: clutch(2).wins,
      vsTwoLostCount: clutch(2).attempts - clutch(2).wins,
      vsThreeCount: clutch(3).attempts,
      vsThreeWonCount: clutch(3).wins,
      vsThreeLostCount: clutch(3).attempts - clutch(3).wins,
      vsFourCount: clutch(4).attempts,
      vsFourWonCount: clutch(4).wins,
      vsFourLostCount: clutch(4).attempts - clutch(4).wins,
      vsFiveCount: clutch(5).attempts,
      vsFiveWonCount: clutch(5).wins,
      vsFiveLostCount: clutch(5).attempts - clutch(5).wins,
      bombPlantCount: summary.objective.plants,
      bombDefuseCount: summary.objective.defuses,
      wallbangKillCount: summary.weapons.reduce((sum, row) => sum + row.wallbangKills, 0),
      noScopeKillCount: summary.weapons.reduce((sum, row) => sum + row.noScopeKills, 0),
      kastRounds: summary.kastRounds,
      flashAssistCount: summary.utility.flashAssists,
      enemyFlashDurationSeconds: summary.utility.enemyBlindSeconds,
      teamFlashDurationSeconds: summary.utility.teamBlindSeconds,
      combatDeathCount: summary.combatDeaths,
      bombDeathCount: summary.bombDeaths,
    } as DemoPackage["playerStats"][number];
  });
  pkg.playerStats[0] = {
    ...pkg.playerStats[0]!,
    kills: pkg.playerStats[0]!.kills + 1,
    headshotCount: pkg.playerStats[0]!.headshotCount + 1,
    tradeKillCount: pkg.playerStats[0]!.tradeKillCount + 1,
    oneKillCount: 0,
    twoKillCount: 1,
    wallbangKillCount: pkg.playerStats[0]!.wallbangKillCount + 1,
    noScopeKillCount: pkg.playerStats[0]!.noScopeKillCount + 1,
  };
  return {
    pkg,
    identities: new Map(pkg.players.map((player, index) => [player.steamId64, fixtureIdentity(player, index, target)])),
  };
}

describe("RivalHub online Demo matching", () => {
  it("keeps published tournament semantic facts exact after the owner migration", () => {
    const target = fixtureTarget();
    const identities = new Map(stableFixture.players.map((player, index) => [player.steamId64, fixtureIdentity(player, index, target)]));
    const evidence = buildRivalHubDemoEvidenceV1(stableFixture, target, identities) as {
      contract: { semanticProfile: string; analysisVersion: string };
      semanticFacts: {
        economyMatrix: Array<{ lowEconomy: string; highEconomy: string; rounds: number; lowEconomyWins: number }>;
        teamConversions: Array<{
          teamKey: string;
          pistol: { opportunities: number; wins: number };
          round2: { conversion: { opportunities: number; wins: number }; break: { opportunities: number; wins: number } };
          ecoSemiUpset: { opportunities: number; wins: number };
          manAdvantage: Array<{ advantage: string; opportunities: number; wins: number }>;
        }>;
      };
    };

    expect(evidence.contract).toEqual({ contractVersion: "rivalhub-demo-evidence/1", semanticProfile: "dak-stable/3", analysisVersion: "cs2-demo-analysis-kit/1.0.3" });
    expect(evidence.semanticFacts.economyMatrix).toEqual([
      { lowEconomy: "full", highEconomy: "full", rounds: 10, lowEconomyWins: 6 },
      { lowEconomy: "force", highEconomy: "full", rounds: 4, lowEconomyWins: 4 },
      { lowEconomy: "eco", highEconomy: "full", rounds: 3, lowEconomyWins: 0 },
      { lowEconomy: "semi", highEconomy: "full", rounds: 3, lowEconomyWins: 1 },
      { lowEconomy: "force", highEconomy: "force", rounds: 1, lowEconomyWins: 0 },
    ]);
    expect(evidence.semanticFacts.teamConversions).toEqual([
      {
        teamKey: "teamA",
        pistol: { opportunities: 2, wins: 2 },
        round2: { conversion: { opportunities: 2, wins: 1 }, break: { opportunities: 0, wins: 0 } },
        ecoSemiUpset: { opportunities: 3, wins: 1 },
        manAdvantage: [
          { advantage: "5v4", opportunities: 17, wins: 12 },
          { advantage: "4v5", opportunities: 6, wins: 1 },
          { advantage: "5v3", opportunities: 4, wins: 3 },
          { advantage: "3v5", opportunities: 5, wins: 1 },
        ],
      },
      {
        teamKey: "teamB",
        pistol: { opportunities: 2, wins: 0 },
        round2: { conversion: { opportunities: 0, wins: 0 }, break: { opportunities: 2, wins: 1 } },
        ecoSemiUpset: { opportunities: 3, wins: 0 },
        manAdvantage: [
          { advantage: "5v4", opportunities: 6, wins: 5 },
          { advantage: "4v5", opportunities: 17, wins: 5 },
          { advantage: "5v3", opportunities: 5, wins: 4 },
          { advantage: "3v5", opportunities: 4, wins: 1 },
        ],
      },
    ]);
  });

  it("keeps Evidence V1 output byte-for-byte equivalent while omitting optional streams", () => {
    const target = fixtureTarget();
    const identities = new Map(stableFixture.players.map((player, index) => [player.steamId64, fixtureIdentity(player, index, target)]));
    const fullEvidence = buildRivalHubDemoEvidenceV1(stableFixture, target, identities);
    const selectiveEvidence = buildRivalHubDemoEvidenceV1(evidenceFixture, target, identities);

    expect(evidenceFixture.replay).toBeUndefined();
    expect(evidenceFixture.shots).toBeUndefined();
    expect(evidenceFixture.duels).toBeUndefined();
    expect(JSON.stringify(selectiveEvidence)).toBe(JSON.stringify(fullEvidence));
  });

  it("keeps matcher output unchanged with the evidence-oriented package", () => {
    const candidate: RivalHubMatchCandidate = {
      series: {
        id: "series-matcher",
        stageKey: "stage",
        teamAName: "Renamed A",
        teamBName: "Renamed B",
        completedAt: "2026-09-13T00:00:00.000Z",
        status: "finished",
      },
      map: remoteMap("matcher", stableFixture.match.teamA.score, stableFixture.match.teamB.score),
    };

    expect(matchRivalHubMap(evidenceFixture, [candidate])).toEqual(matchRivalHubMap(stableFixture, [candidate]));
  });

  it("projects every whole-map player summary from Core canonical performance facts", () => {
    const target = fixtureTarget();
    const identities = new Map(stableFixture.players.map((player, index) => [player.steamId64, fixtureIdentity(player, index, target)]));
    const evidence = buildRivalHubDemoEvidenceV1(stableFixture, target, identities) as {
      summaries: { playerMaps: Array<Record<string, unknown>> };
    };

    const performanceBySteamId = aggregatePlayerRoundPerformanceFacts(buildPlayerRoundPerformanceFacts(stableFixture));
    expect(evidence.summaries.playerMaps).toEqual(stableFixture.players.map((player) => {
      const summary = performanceBySteamId.get(player.steamId64)!;
      const identity = identities.get(player.steamId64)!;
      return {
        steamId64: identity.steamId64,
        teamKey: player.teamKey,
        rounds: summary.rounds,
        kills: summary.kills,
        deaths: summary.deaths,
        assists: summary.assists,
        damage: summary.damage,
        kastRounds: summary.kastRounds,
        headshots: summary.headshots,
        firstKills: summary.firstKills,
        firstDeaths: summary.firstDeaths,
        tradeKills: summary.tradeKills,
        twoKillRounds: summary.twoKillRounds,
        threeKillRounds: summary.threeKillRounds,
        fourKillRounds: summary.fourKillRounds,
        fiveKillRounds: summary.fiveKillRounds,
        clutchAttempts: summary.clutch.attempts,
        clutchWins: summary.clutch.wins,
      };
    }));
  });

  it("keeps teamkills out of Evidence semantic summaries while retaining the raw kill event", () => {
    const target = fixtureTarget();
    const { pkg, identities } = evidencePackageWithTeamkill();
    const evidence = buildRivalHubDemoEvidenceV1(pkg, target, identities) as {
      sourceFacts: { kills: Array<{ killerSteamId64: string | null; victimSteamId64: string | null; weapon: string; headshot: boolean }> };
      semanticFacts: { playerRounds: Array<{ steamId64: string; kills: number; headshots: number; tradeKills: number }> };
      summaries: { playerMaps: Array<{ steamId64: string; kills: number; headshots: number; twoKillRounds: number; threeKillRounds: number; fourKillRounds: number; fiveKillRounds: number }> };
    };

    const killerSteamId64 = pkg.players[0]!.steamId64;
    const killerMap = evidence.summaries.playerMaps.find((row) => row.steamId64 === killerSteamId64)!;
    const killerRound = evidence.semanticFacts.playerRounds.find((row) => row.steamId64 === killerSteamId64)!;
    const rawTeamkill = evidence.sourceFacts.kills.find((row) => row.victimSteamId64 === pkg.players[1]!.steamId64)!;

    expect(killerMap).toMatchObject({ kills: 1, headshots: 1, twoKillRounds: 0, threeKillRounds: 0, fourKillRounds: 0, fiveKillRounds: 0 });
    expect(killerRound).toMatchObject({ kills: 1, headshots: 1, tradeKills: 0 });
    expect(rawTeamkill).toMatchObject({ killerSteamId64: killerSteamId64, victimSteamId64: pkg.players[1]!.steamId64, headshot: true });
    expect(evidence.sourceFacts.kills).toHaveLength(2);
  });

  it("fails fast when v3 playerStats is missing, incomplete, or indexed outside players", () => {
    const target = fixtureTarget();
    const identities = new Map(stableFixture.players.map((player, index) => [player.steamId64, fixtureIdentity(player, index, target)]));
    const build = (pkg: DemoPackage) => buildRivalHubDemoEvidenceV1(pkg, target, identities);

    expect(() => build({ ...stableFixture, playerStats: undefined } as unknown as DemoPackage)).toThrow(/playerStats/);
    expect(() => build({ ...stableFixture, playerStats: stableFixture.playerStats.slice(0, -1) })).toThrow(/playerStats/);
    expect(() => build({
      ...stableFixture,
      playerStats: stableFixture.playerStats.map((stats, index) => index === 0 ? { ...stats, playerIndex: 99 } : stats),
    })).toThrow(/playerStats\.playerIndex/);
  });

  it("blocks Evidence when Core parity QA reports semantic drift", () => {
    const target = fixtureTarget();
    const identities = new Map(stableFixture.players.map((player, index) => [player.steamId64, fixtureIdentity(player, index, target)]));
    const statsTruth = stableFixture.playerStats[0]!;
    const mismatched = {
      ...stableFixture,
      playerStats: stableFixture.playerStats.map((stats) => stats.playerIndex === statsTruth.playerIndex
        ? { ...stats, deaths: stats.deaths + 1 }
        : stats),
    };

    expect(() => buildRivalHubDemoEvidenceV1(mismatched, target, identities)).toThrow("Evidence blocked by Core QA: performance.parity_mismatch");
  });

  it("uses the canonical Steam64 lineup and rejects a missing member", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const result = matchRivalHubParticipants(packageFor(ids), target, lineup(ids));
    expect(result.get(ids[0])?.entryId).toBe(target.entryAId);
    expect(result.get(ids[9])?.entryId).toBe(target.entryBId);
    expect(result.get(ids[0])?.nameSnapshot).toBe("Player 0");
    expect(() => matchRivalHubParticipants(packageFor(ids), target, lineup(ids.slice(0, 9).concat("76561198000000099")))).toThrow("Demo 缺少在线名单成员");
  });

  it("accepts reversed Demo team slots and normalizes all canonical A/B fields", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const pkg = packageFor(ids);
    const resolved = resolveRivalHubParticipants(pkg, target, lineup(ids, "reversed"));
    expect(resolved.orientation).toBe("reversed");
    expect(resolved.identities.get(ids[0])?.entryId).toBe(target.entryBId);
    expect(resolved.identities.get(ids[9])?.entryId).toBe(target.entryAId);

    const normalized = normalizeRivalHubDemoPackage({
      ...pkg,
      match: {
        ...pkg.match,
        teamA: { teamKey: "teamA", name: "Demo A", score: 9 },
        teamB: { teamKey: "teamB", name: "Demo B", score: 13 },
      },
      rounds: [{
        roundNumber: 1, startTick: 1, freezeEndTick: 2, endTick: 3,
        teamASide: "t", teamBSide: "ct", teamAScoreBefore: 4, teamBScoreBefore: 7,
        teamAEconomy: "eco", teamBEconomy: "full", winnerTeamKey: "teamA", winnerSide: "t", endReason: "t_win",
      }],
    } as unknown as DemoPackage, resolved.orientation);
    expect(normalized.match.teamA).toMatchObject({ teamKey: "teamA", name: "Demo B", score: 13 });
    expect(normalized.match.teamB).toMatchObject({ teamKey: "teamB", name: "Demo A", score: 9 });
    expect(normalized.players[0]?.teamKey).toBe("teamB");
    expect(normalized.players[5]?.teamKey).toBe("teamA");
    expect(normalized.rounds[0]).toMatchObject({
      teamASide: "ct", teamBSide: "t", teamAScoreBefore: 7, teamBScoreBefore: 4,
      teamAEconomy: "full", teamBEconomy: "eco", winnerTeamKey: "teamB",
    });
  });

  it("resolves participant identity and reversed orientation from EventRoster without MatchRoster", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const resolved = resolveRivalHubParticipantsFromEventRoster(packageFor(ids), target, eventRosterTeams(ids, "reversed"));

    expect(resolved.orientation).toBe("reversed");
    expect(resolved.identities.get(ids[0])).toMatchObject({
      steamId64: ids[0],
      userId: "10000000-0000-4000-8000-000000000001",
      eventRosterMemberId: "20000000-0000-4000-8000-000000000001",
      entryId: target.entryBId,
    });
    expect(resolved.identities.get(ids[9])).toMatchObject({ entryId: target.entryAId });
  });

  it("matches one map by canonical lineup, target and score without requiring display names", () => {
    const pkg = packageFor(Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`));
    const result = selectRivalHubMap(pkg, [
      { series: { teamAName: "Renamed Alpha", teamBName: "Renamed Beta" }, map: { ...remoteMap("00000000-0000-4000-8000-000000000006"), lineup: lineup(pkg.players.map((player) => player.steamId64)) } },
    ]);
    expect(result.map.id).toBe("00000000-0000-4000-8000-000000000006");
  });

  it("uses canonical score evidence after resolving a reversed Demo orientation", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const pkg = {
      ...packageFor(ids),
      match: { mapName: "de_ancient", tickrate: 64, teamA: { name: "Demo A", score: 9 }, teamB: { name: "Demo B", score: 13 } },
    } as DemoPackage;
    const decoy = { ...remoteMap("00000000-0000-4000-8000-000000000006", 12, 10), lineup: lineup(ids, "reversed") };
    const winner = { ...remoteMap("00000000-0000-4000-8000-000000000007", 13, 9), lineup: lineup(ids, "reversed") };
    expect(selectRivalHubMap(pkg, [
      { series: { teamAName: "A", teamBName: "B" }, map: decoy },
      { series: { teamAName: "Renamed A", teamBName: "Renamed B" }, map: winner },
    ]).map.id).toBe(winner.id);
  });

  it("keeps a unique score conflict reviewable instead of dropping it", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const pkg = packageFor(ids);
    const result = selectRivalHubMap(pkg, [
      { series: { teamAName: "Unrelated A", teamBName: "Unrelated B" }, map: { ...remoteMap("00000000-0000-4000-8000-000000000006", 12), lineup: lineup(ids) } },
    ]);
    expect(result.map.id).toBe("00000000-0000-4000-8000-000000000006");
  });

  it("keeps a unique roster conflict reviewable with unresolved resolution", () => {
    const remoteIds = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const demoIds = [...remoteIds.slice(0, 9), "76561198000000099"];
    const pkg = packageFor(demoIds);
    const map = { ...remoteMap("00000000-0000-4000-8000-000000000006"), lineup: lineup(remoteIds) };
    expect(selectRivalHubMap(pkg, [{ series: { teamAName: "A", teamBName: "B" }, map }]).map.id).toBe(map.id);
    const review = matchRivalHubParticipantsForReview(pkg, target, map.lineup);
    expect(review.get("76561198000000099")?.resolution.status).toBe("unresolved");
    expect(review.get(remoteIds[0])?.nameSnapshot).toBe("Player 0");
  });

  it("fails closed as review evidence when no lineup identity can establish orientation", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const unknownLineup = lineup(ids.map((_, index) => `765611980000009${String(index + 1).padStart(2, "0")}`));
    const review = resolveRivalHubParticipantsForReview(packageFor(ids), target, unknownLineup);
    expect(review.orientation).toBeNull();
    expect([...review.identities.values()].every((player) => player.resolution.status === "unresolved")).toBe(true);
  });

  it("rejects a remote entry assignment that conflicts with the Demo observed side", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const badLineup = lineup(ids).map((player, index) => index === 0 ? { ...player, entryId: target.entryBId } : player);
    expect(() => matchRivalHubParticipants(packageFor(ids), target, badLineup)).toThrow("Canonical Entry");
  });
});
