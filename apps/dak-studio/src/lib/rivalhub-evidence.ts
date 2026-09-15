import {
  aggregatePlayerRoundPerformanceFacts,
  analyzeDemoPackage,
  buildPlayerRoundPerformanceFacts,
  buildTeamSideWinRates,
  demoSourceAvailability,
  type PlayerPerformanceAggregate,
} from "../../../../packages/core/src/index";
import type { DemoPackage, TeamKey } from "../../../../packages/contract/src/index";
import { buildTournamentInsightsFromFacts, extractTournamentFacts } from "../../../../packages/presentation/src/index";
import type { RivalHubRemoteMap, RivalHubRemotePlayer, RivalHubRemoteTeam } from "./rivalhub-contract";
import { resolveRivalHubEventRoster } from "./rivalhub-match";

export type RivalHubEvidenceTarget = {
  seasonId: string;
  stageKey: string;
  stageRunId?: string;
  matchId: string;
  matchMapId: string;
  mapOrder: number;
  entryAId: string;
  entryBId: string;
  expectedMapName: string;
  evidenceRevision: string;
};

export type RivalHubTeamOrientation = "direct" | "reversed";

export type RivalHubMatchedParticipant = {
  steamId64: string;
  nameSnapshot: string;
  userId: string;
  eventRosterMemberId: string;
  entryId: string;
};

type RivalHubReviewResolution =
  | { status: "matched"; userId: string; eventRosterMemberId: string; entryId: string }
  | { status: "unresolved" }
  | { status: "conflict"; userId?: string; eventRosterMemberId?: string; entryId?: string };

export type RivalHubReviewParticipant = {
  steamId64: string;
  nameSnapshot: string;
  resolution: RivalHubReviewResolution;
};

export type RivalHubParticipantIdentity = RivalHubMatchedParticipant | RivalHubReviewParticipant;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function entryForDemoTeam(target: RivalHubEvidenceTarget, teamKey: TeamKey, orientation: RivalHubTeamOrientation): string {
  if (orientation === "direct") return teamKey === "teamA" ? target.entryAId : target.entryBId;
  return teamKey === "teamA" ? target.entryBId : target.entryAId;
}

function inferTeamOrientation(
  pkg: DemoPackage,
  target: RivalHubEvidenceTarget,
  remoteBySteam: Map<string, RivalHubRemotePlayer>,
): RivalHubTeamOrientation | null {
  let directVotes = 0;
  let reversedVotes = 0;
  for (const player of pkg.players) {
    const remote = remoteBySteam.get(player.steamId64);
    if (!remote) continue;
    if (remote.entryId === entryForDemoTeam(target, player.teamKey, "direct")) directVotes += 1;
    if (remote.entryId === entryForDemoTeam(target, player.teamKey, "reversed")) reversedVotes += 1;
  }
  if (directVotes === 0 && reversedVotes === 0) return null;
  if (directVotes === reversedVotes) return null;
  return directVotes > reversedVotes ? "direct" : "reversed";
}

function remoteLineupBySteam(lineup: RivalHubRemotePlayer[]): {
  remoteBySteam: Map<string, RivalHubRemotePlayer>;
  duplicateSteam: Set<string>;
} {
  const remoteBySteam = new Map<string, RivalHubRemotePlayer>();
  const duplicateSteam = new Set<string>();
  for (const remote of lineup) {
    if (remoteBySteam.has(remote.steamId64)) duplicateSteam.add(remote.steamId64);
    else remoteBySteam.set(remote.steamId64, remote);
  }
  return { remoteBySteam, duplicateSteam };
}

/**
 * 用 remote lineup 的 Steam64 做唯一匹配，并以 RivalHub 返回的 canonical
 * entryId 验证 Demo 的 observed team。Demo 自己的 teamKey 只表达观察方向，
 * 不能反过来决定 canonical Entry 归属。
 */
