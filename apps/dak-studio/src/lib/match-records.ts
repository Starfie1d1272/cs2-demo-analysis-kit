import { analyzeMatchFacts } from '@cs2dak/pipeline';
import type { DemoPackage } from '@cs2dak/contract';
import type {
  ExtractMatchFactsOptions,
  MatchFacts,
  MechanicsSamplesFact,
  PlayerMatchStatsFact,
  PlayerRrFact,
  PlayerWeaponFact,
} from './fact-types';
import type { DerivedOpeningTrail, DerivedPlayerInsight, MatchDerivedCache } from './derived-cache';
function defaultPlayerKey(player: { steamId64: string }): string {
  return `steam:${player.steamId64}`;
}
function playerBySteamId(pkg: DemoPackage) {
  return new Map(pkg.players.map((player) => [player.steamId64, player]));
}
export interface MatchRecords {
  facts: MatchFacts;
  derived: MatchDerivedCache;
}

export function buildMatchRecords(
  pkg: DemoPackage,
  options: ExtractMatchFactsOptions,
): MatchRecords {
  const playerKeyFor = options.playerKeyFor ?? defaultPlayerKey;
  const analysis = analyzeMatchFacts(pkg, {
    matchId: options.matchId,
    tournamentIdentity: options.tournamentIdentity,
    calloutGrid: options.calloutGrid,
    visibility: options.visibilityFor?.(pkg.match.mapName) ?? null,
  });
  const performanceBySteamId = new Map(analysis.performance.map((row) => [row.steamId64, row]));
  const playerStats = pkg.players
    .map((player): PlayerMatchStatsFact | null => {
      const summary = performanceBySteamId.get(player.steamId64);
      if (!summary) return null;
      const clutch = (count: 1 | 2 | 3 | 4 | 5) =>
        summary.clutch.byOpponentCount[String(count) as '1' | '2' | '3' | '4' | '5'];
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
    })
    .filter((row): row is PlayerMatchStatsFact => row != null);

  const players = playerBySteamId(pkg);
  const { rrSignals, rrIndicators, weaponHighlights } = analysis;
  const signalBySteamId = new Map(rrSignals.map((row) => [row.steamId64, row]));
  const indicatorBySteamId = new Map(rrIndicators.map((row) => [row.steamId64, row]));
  const weaponBySteamId = new Map(weaponHighlights.map((row) => [row.steamId64, row]));
  const playerInsights = analysis.playerInsights.map((facts) => {
    const player = players.get(facts.performance.steamId64)!;
    return {
      matchId: options.matchId,
      playerKey: playerKeyFor(player),
      steamId64: player.steamId64,
      playerName: player.name,
      facts,
    } satisfies DerivedPlayerInsight;
  });

  const playerWeapons = pkg.players.flatMap((player) => {
    const summary = performanceBySteamId.get(player.steamId64);
    return (
      summary?.weapons.map((weapon): PlayerWeaponFact => ({
        matchId: options.matchId,
        playerKey: playerKeyFor(player),
        steamId64: player.steamId64,
        playerName: player.name,
        weapon: weapon.weapon,
        kills: weapon.kills,
        headshots: weapon.headshotKills,
      })) ?? []
    );
  });

  const mechanicsSamples = analysis.mechanics.map((row) => {
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

  const rrSignalRows = pkg.players
    .map((player): PlayerRrFact | null => {
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
    })
    .filter((row): row is PlayerRrFact => row != null);

  const mapName = pkg.match.mapName;
  const openingTrails = analysis.openingTrails.map(
    ({ steamId64, row }) =>
      ({
        matchId: options.matchId,
        mapName,
        steamId64,
        playerKey: playerKeyFor(players.get(steamId64)!),
        row,
      }) satisfies DerivedOpeningTrail,
  );
  const replayFacts = analysis.tactical;
  const lineups = {
    ...analysis.lineups,
    roundWinners: analysis.lineups.roundWinners.map(([round, winner]): [string, typeof winner] => [
      `${options.matchId}:${round}`,
      winner,
    ]),
    grenades: analysis.lineups.grenades.map((grenade) => ({
      ...grenade,
      entryId: options.matchId,
    })),
  };

  return {
    facts: {
      matchId: options.matchId,
      mapName,
      playerMatchStats: playerStats,
      playerWeapons,
      mechanicsSamples,
      rrSignalRows,
      lineups: [lineups],
      tacticalRounds: replayFacts.tacticalRounds,
      playerPositionRounds: replayFacts.mapIntelligence.playerPositionRounds,
      teamShapeRounds: replayFacts.mapIntelligence.teamShapeRounds,
      teamAwpRounds: replayFacts.mapIntelligence.teamAwpRounds,
      ctRotationRounds: replayFacts.mapIntelligence.ctRotationRounds,
    },
    derived: {
      matchId: options.matchId,
      playerInsights,
      tournament: [{ matchId: options.matchId, mapName, row: analysis.tournament }],
      teamComparison: [{ matchId: options.matchId, mapName, row: analysis.teamComparison }],
      duels: [{ matchId: options.matchId, mapName, row: analysis.duels }],
      openingTrails,
      utilityValue: [{ matchId: options.matchId, mapName, row: analysis.utilityValue }],
    },
  };
}
