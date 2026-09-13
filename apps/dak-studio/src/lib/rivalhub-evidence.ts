import {
  analyzeDemoPackage,
  buildPlayerRoundFacts,
  buildPlayerRoundUtilityFacts,
  buildTeamSideWinRates,
  demoSourceAvailability,
} from "../../../../packages/core/src/index";
import type { DemoPackage } from "../../../../packages/contract/src/index";
import { buildTournamentInsightsFromFacts, extractTournamentFacts } from "../../../../packages/presentation/src/index";
import type { RivalHubRemoteMap, RivalHubRemotePlayer } from "./rivalhub-contract";

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

export type RivalHubMatchedParticipant = {
  steamId64: string;
  nameSnapshot: string;
  userId: string;
  eventRosterMemberId: string;
  entryId: string;
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * 用 remote lineup 的 Steam64 做唯一匹配。队名/昵称只用于展示与队伍方向校验，
 * 不参与身份回退；缺少成员、重复成员或队伍方向不明时直接交给 UI 处理。
 */
export function matchRivalHubParticipants(
  pkg: DemoPackage,
  target: RivalHubEvidenceTarget,
  lineup: RivalHubRemotePlayer[],
): Map<string, RivalHubMatchedParticipant> {
  if (lineup.length !== 10) throw new Error("在线赛事缺少双方各 5 名可校验首发，暂不能自动提交");
  const packagePlayers = new Map(pkg.players.map((player) => [player.steamId64, player]));
  if (packagePlayers.size !== pkg.players.length) throw new Error("Demo 中存在重复 Steam64，暂不能自动提交");
  const identities = new Map<string, RivalHubMatchedParticipant>();
  for (const remote of lineup) {
    const player = packagePlayers.get(remote.steamId64);
    if (!player) throw new Error(`Demo 缺少在线名单成员 ${remote.name}`);
    const entryId = player.teamKey === "teamA" ? target.entryAId : player.teamKey === "teamB" ? target.entryBId : null;
    if (!entryId) throw new Error(`Demo 选手 ${remote.name} 的队伍无法对应在线赛事`);
    if (identities.has(remote.steamId64)) throw new Error("在线名单存在重复 Steam64");
    identities.set(remote.steamId64, {
      steamId64: remote.steamId64,
      nameSnapshot: remote.name,
      userId: remote.userId,
      eventRosterMemberId: remote.eventRosterMemberId,
      entryId,
    });
  }
  if (identities.size !== packagePlayers.size || [...packagePlayers.keys()].some((id) => !identities.has(id))) {
    throw new Error("Demo 选手集合与在线 Canonical MatchRoster 不一致");
  }
  return identities;
}

export function selectRivalHubMap(
  pkg: DemoPackage,
  candidates: Array<{ series: { teamAName: string; teamBName: string }; map: RivalHubRemoteMap }>,
): { series: { teamAName: string; teamBName: string }; map: RivalHubRemoteMap } {
  const demoTeams = [pkg.match.teamA.name ?? "Team A", pkg.match.teamB.name ?? "Team B"].map(normalize).sort();
  const matches = candidates.filter(({ series, map }) => {
    if (normalize(map.mapName) !== normalize(pkg.match.mapName)) return false;
    const seriesTeams = [series.teamAName, series.teamBName].map(normalize).sort();
    if (seriesTeams[0] !== demoTeams[0] || seriesTeams[1] !== demoTeams[1]) return false;
    if (map.scoreA == null || map.scoreB == null) return true;
    const sameDirection = normalize(series.teamAName) === normalize(pkg.match.teamA.name ?? "Team A");
    const expectedA = sameDirection ? map.scoreA : map.scoreB;
    const expectedB = sameDirection ? map.scoreB : map.scoreA;
    return expectedA === pkg.match.teamA.score && expectedB === pkg.match.teamB.score;
  });
  if (matches.length !== 1) {
    throw new Error(matches.length === 0 ? "没有唯一匹配的在线赛事地图" : "在线赛事地图匹配不唯一，请选择目标地图");
  }
  return matches[0]!;
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

function mappedSteam(pkg: DemoPackage, identities: Map<string, RivalHubMatchedParticipant>, playerIndex: number | null): string | null {
  if (playerIndex === null) return null;
  const player = pkg.players[playerIndex];
  return player ? identities.get(player.steamId64)?.steamId64 ?? null : null;
}

function teamConversions(pkg: DemoPackage) {
  const insights = buildTournamentInsightsFromFacts([extractTournamentFacts({ matchId: "fixture", pkg })]);
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

export function buildRivalHubDemoEvidenceV1(
  pkg: DemoPackage,
  target: RivalHubEvidenceTarget,
  identities: Map<string, RivalHubMatchedParticipant>,
): Record<string, unknown> {
  const demoSha256 = pkg.manifest.demo?.hash;
  if (!demoSha256 || !/^[a-f0-9]{64}$/.test(demoSha256)) {
    throw new Error("DemoPackage manifest.demo.hash 必须提供有效的 64 位小写 SHA-256");
  }
  const analysis = analyzeDemoPackage(pkg);
  const facts = buildPlayerRoundFacts(pkg);
  const utilityFacts = new Map(buildPlayerRoundUtilityFacts(pkg).map((fact) => [`${fact.roundNumber}:${fact.steamId64}`, fact]));
  const sideWinRates = buildTeamSideWinRates(pkg);
  const playerIndex = new Map(pkg.players.map((player, index) => [player.steamId64, index]));
  const roundSeq = new Map(pkg.rounds.map((round, index) => [round.roundNumber, index + 1]));
  const playerRounds = facts.map((fact) => {
    const index = playerIndex.get(fact.steamId64)!;
    const clutch = pkg.clutches.find((row) => row.roundNumber === fact.roundNumber && row.clutcherIndex === index);
    const utility = utilityFacts.get(`${fact.roundNumber}:${fact.steamId64}`)!;
    return {
      roundSeq: roundSeq.get(fact.roundNumber)!, steamId64: identities.get(fact.steamId64)!.steamId64, teamKey: fact.teamKey, side: fact.side,
      survived: fact.survived, kills: fact.kills, deaths: fact.deaths, assists: fact.assists, damage: fact.damage,
      headshots: pkg.kills.filter((row) => row.roundNumber === fact.roundNumber && row.killerIndex === index && row.headshot).length,
      tradeKills: fact.tradeKills, tradedDeaths: fact.tradedDeaths, openingDuel: fact.openingDuel, kast: fact.kastTags.length > 0,
      economyType: fact.economyType, equipmentValue: fact.equipmentValue,
      clutch: clutch ? { opponentCount: clutch.opponentCount, won: clutch.won } : null,
      utility: {
        flashesThrown: utility.flashesThrown, enemyBlindSeconds: utility.enemyBlindSeconds, teamBlindSeconds: utility.teamBlindSeconds,
        enemyBlindVictims: utility.enemyBlindVictims, flashAssists: utility.flashAssists, heThrows: utility.heThrows,
        heDamage: utility.heDamage, fireThrows: utility.fireThrows, fireDamage: utility.fireDamage,
        smokesThrown: utility.smokesThrown, utilityKills: utility.utilityKills,
      },
    };
  });
  const playerMaps = pkg.players.map((player) => {
    const steamId64 = identities.get(player.steamId64)!.steamId64;
    const rows = playerRounds.filter((row) => row.steamId64 === steamId64);
    const byCount = (key: "kills" | "deaths" | "assists" | "damage" | "headshots" | "tradeKills") => rows.reduce((sum, row) => sum + row[key], 0);
    const multi = (count: number) => rows.filter((row) => row.kills === count).length;
    const clutches = rows.filter((row) => row.clutch !== null);
    return {
      steamId64, teamKey: player.teamKey, rounds: rows.length, kills: byCount("kills"), deaths: byCount("deaths"), assists: byCount("assists"),
      damage: byCount("damage"), kastRounds: rows.filter((row) => row.kast).length, headshots: byCount("headshots"),
      firstKills: rows.filter((row) => row.openingDuel === "won").length, firstDeaths: rows.filter((row) => row.openingDuel === "lost").length,
      tradeKills: byCount("tradeKills"), twoKillRounds: multi(2), threeKillRounds: multi(3), fourKillRounds: multi(4),
      fiveKillRounds: rows.filter((row) => row.kills >= 5).length, clutchAttempts: clutches.length, clutchWins: clutches.filter((row) => row.clutch?.won).length,
    };
  });
  const weapons = new Map<string, { steamId64: string; weapon: string; kills: number; headshotKills: number }>();
  for (const kill of pkg.kills) {
    const steamId64 = mappedSteam(pkg, identities, kill.killerIndex);
    if (!steamId64) continue;
    const key = `${steamId64}:${kill.weapon}`;
    const row = weapons.get(key) ?? { steamId64, weapon: kill.weapon, kills: 0, headshotKills: 0 };
    row.kills += 1;
    if (kill.headshot) row.headshotKills += 1;
    weapons.set(key, row);
  }
  const conversions = teamConversions(pkg);
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
      return { steamId64: identity.steamId64, nameSnapshot: identity.nameSnapshot, observedTeamKey: player.teamKey, resolution: { status: "matched", userId: identity.userId, eventRosterMemberId: identity.eventRosterMemberId, entryId: identity.entryId } };
    }),
    sourceFacts: {
      rounds: pkg.rounds.map((row, index) => ({ roundSeq: index + 1, sourceRoundNumber: row.roundNumber, phase: row.roundNumber <= 24 ? "regulation" : "overtime", startTick: row.startTick, freezeEndTick: row.freezeEndTick, endTick: row.endTick, teamASide: row.teamASide, teamBSide: row.teamBSide, teamAScoreBefore: row.teamAScoreBefore, teamBScoreBefore: row.teamBScoreBefore, teamAEconomy: row.teamAEconomy, teamBEconomy: row.teamBEconomy, winnerTeamKey: row.winnerTeamKey, winnerSide: row.winnerSide, endReason: row.endReason })),
      kills: pkg.kills.map((row) => ({ roundSeq: roundSeq.get(row.roundNumber)!, tick: row.tick, killerSteamId64: mappedSteam(pkg, identities, row.killerIndex), victimSteamId64: mappedSteam(pkg, identities, row.victimIndex)!, weapon: row.weapon, headshot: row.headshot })),
      objectives: pkg.bombs.map((row) => ({ roundSeq: roundSeq.get(row.roundNumber)!, tick: row.tick, type: row.type, site: row.site, actorSteamId64: mappedSteam(pkg, identities, row.actorIndex) })),
    },
    semanticFacts: { playerRounds, economyMatrix: conversions.economyMatrix, teamConversions: conversions.teams },
    summaries: {
      playerMaps, playerWeapons: [...weapons.values()],
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