export function resolveRivalHubParticipants(
  pkg: DemoPackage,
  target: RivalHubEvidenceTarget,
  lineup: RivalHubRemotePlayer[],
): { identities: Map<string, RivalHubMatchedParticipant>; orientation: RivalHubTeamOrientation } {
  if (lineup.length !== 10) throw new Error("在线赛事缺少双方各 5 名可校验首发，暂不能自动提交");
  const packagePlayers = new Map(pkg.players.map((player) => [player.steamId64, player]));
  if (packagePlayers.size !== pkg.players.length) throw new Error("Demo 中存在重复 Steam64，暂不能自动提交");
  if (pkg.players.filter((player) => player.teamKey === "teamA").length !== 5 || pkg.players.filter((player) => player.teamKey === "teamB").length !== 5) {
    throw new Error("Demo 缺少双方各 5 名可校验选手，暂不能自动提交");
  }
  const { remoteBySteam, duplicateSteam } = remoteLineupBySteam(lineup);
  if (duplicateSteam.size > 0) throw new Error("在线名单存在重复 Steam64");
  const orientation = inferTeamOrientation(pkg, target, remoteBySteam);
  if (!orientation) throw new Error("无法从 Canonical Entry 确定 Demo 队伍方向");
  const identities = new Map<string, RivalHubMatchedParticipant>();
  for (const remote of lineup) {
    const player = packagePlayers.get(remote.steamId64);
    if (!player) throw new Error(`Demo 缺少在线名单成员 ${remote.name}`);
    const expectedEntryId = entryForDemoTeam(target, player.teamKey, orientation);
    if (remote.entryId !== expectedEntryId) throw new Error(`Demo 选手 ${remote.name} 的队伍与 Canonical Entry 不一致`);
    identities.set(remote.steamId64, {
      steamId64: remote.steamId64,
      nameSnapshot: player.name,
      userId: remote.userId,
      eventRosterMemberId: remote.eventRosterMemberId,
      entryId: remote.entryId,
    });
  }
  if (identities.size !== packagePlayers.size || [...packagePlayers.keys()].some((id) => !identities.has(id))) {
    throw new Error("Demo 选手集合与在线 Canonical MatchRoster 不一致");
  }
  return { identities, orientation };
}

/**
 * EventRoster 是跨本场稳定的 Steam64 → canonical Entry identity owner。
 * 它同时提供 Demo A/B 与 target entryA/entryB 的方向，以及可复用的
 * userId/eventRosterMemberId；MatchRoster 不能替换这层 identity。
 */
export function resolveRivalHubParticipantsFromEventRoster(
  pkg: DemoPackage,
  target: RivalHubEvidenceTarget,
  eventTeams: RivalHubRemoteTeam[],
): { identities: Map<string, RivalHubParticipantIdentity>; orientation: RivalHubTeamOrientation } {
  const roster = resolveRivalHubEventRoster(pkg, eventTeams);
  if (!roster) throw new Error("EventRoster 无法确定 Demo 两侧 Canonical Entry");
  const orientation: RivalHubTeamOrientation | null = roster.entryAId === target.entryAId && roster.entryBId === target.entryBId
    ? "direct"
    : roster.entryAId === target.entryBId && roster.entryBId === target.entryAId
      ? "reversed"
      : null;
  if (!orientation) throw new Error("EventRoster canonical Entry pair 与目标不一致");

  const identities = new Map<string, RivalHubParticipantIdentity>();
  for (const player of pkg.players) {
    const remote = roster.membersBySteam.get(player.steamId64);
    if (!remote) {
      identities.set(player.steamId64, {
        steamId64: player.steamId64,
        nameSnapshot: player.name,
        resolution: { status: "unresolved" },
      });
      continue;
    }
    const expectedEntryId = entryForDemoTeam(target, player.teamKey, orientation);
    if (roster.duplicateSteam.has(player.steamId64) || remote.entryId !== expectedEntryId) {
      identities.set(player.steamId64, {
        steamId64: player.steamId64,
        nameSnapshot: player.name,
        resolution: { status: "conflict", userId: remote.userId, eventRosterMemberId: remote.eventRosterMemberId, entryId: remote.entryId },
      });
      continue;
    }
    identities.set(player.steamId64, {
      steamId64: player.steamId64,
      nameSnapshot: player.name,
      userId: remote.userId,
      eventRosterMemberId: remote.eventRosterMemberId,
      entryId: remote.entryId,
    });
  }
  return { identities, orientation };
}

