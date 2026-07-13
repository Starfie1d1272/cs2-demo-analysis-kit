import {
  buildPlayerMechanicsProfileFromRows,
  mergeUtilityValueSummaries,
  displayWeaponName,
  type PlayerMechanicsProfile,
  type PlayerSeasonInsights,
  type PlayerWeaponStat,
  type UtilityValueSummary,
} from "@cs2dak/presentation";
import type {
  FactsStore,
  PlayerFlashSummariesFactsOptions,
  PlayerInsightFact,
  PlayerSeasonDetailsFactsOptions,
  PlayerSeasonDetailsFromFacts,
  UtilityValueFactsOptions,
} from "./fact-types";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyInsights(): PlayerSeasonInsights {
  return {
    trend: [],
    flash: {
      flashesThrown: 0,
      enemyBlindSeconds: 0,
      teamBlindSeconds: 0,
      enemyBlindVictims: 0,
      enemySecondsPerFlash: null,
      netSecondsPerFlash: null,
      flashAssists: 0,
      worstTeamFlashes: [],
      bestEnemyFlashes: [],
    },
    mistakes: {
      lowBuyFirstDeaths: { count: 0, attempts: 0, evidence: [] },
      fullBuyFirstDeaths: { count: 0, attempts: 0, evidence: [] },
      antiEcoFirstDeaths: { count: 0, attempts: 0, evidence: [] },
      deathTiming: { early: 0, mid: 0, late: 0, total: 0 },
      clutchLosses: { count: 0, evidence: [] },
    },
  };
}

function mergeInsights(rows: PlayerInsightFact[]): PlayerSeasonInsights {
  if (rows.length === 1) return rows[0]!.insight;
  const out = emptyInsights();
  for (const row of rows) {
    const insight = row.insight;
    out.trend.push(...insight.trend);
    out.flash.flashesThrown += insight.flash.flashesThrown;
    out.flash.enemyBlindSeconds += insight.flash.enemyBlindSeconds;
    out.flash.teamBlindSeconds += insight.flash.teamBlindSeconds;
    out.flash.enemyBlindVictims += insight.flash.enemyBlindVictims;
    out.flash.flashAssists += insight.flash.flashAssists;
    out.flash.worstTeamFlashes.push(...insight.flash.worstTeamFlashes);
    out.flash.bestEnemyFlashes.push(...(insight.flash.bestEnemyFlashes ?? []));
    for (const key of ["lowBuyFirstDeaths", "fullBuyFirstDeaths", "antiEcoFirstDeaths"] as const) {
      out.mistakes[key].count += insight.mistakes[key].count;
      out.mistakes[key].attempts += insight.mistakes[key].attempts;
      out.mistakes[key].evidence.push(...insight.mistakes[key].evidence);
    }
    out.mistakes.deathTiming.early += insight.mistakes.deathTiming.early;
    out.mistakes.deathTiming.mid += insight.mistakes.deathTiming.mid;
    out.mistakes.deathTiming.late += insight.mistakes.deathTiming.late;
    out.mistakes.deathTiming.total += insight.mistakes.deathTiming.total;
    out.mistakes.clutchLosses.count += insight.mistakes.clutchLosses.count;
    out.mistakes.clutchLosses.evidence.push(...insight.mistakes.clutchLosses.evidence);
  }
  out.trend.sort((a, b) => a.matchId.localeCompare(b.matchId));
  out.flash.enemyBlindSeconds = round1(out.flash.enemyBlindSeconds);
  out.flash.teamBlindSeconds = round1(out.flash.teamBlindSeconds);
  out.flash.enemySecondsPerFlash = out.flash.flashesThrown > 0
    ? round2(out.flash.enemyBlindSeconds / out.flash.flashesThrown)
    : null;
  out.flash.netSecondsPerFlash = out.flash.flashesThrown > 0
    ? round2((out.flash.enemyBlindSeconds - out.flash.teamBlindSeconds) / out.flash.flashesThrown)
    : null;
  out.flash.worstTeamFlashes = out.flash.worstTeamFlashes.sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 10);
  out.flash.bestEnemyFlashes = out.flash.bestEnemyFlashes.sort((a, b) => b.enemySeconds - a.enemySeconds).slice(0, 15);
  out.mistakes.lowBuyFirstDeaths.evidence = out.mistakes.lowBuyFirstDeaths.evidence.slice(0, 10);
  out.mistakes.fullBuyFirstDeaths.evidence = out.mistakes.fullBuyFirstDeaths.evidence.slice(0, 10);
  out.mistakes.antiEcoFirstDeaths.evidence = out.mistakes.antiEcoFirstDeaths.evidence.slice(0, 10);
  out.mistakes.clutchLosses.evidence = out.mistakes.clutchLosses.evidence.slice(0, 10);
  return out;
}

