import { aggregatePlayerRoundPerformanceFacts, buildPlayerRoundPerformanceFacts, type PlayerPerformanceAggregate } from "@cs2dak/core";
import { round } from "./season-metrics.js";
import type { SeasonInsightsDemo, PlayerSeasonInsights, MistakeEvidence, MistakeReview, TeamFlashIncident, EnemyFlashIncident } from "./insights.js";

export const PLAYER_INSIGHT_FACT_VERSION = 2;

const LOW_BUY_TYPES = new Set(["eco", "semi", "force"]);
const DEATH_EARLY_SECONDS = 25;
const DEATH_LATE_SECONDS = 55;
const MAX_EVIDENCE = 10;
const MAX_BEST_FLASH = 15;
export interface FirstDeathObservationFacts { eligibleRoundNumbers: number[]; firstDeathRoundNumbers: number[]; evidence: MistakeEvidence[] }
export interface PlayerMatchInsightFacts {
  matchId: string; mapName: string; roundCount: number; performance: PlayerPerformanceAggregate;
  mistakes: { lowBuyFirstDeaths: FirstDeathObservationFacts; fullBuyFirstDeaths: FirstDeathObservationFacts; antiEcoFirstDeaths: FirstDeathObservationFacts; deathTiming: MistakeReview["deathTiming"]; clutchLosses: MistakeReview["clutchLosses"] };
  worstTeamFlashes: TeamFlashIncident[]; bestEnemyFlashes: EnemyFlashIncident[];
}
function observation(): FirstDeathObservationFacts { return { eligibleRoundNumbers: [], firstDeathRoundNumbers: [], evidence: [] }; }
export function extractPlayerMatchInsightFacts(demo: SeasonInsightsDemo): PlayerMatchInsightFacts[] {
  const { pkg, matchId } = demo;
  const allFacts = demo.performanceFacts ?? buildPlayerRoundPerformanceFacts(pkg);
  const aggregates = aggregatePlayerRoundPerformanceFacts(allFacts);
  return [...aggregates.values()].map(performance => {
    const ids = new Set([performance.steamId64]);
    const playerRounds = allFacts.playerRounds.filter(row => ids.has(row.steamId64));
    const teamFlashes: TeamFlashIncident[] = [];
    const enemyFlashes: EnemyFlashIncident[] = [];
    const lowBuy = observation(), fullBuy = observation(), antiEco = observation();
    const deathTiming = { early: 0, mid: 0, late: 0, total: 0 };
    const clutchLossEvidence: MistakeEvidence[] = [];
    let clutchLosses = 0;
    // 队闪事件：同 (round, tick±8) 的同投掷者致盲友方行归并为一颗闪
    const teamBlindRows = pkg.blinds.filter((b) => {
      const flasher = pkg.players[b.flasherIndex];
      const flashed = pkg.players[b.flashedIndex];
      return flasher != null && flashed != null && ids.has(flasher.steamId64)
        && flasher.teamKey === flashed.teamKey && flasher.steamId64 !== flashed.steamId64;
    });
    const grouped = new Map<string, { roundNumber: number; tick: number; victims: Set<string>; seconds: number }>();
    for (const blind of teamBlindRows) {
      const key = blind.flashId ?? `${blind.roundNumber}-${Math.round(blind.tick / 16)}`;
      const cell = grouped.get(key) ?? { roundNumber: blind.roundNumber, tick: blind.tick, victims: new Set(), seconds: 0 };
      cell.tick = Math.min(cell.tick, blind.tick);
      cell.victims.add(pkg.players[blind.flashedIndex]?.steamId64 ?? "");
      cell.seconds += blind.durationSeconds;
      grouped.set(key, cell);
    }
    for (const cell of grouped.values()) {
      teamFlashes.push({
        matchId,
        roundNumber: cell.roundNumber,
        tick: cell.tick,
        reason: "该闪光误盲队友的时长位于当前样本前列",
        role: "example",
        victimCount: cell.victims.size,
        totalSeconds: round(cell.seconds, 2)
      });
    }

    // 致盲敌方事件：同 flashId 的本人致盲敌方行归并为一颗闪，并扣除同颗误盲队友秒数算净收益
    const enemyBlindRows = pkg.blinds.filter((b) => {
      const flasher = pkg.players[b.flasherIndex];
      const flashed = pkg.players[b.flashedIndex];
      return flasher != null && flashed != null && ids.has(flasher.steamId64)
        && flasher.teamKey !== flashed.teamKey;
    });
    const enemyGrouped = new Map<string, { roundNumber: number; tick: number; victims: Set<string>; seconds: number }>();
    for (const blind of enemyBlindRows) {
      const key = blind.flashId ?? `${blind.roundNumber}-${Math.round(blind.tick / 16)}`;
      const cell = enemyGrouped.get(key) ?? { roundNumber: blind.roundNumber, tick: blind.tick, victims: new Set(), seconds: 0 };
      cell.tick = Math.min(cell.tick, blind.tick);
      cell.victims.add(pkg.players[blind.flashedIndex]?.steamId64 ?? "");
      cell.seconds += blind.durationSeconds;
      enemyGrouped.set(key, cell);
    }
    for (const [key, cell] of enemyGrouped) {
      const teamSeconds = grouped.get(key)?.seconds ?? 0;
      enemyFlashes.push({
        matchId,
        roundNumber: cell.roundNumber,
        tick: cell.tick,
        reason: "该闪光造成的敌方致盲时间位于当前样本前列",
        role: "example",
        victimCount: cell.victims.size,
        enemySeconds: round(cell.seconds, 2),
        teamSeconds: round(teamSeconds, 2),
        netSeconds: round(cell.seconds - teamSeconds, 2)
      });
    }

    // 劣势经济首死：按回合首杀的受害者判定
    const economyByRound = new Map(
      pkg.playerEconomies
        .filter((row) => {
          const player = pkg.players[row.playerIndex];
          return player != null && ids.has(player.steamId64);
        })
        .map((row) => [row.roundNumber, row.type])
    );
    const killsByRound = new Map<number, typeof pkg.kills>();
    for (const kill of pkg.kills) {
      const list = killsByRound.get(kill.roundNumber) ?? [];
      list.push(kill);
      killsByRound.set(kill.roundNumber, list);
    }
    const openingLossByRound = new Map(
      playerRounds
        .filter((row) => row.openingDuel === "lost")
        .map((row) => [row.roundNumber, row])
    );
    const freezeByRound = new Map(pkg.rounds.map((row) => [row.roundNumber, row.freezeEndTick]));
    const roundEconomies = new Map(
      pkg.rounds.map((row) => [row.roundNumber, { a: row.teamAEconomy, b: row.teamBEconomy }])
    );
    const tickrate = pkg.match.tickrate || 64;

    const teamKey = pkg.players.find(player => ids.has(player.steamId64))?.teamKey;
    for (const { roundNumber } of playerRounds) {
      const list = killsByRound.get(roundNumber) ?? [];
      const sorted = [...list].sort((a, b) => a.tick - b.tick);
      const economy = economyByRound.get(roundNumber);
      const pair = roundEconomies.get(roundNumber);
      const opponentEconomy = teamKey === "teamA" ? pair?.b : teamKey === "teamB" ? pair?.a : null;
      const firstDeath = sorted[0];
      const openingLoss = openingLossByRound.get(roundNumber);
      const meFirstDead = openingLoss != null;
      const openingTick = openingLoss?.openingTick ?? firstDeath?.tick ?? null;
      const isLowBuy = economy != null && LOW_BUY_TYPES.has(economy);
      const isFullBuy = economy === "full";
      const isAntiEco = opponentEconomy === "eco" || opponentEconomy === "semi";
      if (isLowBuy) lowBuy.eligibleRoundNumbers.push(roundNumber);
      if (isFullBuy) fullBuy.eligibleRoundNumbers.push(roundNumber);
      if (isAntiEco) antiEco.eligibleRoundNumbers.push(roundNumber);
      if (meFirstDead && isLowBuy) {
        lowBuy.firstDeathRoundNumbers.push(roundNumber);
        lowBuy.evidence.push({ matchId, roundNumber, tick: openingTick, detail: `${economy} 局首死`, reason: `${economy} 局首死`, role: "example" });
      }
      if (meFirstDead && isFullBuy) {
        fullBuy.firstDeathRoundNumbers.push(roundNumber);
        fullBuy.evidence.push({ matchId, roundNumber, tick: openingTick, detail: "长枪局首死", reason: "长枪局首死", role: "example" });
      }
      if (meFirstDead && isAntiEco) {
        antiEco.firstDeathRoundNumbers.push(roundNumber);
        antiEco.evidence.push({ matchId, roundNumber, tick: openingTick, detail: `对手 ${opponentEconomy} 局首死`, reason: `对手 ${opponentEconomy} 局首死`, role: "example" });
      }
      // 死亡时间分布
      for (const kill of sorted) {
        const victim = pkg.players[kill.victimIndex];
        if (!victim || !ids.has(victim.steamId64)) continue;
        const freeze = freezeByRound.get(roundNumber);
        if (freeze == null) continue;
        const seconds = (kill.tick - freeze) / tickrate;
        deathTiming.total += 1;
        if (seconds < DEATH_EARLY_SECONDS) deathTiming.early += 1;
        else if (seconds < DEATH_LATE_SECONDS) deathTiming.mid += 1;
        else deathTiming.late += 1;
      }
    }

    // 残局失利：复用 Core 的 canonical clutch facts；这里仅补证据文案。
    for (const playerRound of playerRounds) {
      const clutch = playerRound.clutch;
      if (!clutch || clutch.won) continue;
      clutchLosses += 1;
      clutchLossEvidence.push({
        matchId,
        roundNumber: playerRound.roundNumber,
        detail: `1v${clutch.opponentCount} 失利（${clutch.killCount} 杀）`,
        reason: `1v${clutch.opponentCount} 残局失利`,
        role: "example"
      });
    }
    for (const stat of [lowBuy, fullBuy, antiEco]) {
      stat.eligibleRoundNumbers = [...new Set(stat.eligibleRoundNumbers)];
      stat.firstDeathRoundNumbers = [...new Set(stat.firstDeathRoundNumbers)];
      stat.evidence = stat.evidence.slice(0, MAX_EVIDENCE);
    }
    return { matchId, mapName: pkg.match.mapName, roundCount: pkg.rounds.length, performance,
      mistakes: { lowBuyFirstDeaths: lowBuy, fullBuyFirstDeaths: fullBuy, antiEcoFirstDeaths: antiEco, deathTiming, clutchLosses: { count: clutchLosses, evidence: clutchLossEvidence.slice(0, MAX_EVIDENCE) } },
      worstTeamFlashes: teamFlashes.sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, MAX_EVIDENCE),
      bestEnemyFlashes: enemyFlashes.sort((a, b) => b.enemySeconds - a.enemySeconds).slice(0, MAX_BEST_FLASH) };
  });
}