export function matchRivalHubParticipants(
  pkg: DemoPackage,
  target: RivalHubEvidenceTarget,
  lineup: RivalHubRemotePlayer[],
): Map<string, RivalHubMatchedParticipant> {
  return resolveRivalHubParticipants(pkg, target, lineup).identities;
}

/**
 * 为唯一目标地图保留可审计的冲突 evidence。它不把不可信选手提升为
 * matched；服务端会据此写入 needs_attention，而不是让批量导入提前丢弃冲突。
 */
export function resolveRivalHubParticipantsForReview(
  pkg: DemoPackage,
  target: RivalHubEvidenceTarget,
  lineup: RivalHubRemotePlayer[],
): { identities: Map<string, RivalHubReviewParticipant>; orientation: RivalHubTeamOrientation | null } {
  const { remoteBySteam, duplicateSteam } = remoteLineupBySteam(lineup);
  const orientation = inferTeamOrientation(pkg, target, remoteBySteam);
  const entries: Array<[string, RivalHubReviewParticipant]> = pkg.players.map((player) => {
    const remote = remoteBySteam.get(player.steamId64);
    if (!remote) {
      return [player.steamId64, {
        steamId64: player.steamId64,
        nameSnapshot: player.name,
        resolution: { status: "unresolved" },
      } satisfies RivalHubReviewParticipant];
    }
    const expectedEntryId = orientation ? entryForDemoTeam(target, player.teamKey, orientation) : null;
    if (duplicateSteam.has(remote.steamId64) || expectedEntryId == null || remote.entryId !== expectedEntryId) {
      return [player.steamId64, {
        steamId64: player.steamId64,
        nameSnapshot: player.name,
        resolution: { status: "conflict", userId: remote.userId, eventRosterMemberId: remote.eventRosterMemberId, entryId: remote.entryId },
      } satisfies RivalHubReviewParticipant];
    }
    return [player.steamId64, {
      steamId64: remote.steamId64,
      nameSnapshot: player.name,
      resolution: { status: "matched", userId: remote.userId, eventRosterMemberId: remote.eventRosterMemberId, entryId: remote.entryId },
    } satisfies RivalHubReviewParticipant];
  });
  return { identities: new Map(entries), orientation };
}

export function matchRivalHubParticipantsForReview(
  pkg: DemoPackage,
  target: RivalHubEvidenceTarget,
  lineup: RivalHubRemotePlayer[],
): Map<string, RivalHubReviewParticipant> {
  return resolveRivalHubParticipantsForReview(pkg, target, lineup).identities;
}

function flipTeamKey(teamKey: TeamKey): TeamKey {
  return teamKey === "teamA" ? "teamB" : "teamA";
}

/** Normalize Demo-owned A/B slots to RivalHub entryA/entryB before deriving
 * every evidence fact. This keeps round, team, summary and conversion fields
 * in one canonical orientation instead of swapping only the final score. */
