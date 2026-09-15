import {
  aggregatePlayerRoundPerformanceFacts,
  buildPlayerRoundPerformanceFacts,
  derivePlayerMechanics,
  derivePlayerWeaponHighlights,
  deriveRRIndicators,
  deriveRRSignals,
  extractMatchTacticalAndMapIntelligenceFacts,
} from "@cs2dak/core";
import { decodeDelta, type DemoPackage, type Side } from "@cs2dak/contract";
import type { TriangleBvh, CalloutGrid, Vec3, LineupGrenadeLike } from "@cs2dak/maps";
import { calloutNear } from "@cs2dak/maps";
import {
  buildOpeningTrails,
  buildPlayerSeasonInsights,
  buildUtilityValueSummary,
  extractDuelInsightsFacts,
  extractTeamComparisonFacts,
  extractTournamentFacts,
} from "@cs2dak/presentation";
import type {
  ExtractMatchFactsOptions,
  LineupFact,
  MatchFacts,
  MechanicsSamplesFact,
  PlayerMatchStatsFact,
  PlayerRrFact,
  PlayerWeaponFact,
} from "./fact-types";
import type { DerivedOpeningTrail, DerivedPlayerInsight, MatchDerivedCache } from "./derived-cache";

function defaultPlayerKey(player: { steamId64: string }): string {
  return `steam:${player.steamId64}`;
}

function playerBySteamId(pkg: DemoPackage): Map<string, DemoPackage["players"][number]> {
  return new Map(pkg.players.map((player) => [player.steamId64, player]));
}

function sideOf(pkg: DemoPackage, playerIndex: number, roundNumber: number): Side | null {
  const player = pkg.players[playerIndex];
  const round = pkg.rounds.find((row) => row.roundNumber === roundNumber);
  if (!player || !round) return null;
  return player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
}

function throwerPlaceAt(pkg: DemoPackage, roundNumber: number, playerIndex: number, tick: number): string | null {
  const replay = pkg.replay;
  if (!replay) return null;
  const replayRound = replay.rounds.find((row) => row.roundNumber === roundNumber);
  if (!replayRound) return null;
  const track = replayRound.players.find((player) => player.playerIndex === playerIndex);
  if (!track) return null;
  const frameIndex = Math.max(
    0,
    Math.min(replayRound.frameCount - 1, Math.round((tick - replayRound.startTick) / replayRound.tickStep)),
  );
  const placeIndex = track.place[frameIndex];
  if (placeIndex == null || placeIndex < 0 || placeIndex >= replay.placeDict.length) return null;
  return replay.placeDict[placeIndex] || null;
}

function throwerPracticePoseAt(
  pkg: DemoPackage,
  roundNumber: number,
  playerIndex: number,
  tick: number,
): LineupGrenadeLike["practicePose"] {
  const replay = pkg.replay;
  if (!replay) return null;
  const replayRound = replay.rounds.find((row) => row.roundNumber === roundNumber);
  if (!replayRound) return null;
  const track = replayRound.players.find((player) => player.playerIndex === playerIndex);
  if (!track) return null;
  const frameIndex = Math.max(
    0,
    Math.min(replayRound.frameCount - 1, Math.round((tick - replayRound.startTick) / replayRound.tickStep)),
  );
  const coordScale = replay.meta.coordScale || 1;
  const angleScale = replay.meta.angleScale || 1;
  const xs = decodeDelta(track.x);
  const ys = decodeDelta(track.y);
  const zs = decodeDelta(track.z);
  const yaws = decodeDelta(track.yaw);
  const pitches = decodeDelta(track.pitch ?? []);
  return {
    position: {
      x: (xs[frameIndex] ?? 0) * coordScale,
      y: (ys[frameIndex] ?? 0) * coordScale,
      z: (zs[frameIndex] ?? 0) * coordScale,
    },
    yaw: (yaws[frameIndex] ?? 0) / angleScale,
    pitch: (pitches[frameIndex] ?? 0) / angleScale,
  };
}

function effectCalloutFor(grid: CalloutGrid | null, point: Vec3): {
  callout: string | null;
  confidence: number | null;
  samples: number | null;
  source: "exact" | "nearby" | null;
  distance: number | null;
} {
  if (!grid) return { callout: null, confidence: null, samples: null, source: null, distance: null };
  const result = calloutNear(grid, point, { horizontalRadius: 20, verticalRadius: 40 });
  return result
    ? { callout: result.callout, confidence: result.confidence, samples: result.samples, source: result.source, distance: result.distance }
    : { callout: null, confidence: null, samples: null, source: null, distance: null };
}