export function buildPlayerSeasonInsightsFromFacts(facts: readonly PlayerMatchInsightFacts[], options: { steamIds: readonly string[]; orderedMatchIds: readonly string[] }): PlayerSeasonInsights {
  const selected = new Set(options.steamIds), order = new Map(options.orderedMatchIds.map((id, i) => [id, i]));
  const unique = new Map<string, PlayerMatchInsightFacts>();
  for (const row of facts) {
    if (!selected.has(row.performance.steamId64)) continue;
    if (!order.has(row.matchId)) throw new Error(`Missing ordered match: ${row.matchId}`);
    const key = JSON.stringify([row.matchId, row.performance.steamId64]);
    const previous = unique.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw new Error(`Conflicting insight facts: ${key}`);
    unique.set(key, row);
  }
  const byMatch = new Map<string, PlayerMatchInsightFacts[]>();
  for (const row of unique.values()) {
    const rows = byMatch.get(row.matchId) ?? [];
    if (rows.length && (rows[0]!.mapName !== row.mapName || rows[0]!.roundCount !== row.roundCount)) throw new Error(`Conflicting match metadata: ${row.matchId}`);
    rows.push(row); byMatch.set(row.matchId, rows);
  }
  const rows = [...unique.values()];
  const total = (get: (row: PlayerMatchInsightFacts) => number) => rows.reduce((sum, row) => sum + get(row), 0);
  const flashesThrown = total(r => r.performance.utility.flashesThrown);
  const enemy = total(r => r.performance.utility.enemyBlindSeconds), team = total(r => r.performance.utility.teamBlindSeconds);
  const stat = (key: "lowBuyFirstDeaths" | "fullBuyFirstDeaths" | "antiEcoFirstDeaths") => {
    const eligible = new Set<string>(), deaths = new Set<string>();
    for (const row of rows) {
      for (const n of row.mistakes[key].eligibleRoundNumbers) eligible.add(JSON.stringify([row.matchId, n]));
      for (const n of row.mistakes[key].firstDeathRoundNumbers) deaths.add(JSON.stringify([row.matchId, n]));
    }
    return { attempts: eligible.size, count: deaths.size, evidence: rows.flatMap(r => r.mistakes[key].evidence).slice(0, MAX_EVIDENCE) };
  };
  const trend = [...byMatch].sort(([a], [b]) => order.get(a)! - order.get(b)!).map(([matchId, group]) => {
    const first = group[0]!, sum = (f: (p: PlayerPerformanceAggregate) => number) => group.reduce((n, row) => n + f(row.performance), 0);
    const rounds = Math.max(1, first.roundCount);
    return { matchId, mapName: first.mapName, adr: round(sum(p => p.damage) / rounds, 1), kast: round(sum(p => p.kastRounds) / rounds * 100, 1),
      fkMinusFd: sum(p => p.firstKills - p.firstDeaths), utilityDamagePerRound: round(sum(p => p.utility.utilityDamage) / rounds, 2),
      clutchAttempts: sum(p => p.clutch.attempts), clutchWins: sum(p => p.clutch.wins), kills: sum(p => p.kills), deaths: sum(p => p.deaths) };
  });
  return { trend, flash: { flashesThrown, enemyBlindSeconds: round(enemy, 1), teamBlindSeconds: round(team, 1),
    enemyBlindVictims: total(r => r.performance.utility.enemyBlindVictims), flashAssists: total(r => r.performance.utility.flashAssists),
    enemySecondsPerFlash: flashesThrown ? round(enemy / flashesThrown, 2) : null, netSecondsPerFlash: flashesThrown ? round((enemy - team) / flashesThrown, 2) : null,
    worstTeamFlashes: rows.flatMap(r => r.worstTeamFlashes).sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, MAX_EVIDENCE),
    bestEnemyFlashes: rows.flatMap(r => r.bestEnemyFlashes).sort((a, b) => b.enemySeconds - a.enemySeconds).slice(0, MAX_BEST_FLASH) },
    mistakes: { lowBuyFirstDeaths: stat("lowBuyFirstDeaths"), fullBuyFirstDeaths: stat("fullBuyFirstDeaths"), antiEcoFirstDeaths: stat("antiEcoFirstDeaths"),
      deathTiming: { early: total(r => r.mistakes.deathTiming.early), mid: total(r => r.mistakes.deathTiming.mid), late: total(r => r.mistakes.deathTiming.late), total: total(r => r.mistakes.deathTiming.total) },
      clutchLosses: { count: total(r => r.mistakes.clutchLosses.count), evidence: rows.flatMap(r => r.mistakes.clutchLosses.evidence).slice(0, MAX_EVIDENCE) } } };
}