export function normalizeRivalHubDemoPackage(pkg: DemoPackage, orientation: RivalHubTeamOrientation | null): DemoPackage {
  if (orientation === "direct" || orientation == null) return pkg;
  return {
    ...pkg,
    match: {
      ...pkg.match,
      teamA: { ...pkg.match.teamB, teamKey: "teamA" },
      teamB: { ...pkg.match.teamA, teamKey: "teamB" },
    },
    players: pkg.players.map((player) => ({ ...player, teamKey: flipTeamKey(player.teamKey) })),
    rounds: pkg.rounds.map((round) => ({
      ...round,
      teamASide: round.teamBSide,
      teamBSide: round.teamASide,
      teamAScoreBefore: round.teamBScoreBefore,
      teamBScoreBefore: round.teamAScoreBefore,
      teamAEconomy: round.teamBEconomy,
      teamBEconomy: round.teamAEconomy,
      winnerTeamKey: flipTeamKey(round.winnerTeamKey),
    })),
  };
}

export function selectRivalHubMap(
  pkg: DemoPackage,
  candidates: Array<{ series: { teamAName: string; teamBName: string }; map: RivalHubRemoteMap }>,
): { series: { teamAName: string; teamBName: string }; map: RivalHubRemoteMap } {
  const evidenceTarget = (map: RivalHubRemoteMap): RivalHubEvidenceTarget => {
    const { stageRunId, ...rest } = map.target;
    return stageRunId == null ? rest : { ...rest, stageRunId };
  };
  const targetMatches = candidates.filter(({ map }) => {
    if (normalize(map.mapName) !== normalize(pkg.match.mapName)) return false;
    if (normalize(map.target.expectedMapName) !== normalize(pkg.match.mapName)) return false;
    if (map.target.matchMapId !== map.id || map.target.mapOrder !== map.order) return false;
    return true;
  });
  const lineupMatches = targetMatches.flatMap(({ series, map }) => {
    try {
      // This verifies the canonical Steam64 set and every observed team side.
      const participantMatch = resolveRivalHubParticipants(pkg, evidenceTarget(map), map.lineup ?? []);
      return [{ series, map, orientation: participantMatch.orientation }];
    } catch {
      return [];
    }
  });
  const strongMatches = lineupMatches.filter(({ map, orientation }) => {
    if (map.scoreA != null && map.scoreB != null) {
      const canonicalScoreA = orientation === "direct" ? pkg.match.teamA.score : pkg.match.teamB.score;
      const canonicalScoreB = orientation === "direct" ? pkg.match.teamB.score : pkg.match.teamA.score;
      if (canonicalScoreA == null || canonicalScoreB == null) return false;
      if (map.scoreA !== canonicalScoreA || map.scoreB !== canonicalScoreB) return false;
    }
    return true;
  });
  if (strongMatches.length === 1) return strongMatches[0]!;
  if (strongMatches.length > 1) {
    // Display names are only a weak tie-break after canonical identity, map,
    // target and official score evidence have already matched.
    const namedMatches = strongMatches.filter(({ series, orientation }) => {
      const canonicalTeamAName = orientation === "direct" ? pkg.match.teamA.name : pkg.match.teamB.name;
      const canonicalTeamBName = orientation === "direct" ? pkg.match.teamB.name : pkg.match.teamA.name;
      return (
        normalize(series.teamAName) === normalize(canonicalTeamAName ?? "Team A") &&
        normalize(series.teamBName) === normalize(canonicalTeamBName ?? "Team B")
      );
    });
    if (namedMatches.length === 1) return namedMatches[0]!;
    throw new Error("在线赛事地图匹配不唯一，请选择目标地图");
  }

  // A unique canonical lineup with a conflicting score is still submitted so
  // RivalHub can persist the exact conflict as needs_attention.
  if (lineupMatches.length === 1) return lineupMatches[0]!;
  // If the lineup itself conflicts, a single target map is still reviewable;
  // multiple target maps remain ambiguous and must not be guessed.
  if (targetMatches.length === 1) return targetMatches[0]!;
  throw new Error("在线赛事地图匹配不唯一，请选择目标地图");
}

