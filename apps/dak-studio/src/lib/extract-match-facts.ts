import {
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
  CohortFact,
  ExtractMatchFactsOptions,
  LineupFact,
  MatchFacts,
  MechanicsSamplesFact,
  OpeningTrailFact,
  PlayerInsightFact,
  PlayerMatchStatsFact,
  PlayerWeaponFact,
} from "./fact-types";

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

const ROW_KEY_SEP = "\t";

function rowKey(...parts: string[]): string {
  return parts.join(ROW_KEY_SEP);
}

export function extractMatchFacts(pkg: DemoPackage, options: ExtractMatchFactsOptions): MatchFacts {
  const playerKeyFor = options.playerKeyFor ?? defaultPlayerKey;
  const playerStats = pkg.playerStats.map((stats): PlayerMatchStatsFact | null => {
    const player = pkg.players[stats.playerIndex];
    if (!player) return null;
    return {
      matchId: options.matchId,
      playerKey: playerKeyFor(player),
      steamId64: player.steamId64,
      playerName: player.name,
      teamKey: player.teamKey,
      mapName: pkg.match.mapName,
      rounds: stats.rounds,
      kills: stats.kills,
      deaths: stats.deaths,
      assists: stats.assists,
      damageHealth: stats.damageHealth,
      kastRounds: stats.kastRounds,
      firstKillCount: stats.firstKillCount,
      firstDeathCount: stats.firstDeathCount,
      flashAssistCount: stats.flashAssistCount,
      enemyFlashDurationSeconds: stats.enemyFlashDurationSeconds,
      teamFlashDurationSeconds: stats.teamFlashDurationSeconds,
      utilityDamage: stats.utilityDamage,
      tradeKillCount: stats.tradeKillCount,
      tradeDeathCount: stats.tradeDeathCount,
      headshotCount: stats.headshotCount,
      vsOneCount: stats.vsOneCount,
      vsOneWonCount: stats.vsOneWonCount,
      vsTwoCount: stats.vsTwoCount,
      vsTwoWonCount: stats.vsTwoWonCount,
      vsThreeCount: stats.vsThreeCount,
      vsThreeWonCount: stats.vsThreeWonCount,
      vsFourCount: stats.vsFourCount,
      vsFourWonCount: stats.vsFourWonCount,
      vsFiveCount: stats.vsFiveCount,
      vsFiveWonCount: stats.vsFiveWonCount,
    } satisfies PlayerMatchStatsFact;
  }).filter((row): row is PlayerMatchStatsFact => row != null);

  const players = playerBySteamId(pkg);
  const rrSignals = deriveRRSignals(pkg);
  const rrIndicators = deriveRRIndicators(pkg);
  const weaponHighlights = derivePlayerWeaponHighlights(pkg);
  const signalBySteamId = new Map(rrSignals.map((row) => [row.steamId64, row]));
  const indicatorBySteamId = new Map(rrIndicators.map((row) => [row.steamId64, row]));
  const weaponBySteamId = new Map(weaponHighlights.map((row) => [row.steamId64, row]));
  const playerInsights = pkg.players.map((player) => ({
    matchId: options.matchId,
    playerKey: playerKeyFor(player),
    steamId64: player.steamId64,
    playerName: player.name,
    insight: buildPlayerSeasonInsights([{ matchId: options.matchId, pkg }], [player.steamId64]),
  } satisfies PlayerInsightFact));

  const weaponCells = new Map<string, PlayerWeaponFact>();
  for (const kill of pkg.kills) {
    if (kill.killerIndex == null) continue;
    const killer = pkg.players[kill.killerIndex];
    if (!killer) continue;
    const weapon = kill.weapon || "unknown";
    const key = rowKey(options.matchId, killer.steamId64, weapon);
    const cell = weaponCells.get(key) ?? {
      matchId: options.matchId,
      playerKey: playerKeyFor(killer),
      steamId64: killer.steamId64,
      playerName: killer.name,
      weapon,
      kills: 0,
      headshots: 0,
    };
    cell.kills += 1;
    if (kill.headshot) cell.headshots += 1;
    weaponCells.set(key, cell);
  }
  const playerWeapons = [...weaponCells.values()];

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

  const cohortRows = pkg.players.map((player): CohortFact | null => {
    const signals = signalBySteamId.get(player.steamId64);
    const indicators = indicatorBySteamId.get(player.steamId64);
    if (!signals || !indicators) return null;
    return {
      matchId: options.matchId,
      playerKey: playerKeyFor(player),
      steamId64: player.steamId64,
      playerName: player.name,
      row: {
        matchId: options.matchId,
        sourceDemoHash: pkg.manifest.demo?.hash ?? null,
        steamId64: player.steamId64,
        playerName: player.name,
        teamKey: player.teamKey,
        signals,
        indicators,
        weaponHighlight: weaponBySteamId.get(player.steamId64) ?? null,
      },
    };
  }).filter((row): row is CohortFact => row != null);

  const mapName = pkg.match.mapName;
  const visibilityFor = options.visibilityFor?.(mapName) ?? null;
  const calloutGrid = options.calloutGrid ?? null;
  const input = { matchId: options.matchId, pkg };
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
  } satisfies OpeningTrailFact));
  // core 内部组合 facade 共享短生命周期 replay context；Studio 只接收紧凑 facts。
  const replayFacts = extractMatchTacticalAndMapIntelligenceFacts(pkg, {
    matchId: options.matchId,
    calloutGrid,
  });

  return {
    matchId: options.matchId,
    mapName,
    playerMatchStats: playerStats,
    playerInsights,
    playerWeapons,
    mechanicsSamples,
    cohortRows,
    tournamentFacts: [{ matchId: options.matchId, mapName, row: extractTournamentFacts(input) }],
    teamComparisonFacts: [{ matchId: options.matchId, mapName, row: extractTeamComparisonFacts(input) }],
    duelFacts: [{ matchId: options.matchId, mapName, row: extractDuelInsightsFacts(input, { visibilityFor: () => visibilityFor }) }],
    // workspace model 不再随导入持久化（单场 ~35MB、整包全量分析，是导入内存/耗时大头）；
    // 打开单场工作台/教练回放时由 loadMatchWorkspaceModel 从 ZIP 懒算。
    matchWorkspace: [],
    openingTrails,
    lineups: [extractLineupFact(pkg, options.matchId, calloutGrid)],
    tacticalRounds: replayFacts.tacticalRounds,
    playerPositionRounds: replayFacts.mapIntelligence.playerPositionRounds,
    teamShapeRounds: replayFacts.mapIntelligence.teamShapeRounds,
    teamAwpRounds: replayFacts.mapIntelligence.teamAwpRounds,
    utilityValueFacts: [{ matchId: options.matchId, mapName, row: buildUtilityValueSummary([input], utilityPlayers) }],
  };
}