function mergeWeaponStats(rows: import("./fact-types").PlayerWeaponFact[], matchCount: number): PlayerWeaponStat[] {
  const byWeapon = new Map<string, { weapon: string; kills: number; headshots: number }>();
  for (const row of rows) {
    const cell = byWeapon.get(row.weapon) ?? { weapon: row.weapon, kills: 0, headshots: 0 };
    cell.kills += row.kills;
    cell.headshots += row.headshots;
    byWeapon.set(row.weapon, cell);
  }
  const denominator = Math.max(1, matchCount);
  return [...byWeapon.values()]
    .map((row) => ({
      weapon: row.weapon,
      label: displayWeaponName(row.weapon),
      kills: row.kills,
      headshotPercent: row.kills > 0 ? round1((row.headshots / row.kills) * 100) : null,
      killsPerMatch: round2(row.kills / denominator),
    }))
    .sort((a, b) => b.kills - a.kills || a.label.localeCompare(b.label));
}

export async function buildPlayerSeasonDetailsFromFacts(
  store: FactsStore,
  options: PlayerSeasonDetailsFactsOptions,
): Promise<PlayerSeasonDetailsFromFacts> {
  const [insights, weapons, mechanics] = await Promise.all([
    store.getPlayerInsights(options),
    store.getPlayerWeapons(options),
    store.getMechanicsRows(options),
  ]);
  return {
    insights: mergeInsights(insights),
    weaponStats: mergeWeaponStats(weapons, mechanics.length),
    mechanics: buildPlayerMechanicsProfileFromRows(mechanics.map((match) => match.rows), options.steamIds, mechanics.length),
  };
}

export async function buildPlayerFlashSummariesFromFacts(
  store: FactsStore,
  options: PlayerFlashSummariesFactsOptions,
): Promise<Array<{
  playerKey: string;
  name: string;
  flashesThrown: number;
  enemyBlindSeconds: number;
  teamBlindSeconds: number;
  enemyBlindVictims: number;
  enemySecondsPerFlash: number | null;
  netSecondsPerFlash: number | null;
  flashAssists: number;
  worstTeamFlashes: PlayerSeasonInsights["flash"]["worstTeamFlashes"];
  bestEnemyFlashes: PlayerSeasonInsights["flash"]["bestEnemyFlashes"];
}>> {
  return Promise.all(options.players.map(async (player) => {
    const merged = mergeInsights(await store.getPlayerInsights({
      matchIds: options.matchIds,
      mapNames: options.mapNames,
      playerKeys: [player.playerKey],
      steamIds: player.steamIds,
    }));
    return {
      playerKey: player.playerKey,
      name: player.name,
      ...merged.flash,
    };
  }));
}

export async function buildUtilityValueSummaryFromFacts(
  store: FactsStore,
  options: UtilityValueFactsOptions,
): Promise<UtilityValueSummary> {
  const summary = mergeUtilityValueSummaries(await store.getUtilityValueFacts(options), {
    players: options.players,
    teamRenames: options.teamRenames,
  });
  return options.selectedTeams && options.selectedTeams.length > 0
    ? { ...summary, teams: summary.teams.filter((row) => options.selectedTeams!.includes(row.name)) }
    : summary;
}