export function fixtureTarget(): RivalHubEvidenceTarget {
  return {
    seasonId: "10000000-0000-4000-8000-000000000001", stageKey: "fixture-stage",
    stageRunId: "10000000-0000-4000-8000-000000000002", matchId: "10000000-0000-4000-8000-000000000003",
    matchMapId: "10000000-0000-4000-8000-000000000004", mapOrder: 1,
    entryAId: "10000000-0000-4000-8000-000000000005", entryBId: "10000000-0000-4000-8000-000000000006",
    expectedMapName: "de_ancient", evidenceRevision: "fixture-revision-1",
  };
}

export function fixtureIdentity(player: DemoPackage["players"][number], index: number, target: RivalHubEvidenceTarget): RivalHubMatchedParticipant {
  const suffix = String(index + 1).padStart(2, "0");
  return {
    steamId64: `765611980000000${suffix}`,
    nameSnapshot: `Fixture Player ${suffix}`,
    userId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    eventRosterMemberId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    entryId: player.teamKey === "teamA" ? target.entryAId : target.entryBId,
  };
}

function mappedSteam(pkg: DemoPackage, identities: Map<string, RivalHubParticipantIdentity>, playerIndex: number | null): string | null {
  if (playerIndex === null) return null;
  const player = pkg.players[playerIndex];
  return player ? identities.get(player.steamId64)?.steamId64 ?? null : null;
}

function teamConversions(pkg: DemoPackage, performanceFacts: ReturnType<typeof buildPlayerRoundPerformanceFacts>) {
  const insights = buildTournamentInsightsFromFacts([extractTournamentFacts({ matchId: "fixture", pkg }, performanceFacts)]);
  const names = { teamA: pkg.match.teamA.name ?? "Team A", teamB: pkg.match.teamB.name ?? "Team B" };
  return {
    economyMatrix: insights.economyMatrix.map((row) => ({ lowEconomy: row.lowEconomy, highEconomy: row.highEconomy, rounds: row.rounds, lowEconomyWins: row.lowEconomyWins })),
    teams: (["teamA", "teamB"] as const).map((teamKey) => {
      const summary = insights.teamEconomySummaries.find((row) => row.teamName === names[teamKey])!;
      const states = new Map(summary.manAdvantage.states.map((row) => [`${row.advantageAlive}v${row.disadvantageAlive}`, row]));
      const state = (label: "5v4" | "5v3") => states.get(label);
      return {
        teamKey,
        pistol: { opportunities: summary.pistol.rounds, wins: summary.pistol.wins },
        round2: {
          conversion: { opportunities: summary.round2.conversionRounds, wins: summary.round2.conversionWins },
          break: { opportunities: summary.round2.breakRounds, wins: summary.round2.breakWins },
        },
        ecoSemiUpset: { opportunities: summary.smallBuyUpset.opportunities, wins: summary.smallBuyUpset.wins },
        manAdvantage: [
          { advantage: "5v4", opportunities: state("5v4")?.advantageOpportunities ?? 0, wins: state("5v4")?.advantageWins ?? 0 },
          { advantage: "4v5", opportunities: state("5v4")?.disadvantageOpportunities ?? 0, wins: state("5v4")?.disadvantageWins ?? 0 },
          { advantage: "5v3", opportunities: state("5v3")?.advantageOpportunities ?? 0, wins: state("5v3")?.advantageWins ?? 0 },
          { advantage: "3v5", opportunities: state("5v3")?.disadvantageOpportunities ?? 0, wins: state("5v3")?.disadvantageWins ?? 0 },
        ],
      };
    }),
  };
}