function extractLineupFact(pkg: DemoPackage, matchId: string, grid: CalloutGrid | null): LineupFact {
  const roundsByNumber = new Map(pkg.rounds.map((round) => [round.roundNumber, round]));
  return {
    matchId,
    mapName: pkg.match.mapName,
    tickrate: pkg.match.tickrate || 64,
    roundWinners: pkg.rounds.map((round) => [`${matchId}:${round.roundNumber}`, round.winnerTeamKey]),
    grenades: (pkg.grenades ?? []).map((grenade) => {
      const round = roundsByNumber.get(grenade.roundNumber);
      const player = pkg.players[grenade.throwerIndex];
      const practicePose = throwerPracticePoseAt(pkg, grenade.roundNumber, grenade.throwerIndex, grenade.throwTick);
      const effect = effectCalloutFor(grid, grenade.effectPosition);
      return {
        roundNumber: grenade.roundNumber,
        grenade: grenade.grenade,
        throwerIndex: grenade.throwerIndex,
        throwTick: grenade.throwTick,
        throwPosition: practicePose?.position ?? grenade.throwPosition,
        effectPosition: grenade.effectPosition,
        practicePose,
        entryId: matchId,
        freezeEndTick: round?.freezeEndTick ?? 0,
        throwerPlaceName: throwerPlaceAt(pkg, grenade.roundNumber, grenade.throwerIndex, grenade.throwTick),
        effectCallout: effect.callout,
        effectCalloutConfidence: effect.confidence,
        effectCalloutSamples: effect.samples,
        side: sideOf(pkg, grenade.throwerIndex, grenade.roundNumber),
        teamKey: player?.teamKey ?? null,
      };
    }),
  };
}

export interface ExtractedMatchData { facts: MatchFacts; derived: MatchDerivedCache }