function projectPlayerMaps(
  pkg: DemoPackage,
  identities: Map<string, RivalHubParticipantIdentity>,
  performanceBySteamId: Map<string, PlayerPerformanceAggregate>,
): Array<Record<string, unknown>> {
  const stats = pkg.playerStats;
  if (!Array.isArray(stats) || stats.length !== pkg.players.length) {
    throw new Error(`Evidence 需要完整的 v3 playerStats（期望 ${pkg.players.length} 行，实际 ${Array.isArray(stats) ? stats.length : "缺失"} 行）`);
  }

  const statsByPlayerIndex = new Map<number, (typeof stats)[number]>();
  for (const row of stats) {
    if (!row || !Number.isInteger(row.playerIndex) || row.playerIndex < 0 || row.playerIndex >= pkg.players.length) {
      throw new Error("Evidence 的 v3 playerStats.playerIndex 无效");
    }
    if (statsByPlayerIndex.has(row.playerIndex)) {
      throw new Error(`Evidence 的 v3 playerStats.playerIndex 重复：${row.playerIndex}`);
    }
    statsByPlayerIndex.set(row.playerIndex, row);
  }
  if (statsByPlayerIndex.size !== pkg.players.length) {
    throw new Error("Evidence 的 v3 playerStats 未覆盖全部 Demo 选手");
  }
  return pkg.players.map((player, playerIndex) => {
    const playerStats = statsByPlayerIndex.get(playerIndex);
    if (!playerStats) throw new Error(`Evidence 缺少 playerIndex=${playerIndex} 的 v3 playerStats`);
    const identity = identities.get(player.steamId64);
    if (!identity) throw new Error(`Evidence 缺少选手 ${player.steamId64} 的 canonical identity`);
    const summary = performanceBySteamId.get(player.steamId64);
    if (!summary) throw new Error(`Evidence 缺少选手 ${player.steamId64} 的 Core performance summary`);
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
  });
}