export function extractMatchData(pkg: DemoPackage, options: ExtractMatchFactsOptions): ExtractedMatchData {
  const playerKeyFor = options.playerKeyFor ?? defaultPlayerKey;
  const performanceFacts = buildPlayerRoundPerformanceFacts(pkg);
  const performanceBySteamId = aggregatePlayerRoundPerformanceFacts(performanceFacts);
  const playerStats = pkg.players.map((player): PlayerMatchStatsFact | null => {
    const summary = performanceBySteamId.get(player.steamId64);
    if (!summary) return null;
    const clutch = (count: 1 | 2 | 3 | 4 | 5) => summary.clutch.byOpponentCount[String(count) as "1" | "2" | "3" | "4" | "5"];
    return {
      matchId: options.matchId,
      playerKey: playerKeyFor(player),
      steamId64: player.steamId64,
      playerName: player.name,
      teamKey: player.teamKey,
      mapName: pkg.match.mapName,
      rounds: summary.rounds,
      kills: summary.kills,
      deaths: summary.deaths,
      assists: summary.assists,
      damageHealth: summary.damage,
      kastRounds: summary.kastRounds,
      firstKillCount: summary.firstKills,
      firstDeathCount: summary.firstDeaths,
      flashAssistCount: summary.utility.flashAssists,
      enemyFlashDurationSeconds: summary.utility.enemyBlindSeconds,
      teamFlashDurationSeconds: summary.utility.teamBlindSeconds,
      utilityDamage: summary.utility.utilityDamage,
      tradeKillCount: summary.tradeKills,
      tradeDeathCount: summary.tradedDeaths,
      headshotCount: summary.headshots,
      vsOneCount: clutch(1).attempts,
      vsOneWonCount: clutch(1).wins,
      vsTwoCount: clutch(2).attempts,
      vsTwoWonCount: clutch(2).wins,
      vsThreeCount: clutch(3).attempts,
      vsThreeWonCount: clutch(3).wins,
      vsFourCount: clutch(4).attempts,
      vsFourWonCount: clutch(4).wins,
      vsFiveCount: clutch(5).attempts,
      vsFiveWonCount: clutch(5).wins,
    } satisfies PlayerMatchStatsFact;
  }).filter((row): row is PlayerMatchStatsFact => row != null);

  const players = playerBySteamId(pkg);
  const rrSignals = deriveRRSignals(pkg, performanceFacts);
  const rrIndicators = deriveRRIndicators(pkg, performanceFacts);
  const weaponHighlights = derivePlayerWeaponHighlights(pkg, performanceFacts);
  const signalBySteamId = new Map(rrSignals.map((row) => [row.steamId64, row]));
  const indicatorBySteamId = new Map(rrIndicators.map((row) => [row.steamId64, row]));
  const weaponBySteamId = new Map(weaponHighlights.map((row) => [row.steamId64, row]));
  const playerInsights = pkg.players.map((player) => ({
    matchId: options.matchId,
    playerKey: playerKeyFor(player),
    steamId64: player.steamId64,
    playerName: player.name,
    insight: buildPlayerSeasonInsights([{ matchId: options.matchId, pkg, performanceFacts }], [player.steamId64]),
  } satisfies DerivedPlayerInsight));

  const playerWeapons = pkg.players.flatMap((player) => {
    const summary = performanceBySteamId.get(player.steamId64);
    return summary?.weapons.map((weapon): PlayerWeaponFact => ({
      matchId: options.matchId,
      playerKey: playerKeyFor(player),
      steamId64: player.steamId64,
      playerName: player.name,
      weapon: weapon.weapon,
      kills: weapon.kills,
      headshots: weapon.headshotKills,
    })) ?? [];
  });

  const mechanicsSamples = derivePlayerMechanics(pkg, {
    visibility: options.visibilityFor?.(pkg.match.mapName) ?? null,
  }).map((row) => {
    const player = players.get(row.steamId64);
    return {
      matchId: options.matchId,
      playerKey: player ? playerKeyFor(player) : defaultPlayerKey(row),
      steamId64: row.steamId64,
      playerName: player?.name ?? row.steamId64,
      weapon: row.weapon,
      row,
    } satisfies MechanicsSamplesFact;
  });

  const rrSignalRows = pkg.players.map((player): PlayerRrFact | null => {
    const signals = signalBySteamId.get(player.steamId64);
    const indicators = indicatorBySteamId.get(player.steamId64);
    if (!signals || !indicators) return null;
    return {
      matchId: options.matchId,
      playerKey: playerKeyFor(player),
      steamId64: player.steamId64,
      playerName: player.name,
      sourceDemoHash: pkg.manifest.demo?.hash ?? null,
      teamKey: player.teamKey,
      signals,
      indicators,
      weaponHighlight: weaponBySteamId.get(player.steamId64) ?? null,
    };
  }).filter((row): row is PlayerRrFact => row != null);

  const mapName = pkg.match.mapName;
  const visibilityFor = options.visibilityFor?.(mapName) ?? null;
  const calloutGrid = options.calloutGrid ?? null;
  const input = { matchId: options.matchId, pkg, performanceFacts };
  const utilityPlayers = pkg.players.map((player) => ({
    playerKey: playerKeyFor(player),
    name: player.name,
    steamIds: [player.steamId64],
  }));
  const openingTrails = pkg.players.map((player) => ({
    matchId: options.matchId,
    mapName,
    playerKey: playerKeyFor(player),
    steamId64: player.steamId64,
    row: buildOpeningTrails(pkg, options.matchId, player.steamId64, { windowSeconds: 30 }),
  } satisfies DerivedOpeningTrail));
  // core 内部组合 facade 共享短生命周期 replay context；Studio 只接收紧凑 facts。
  const replayFacts = extractMatchTacticalAndMapIntelligenceFacts(pkg, {
    matchId: options.matchId,
    calloutGrid,
    performanceFacts,
  });

  return {
    facts: {
      matchId: options.matchId, mapName, playerMatchStats: playerStats, playerWeapons, mechanicsSamples, rrSignalRows,
      lineups: [extractLineupFact(pkg, options.matchId, calloutGrid)], tacticalRounds: replayFacts.tacticalRounds,
      playerPositionRounds: replayFacts.mapIntelligence.playerPositionRounds, teamShapeRounds: replayFacts.mapIntelligence.teamShapeRounds,
      teamAwpRounds: replayFacts.mapIntelligence.teamAwpRounds,
      ctRotationRounds: replayFacts.mapIntelligence.ctRotationRounds,
    },
    derived: {
      matchId: options.matchId, playerInsights,
      tournament: [{ matchId: options.matchId, mapName, row: extractTournamentFacts(input) }],
      teamComparison: [{ matchId: options.matchId, mapName, row: extractTeamComparisonFacts(input) }],
      duels: [{ matchId: options.matchId, mapName, row: extractDuelInsightsFacts(input, { visibilityFor: () => visibilityFor }) }],
      openingTrails,
      utilityValue: [{ matchId: options.matchId, mapName, row: buildUtilityValueSummary([input], utilityPlayers) }],
    },
  };
}