export function buildRivalHubDemoEvidenceV1(
  inputPkg: DemoPackage,
  target: RivalHubEvidenceTarget,
  identities: Map<string, RivalHubParticipantIdentity>,
  orientation: RivalHubTeamOrientation | null = "direct",
): Record<string, unknown> {
  const pkg = normalizeRivalHubDemoPackage(inputPkg, orientation);
  const demoSha256 = pkg.manifest.demo?.hash;
  if (!demoSha256 || !/^[a-f0-9]{64}$/.test(demoSha256)) {
    throw new Error("DemoPackage manifest.demo.hash 必须提供有效的 64 位小写 SHA-256");
  }
  const performanceFacts = buildPlayerRoundPerformanceFacts(pkg);
  const performanceBySteamId = aggregatePlayerRoundPerformanceFacts(performanceFacts);
  const playerMaps = projectPlayerMaps(pkg, identities, performanceBySteamId);
  const analysis = analyzeDemoPackage(pkg, performanceFacts);
  const qaErrors = analysis.qa.issues.filter((issue) => issue.severity === "error");
  if (qaErrors.length > 0) {
    throw new Error(`Evidence blocked by Core QA: ${qaErrors.map((issue) => issue.code).join(", ")}`);
  }
  const sideWinRates = buildTeamSideWinRates(pkg);
  const roundSeq = new Map(pkg.rounds.map((round, index) => [round.roundNumber, index + 1]));
  const playerRounds = performanceFacts.playerRounds.map((fact) => {
    const identity = identities.get(fact.steamId64);
    if (!identity) throw new Error(`Evidence 缺少选手 ${fact.steamId64} 的 canonical identity`);
    const { grenadesThrown: _grenadesThrown, utilityDamage: _utilityDamage, ...utility } = fact.utility;
    return {
      roundSeq: roundSeq.get(fact.roundNumber)!, steamId64: identity.steamId64, teamKey: fact.teamKey, side: fact.side,
      survived: fact.survived, kills: fact.kills, deaths: fact.deaths, assists: fact.assists, damage: fact.damage,
      headshots: fact.headshots,
      tradeKills: fact.tradeKills, tradedDeaths: fact.tradedDeaths, openingDuel: fact.openingDuel, kast: fact.kast,
      economyType: fact.economyType, equipmentValue: fact.equipmentValue,
      clutch: fact.clutch ? { opponentCount: fact.clutch.opponentCount, won: fact.clutch.won } : null,
      utility,
    };
  });
  const weapons = pkg.players.flatMap((player) => {
    const identity = identities.get(player.steamId64);
    const summary = performanceBySteamId.get(player.steamId64);
    if (!identity || !summary) return [];
    return summary.weapons.map((weapon) => ({
      steamId64: identity.steamId64,
      weapon: weapon.weapon,
      kills: weapon.kills,
      headshotKills: weapon.headshotKills,
    }));
  });
  const conversions = teamConversions(pkg, performanceFacts);
  return {
    contract: { contractVersion: "rivalhub-demo-evidence/1", semanticProfile: "dak-stable/1", analysisVersion: analysis.provenance.analysisVersion },
    target,
    source: {
      demoSha256, mapName: pkg.match.mapName, tickRateHz: pkg.match.tickrate, sourceSchemaVersion: pkg.manifest.schemaVersion,
      exporterVersion: `${pkg.manifest.exporter.name}/${pkg.manifest.exporter.version}`, parserVersion: `${pkg.manifest.parser.name}/${pkg.manifest.parser.version}`,
      producerVersion: "cs2dak-rivalhub-evidence/0.1.0", generatedAt: new Date(pkg.manifest.exportedAt).toISOString(),
    },
    quality: { qa: { ok: analysis.qa.ok, ...analysis.qa.summary }, capabilities: demoSourceAvailability(pkg) },
    participants: pkg.players.map((player) => {
      const identity = identities.get(player.steamId64)!;
      const resolution = "resolution" in identity
        ? identity.resolution
        : { status: "matched" as const, userId: identity.userId, eventRosterMemberId: identity.eventRosterMemberId, entryId: identity.entryId };
      return { steamId64: identity.steamId64, nameSnapshot: identity.nameSnapshot, observedTeamKey: player.teamKey, resolution };
    }),
    sourceFacts: {
      rounds: pkg.rounds.map((row, index) => ({ roundSeq: index + 1, sourceRoundNumber: row.roundNumber, phase: row.roundNumber <= 24 ? "regulation" : "overtime", startTick: row.startTick, freezeEndTick: row.freezeEndTick, endTick: row.endTick, teamASide: row.teamASide, teamBSide: row.teamBSide, teamAScoreBefore: row.teamAScoreBefore, teamBScoreBefore: row.teamBScoreBefore, teamAEconomy: row.teamAEconomy, teamBEconomy: row.teamBEconomy, winnerTeamKey: row.winnerTeamKey, winnerSide: row.winnerSide, endReason: row.endReason })),
      kills: pkg.kills.map((row) => ({ roundSeq: roundSeq.get(row.roundNumber)!, tick: row.tick, killerSteamId64: mappedSteam(pkg, identities, row.killerIndex), victimSteamId64: mappedSteam(pkg, identities, row.victimIndex)!, weapon: row.weapon, headshot: row.headshot })),
      objectives: pkg.bombs.map((row) => ({ roundSeq: roundSeq.get(row.roundNumber)!, tick: row.tick, type: row.type, site: row.site, actorSteamId64: mappedSteam(pkg, identities, row.actorIndex) })),
    },
    semanticFacts: { playerRounds, economyMatrix: conversions.economyMatrix, teamConversions: conversions.teams },
    summaries: {
      playerMaps, playerWeapons: weapons,
      teamMaps: (["teamA", "teamB"] as const).map((teamKey) => {
        const sideRates = sideWinRates[teamKey];
        const t = sideRates.t ?? { played: 0, won: 0 };
        const ct = sideRates.ct ?? { played: 0, won: 0 };
        return { teamKey, rounds: pkg.rounds.length, roundWins: t.won + ct.won, tRounds: t.played, tWins: t.won, ctRounds: ct.played, ctWins: ct.won };
      }),
    },
    extensions: {},
  };
}
