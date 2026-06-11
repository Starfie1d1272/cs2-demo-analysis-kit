import type { DemoPackage, MatchWorkspaceModel, TeamKey } from "@cs2dak/contract";
import { round } from "./season-metrics.js";
import { displayWeaponName } from "./weapons.js";

/**
 * v0.3 洞察派生：个人趋势 / Flash Value / Mistake Review / Buy Quality /
 * 赛事总览。输入是 Studio 已经加载的 {matchId, pkg} 列表（与 cohort 同源），
 * 全部为纯函数派生，不算评分公式、不查数据库。
 *
 * 结论必须可证据化：每条 Mistake / 高光都带 matchId + roundNumber，
 * UI 端可借 onOpenMatch 跳回具体比赛复盘（query-first 原则）。
 */

export interface SeasonInsightsDemo {
  matchId: string;
  pkg: DemoPackage;
}

// ── 个人趋势 ────────────────────────────────────────────────────────────────

export interface PlayerTrendPoint {
  matchId: string;
  mapName: string;
  adr: number;
  kast: number;
  /** 首杀数 - 首死数。 */
  fkMinusFd: number;
  utilityDamagePerRound: number;
  clutchAttempts: number;
  clutchWins: number;
  kills: number;
  deaths: number;
}

// ── Flash Value ─────────────────────────────────────────────────────────────

export interface TeamFlashIncident {
  matchId: string;
  roundNumber: number;
  tick?: number;
  victimCount: number;
  totalSeconds: number;
}

export interface FlashValueSummary {
  flashesThrown: number;
  enemyBlindSeconds: number;
  teamBlindSeconds: number;
  /** 致盲敌方人次（被白的敌人数量累计，不是秒数）。 */
  enemyBlindVictims: number;
  /** 敌方致盲秒数 / 投掷数；没投过闪为 null。 */
  enemySecondsPerFlash: number | null;
  /** (敌方 - 友方) 致盲秒数 / 投掷数；没投过闪为 null。 */
  netSecondsPerFlash: number | null;
  flashAssists: number;
  /** 最严重的队闪事件（按致盲总秒数降序，最多 10 条）。 */
  worstTeamFlashes: TeamFlashIncident[];
}

// ── Mistake Review ──────────────────────────────────────────────────────────

export interface MistakeEvidence {
  matchId: string;
  roundNumber: number;
  tick?: number;
  detail: string;
}

export interface FirstDeathStat {
  count: number;
  attempts: number;
  evidence: MistakeEvidence[];
}

export interface MistakeReview {
  /** 低买局（eco/semi/force）中首死的回合（劣势局风险参考，权重低）。 */
  lowBuyFirstDeaths: FirstDeathStat;
  /** 全枪全弹局（full）首死——最有分析价值的失误信号。 */
  fullBuyFirstDeaths: FirstDeathStat;
  /** Anti-eco 首死：对手 eco/semi 时我方首死。 */
  antiEcoFirstDeaths: FirstDeathStat;
  /** 死亡时间分布（相对 freeze end 的秒数）。 */
  deathTiming: { early: number; mid: number; late: number; total: number };
  /** 残局失利（1vN 没打赢）。 */
  clutchLosses: { count: number; evidence: MistakeEvidence[] };
}

export interface PlayerSeasonInsights {
  trend: PlayerTrendPoint[];
  flash: FlashValueSummary;
  mistakes: MistakeReview;
}

export interface PlayerWeaponStat {
  weapon: string;
  label: string;
  kills: number;
  headshotPercent: number | null;
  killsPerMatch: number;
}

export interface PlayerFlashSummaryInput {
  playerKey: string;
  name: string;
  steamIds: string[];
}

export interface PlayerFlashSummary {
  playerKey: string;
  name: string;
  flashesThrown: number;
  enemyBlindSeconds: number;
  teamBlindSeconds: number;
  enemyBlindVictims: number;
  enemySecondsPerFlash: number | null;
  netSecondsPerFlash: number | null;
  flashAssists: number;
  worstTeamFlashes: TeamFlashIncident[];
}

const DEATH_EARLY_SECONDS = 20;
const DEATH_LATE_SECONDS = 50;
const LOW_BUY_TYPES = new Set(["eco", "semi", "force"]);
const MAX_EVIDENCE = 10;

function tickrateOf(pkg: DemoPackage): number {
  return pkg.match.tickrate ?? 64;
}

/** 单选手跨场洞察。steamIds 来自 PlayerSeasonProfile（cohort 已做身份归并）。 */
export function buildPlayerSeasonInsights(
  demos: SeasonInsightsDemo[],
  steamIds: string[]
): PlayerSeasonInsights {
  const ids = new Set(steamIds);
  const trend: PlayerTrendPoint[] = [];
  let flashesThrown = 0;
  let enemyBlindSeconds = 0;
  let teamBlindSeconds = 0;
  let flashAssists = 0;
  let enemyBlindVictims = 0;
  const teamFlashes: TeamFlashIncident[] = [];
  const lowBuy: FirstDeathStat = { count: 0, attempts: 0, evidence: [] };
  const fullBuy: FirstDeathStat = { count: 0, attempts: 0, evidence: [] };
  const antiEco: FirstDeathStat = { count: 0, attempts: 0, evidence: [] };
  const deathTiming = { early: 0, mid: 0, late: 0, total: 0 };
  const clutchLossEvidence: MistakeEvidence[] = [];
  let clutchLosses = 0;

  for (const { matchId, pkg } of demos) {
    const stats = pkg.playerStats.filter((row) => ids.has(row.steamId64));
    if (stats.length === 0) continue;
    const sum = (f: (row: (typeof stats)[number]) => number) => stats.reduce((acc, row) => acc + f(row), 0);
    const rounds = Math.max(1, ...stats.map((row) => row.rounds));

    const clutchAttempts = sum((r) => r.vsOneCount + r.vsTwoCount + r.vsThreeCount + r.vsFourCount + r.vsFiveCount);
    const clutchWins = sum((r) => r.vsOneWonCount + r.vsTwoWonCount + r.vsThreeWonCount + r.vsFourWonCount + r.vsFiveWonCount);
    trend.push({
      matchId,
      mapName: pkg.match.mapName,
      adr: round(sum((r) => r.damageHealth) / rounds, 1),
      kast: round(sum((r) => r.kast_rounds) / rounds * 100, 1),
      fkMinusFd: sum((r) => r.firstKillCount) - sum((r) => r.firstDeathCount),
      utilityDamagePerRound: round(sum((r) => r.utilityDamage) / rounds, 2),
      clutchAttempts,
      clutchWins,
      kills: sum((r) => r.kills),
      deaths: sum((r) => r.deaths)
    });

    enemyBlindSeconds += sum((r) => r.enemyFlashDurationSeconds);
    teamBlindSeconds += sum((r) => r.teamFlashDurationSeconds);
    flashAssists += sum((r) => r.flashAssistCount);
    flashesThrown += pkg.grenades.filter(
      (g) => g.grenade === "flashbang" && g.throwerSteamId64 != null && ids.has(g.throwerSteamId64)
    ).length;
    enemyBlindVictims += pkg.blinds.filter(
      (b) => ids.has(b.flasherSteamId64) && b.flasherTeamKey !== b.flashedTeamKey
    ).length;

    // 队闪事件：同 (round, tick±8) 的同投掷者致盲友方行归并为一颗闪
    const teamBlindRows = pkg.blinds.filter(
      (b) => ids.has(b.flasherSteamId64) && b.flasherTeamKey === b.flashedTeamKey && b.flasherSteamId64 !== b.flashedSteamId64
    );
    const grouped = new Map<string, { roundNumber: number; tick: number; victims: Set<string>; seconds: number }>();
    for (const blind of teamBlindRows) {
      const key = blind.flashId ?? `${blind.roundNumber}-${Math.round(blind.tick / 16)}`;
      const cell = grouped.get(key) ?? { roundNumber: blind.roundNumber, tick: blind.tick, victims: new Set(), seconds: 0 };
      cell.tick = Math.min(cell.tick, blind.tick);
      cell.victims.add(blind.flashedSteamId64);
      cell.seconds += blind.durationSeconds;
      grouped.set(key, cell);
    }
    for (const cell of grouped.values()) {
      teamFlashes.push({
        matchId,
        roundNumber: cell.roundNumber,
        tick: cell.tick,
        victimCount: cell.victims.size,
        totalSeconds: round(cell.seconds, 2)
      });
    }

    // 低买局首死：按回合首杀的受害者判定
    const economyByRound = new Map(
      pkg.playerEconomies
        .filter((row) => ids.has(row.steamId64))
        .map((row) => [row.roundNumber, row.type])
    );
    const killsByRound = new Map<number, typeof pkg.kills>();
    for (const kill of pkg.kills) {
      const list = killsByRound.get(kill.roundNumber) ?? [];
      list.push(kill);
      killsByRound.set(kill.roundNumber, list);
    }
    const freezeByRound = new Map(pkg.rounds.map((row) => [row.roundNumber, row.freezeEndTick]));
    const roundEconomies = new Map(
      pkg.rounds.map((row) => [row.roundNumber, { a: row.teamAEconomy, b: row.teamBEconomy }])
    );
    const tickrate = tickrateOf(pkg);

    for (const [roundNumber, list] of killsByRound) {
      const sorted = [...list].sort((a, b) => a.tick - b.tick);
      const economy = economyByRound.get(roundNumber);
      // 对手经济：回合行里非我方类型的一侧（两侧相同时无歧义）
      const pair = roundEconomies.get(roundNumber);
      const opponentEconomy =
        economy != null && pair != null ? (economy === pair.a ? pair.b : pair.a) : null;
      const firstDeath = sorted[0];
      const meFirstDead = firstDeath != null && ids.has(firstDeath.victimSteamId64);
      const isLowBuy = economy != null && LOW_BUY_TYPES.has(economy);
      const isFullBuy = economy === "full";
      const isAntiEco = opponentEconomy === "eco" || opponentEconomy === "semi";
      if (isLowBuy) lowBuy.attempts += 1;
      if (isFullBuy) fullBuy.attempts += 1;
      if (isAntiEco) antiEco.attempts += 1;
      if (meFirstDead && isLowBuy) {
        lowBuy.count += 1;
        lowBuy.evidence.push({ matchId, roundNumber, tick: firstDeath.tick, detail: `${economy} 局首死` });
      }
      if (meFirstDead && isFullBuy) {
        fullBuy.count += 1;
        fullBuy.evidence.push({ matchId, roundNumber, tick: firstDeath.tick, detail: "长枪局首死" });
      }
      if (meFirstDead && isAntiEco) {
        antiEco.count += 1;
        antiEco.evidence.push({ matchId, roundNumber, tick: firstDeath.tick, detail: `对手 ${opponentEconomy} 局首死` });
      }
      // 死亡时间分布
      for (const kill of sorted) {
        if (!ids.has(kill.victimSteamId64)) continue;
        const freeze = freezeByRound.get(roundNumber);
        if (freeze == null) continue;
        const seconds = (kill.tick - freeze) / tickrate;
        deathTiming.total += 1;
        if (seconds < DEATH_EARLY_SECONDS) deathTiming.early += 1;
        else if (seconds < DEATH_LATE_SECONDS) deathTiming.mid += 1;
        else deathTiming.late += 1;
      }
    }

    // 残局失利
    for (const clutch of pkg.clutches) {
      if (!ids.has(clutch.clutcherSteamId64) || clutch.won) continue;
      clutchLosses += 1;
      clutchLossEvidence.push({
        matchId,
        roundNumber: clutch.roundNumber,
        detail: `1v${clutch.opponentCount} 失利（${clutch.killCount} 杀）`
      });
    }
  }

  teamFlashes.sort((a, b) => b.totalSeconds - a.totalSeconds);

  return {
    trend,
    flash: {
      flashesThrown,
      enemyBlindSeconds: round(enemyBlindSeconds, 1),
      teamBlindSeconds: round(teamBlindSeconds, 1),
      enemyBlindVictims,
      enemySecondsPerFlash: flashesThrown > 0 ? round(enemyBlindSeconds / flashesThrown, 2) : null,
      netSecondsPerFlash: flashesThrown > 0
        ? round((enemyBlindSeconds - teamBlindSeconds) / flashesThrown, 2)
        : null,
      flashAssists,
      worstTeamFlashes: teamFlashes.slice(0, MAX_EVIDENCE)
    },
    mistakes: {
      lowBuyFirstDeaths: { ...lowBuy, evidence: lowBuy.evidence.slice(0, MAX_EVIDENCE) },
      fullBuyFirstDeaths: { ...fullBuy, evidence: fullBuy.evidence.slice(0, MAX_EVIDENCE) },
      antiEcoFirstDeaths: { ...antiEco, evidence: antiEco.evidence.slice(0, MAX_EVIDENCE) },
      deathTiming,
      clutchLosses: { count: clutchLosses, evidence: clutchLossEvidence.slice(0, MAX_EVIDENCE) }
    }
  };
}

export function buildPlayerWeaponStats(
  demos: SeasonInsightsDemo[],
  steamIds: string[]
): PlayerWeaponStat[] {
  const ids = new Set(steamIds);
  const rows = new Map<string, { weapon: string; kills: number; headshots: number }>();
  let matchCount = 0;
  for (const { pkg } of demos) {
    let appeared = false;
    for (const kill of pkg.kills) {
      if (!kill.killerSteamId64 || !ids.has(kill.killerSteamId64)) continue;
      appeared = true;
      const weapon = kill.weapon || "unknown";
      const row = rows.get(weapon) ?? { weapon, kills: 0, headshots: 0 };
      row.kills += 1;
      if (kill.headshot) row.headshots += 1;
      rows.set(weapon, row);
    }
    if (appeared) matchCount += 1;
  }
  const denominator = Math.max(1, matchCount);
  return [...rows.values()]
    .map((row) => ({
      weapon: row.weapon,
      label: displayWeaponName(row.weapon),
      kills: row.kills,
      headshotPercent: row.kills > 0 ? round((row.headshots / row.kills) * 100, 1) : null,
      killsPerMatch: round(row.kills / denominator, 2)
    }))
    .sort((a, b) => b.kills - a.kills || a.label.localeCompare(b.label));
}

export function buildPlayerFlashSummaries(
  demos: SeasonInsightsDemo[],
  players: PlayerFlashSummaryInput[]
): PlayerFlashSummary[] {
  const bySteamId = new Map<string, PlayerFlashSummaryInput>();
  const rows = new Map<string, {
    playerKey: string;
    name: string;
    flashesThrown: number;
    enemyBlindSeconds: number;
    teamBlindSeconds: number;
    enemyBlindVictims: number;
    flashAssists: number;
    teamFlashes: TeamFlashIncident[];
  }>();

  for (const player of players) {
    rows.set(player.playerKey, {
      playerKey: player.playerKey,
      name: player.name,
      flashesThrown: 0,
      enemyBlindSeconds: 0,
      teamBlindSeconds: 0,
      enemyBlindVictims: 0,
      flashAssists: 0,
      teamFlashes: []
    });
    for (const steamId of player.steamIds) bySteamId.set(steamId, player);
  }

  for (const { matchId, pkg } of demos) {
    for (const stat of pkg.playerStats) {
      const player = bySteamId.get(stat.steamId64);
      if (!player) continue;
      const row = rows.get(player.playerKey)!;
      row.enemyBlindSeconds += stat.enemyFlashDurationSeconds;
      row.teamBlindSeconds += stat.teamFlashDurationSeconds;
      row.flashAssists += stat.flashAssistCount;
    }

    for (const grenade of pkg.grenades) {
      if (grenade.grenade !== "flashbang" || grenade.throwerSteamId64 == null) continue;
      const player = bySteamId.get(grenade.throwerSteamId64);
      if (player) rows.get(player.playerKey)!.flashesThrown += 1;
    }

    const grouped = new Map<string, {
      playerKey: string;
      roundNumber: number;
      tick: number;
      victims: Set<string>;
      seconds: number;
    }>();
    for (const blind of pkg.blinds) {
      const player = bySteamId.get(blind.flasherSteamId64);
      if (!player) continue;
      const row = rows.get(player.playerKey)!;
      if (blind.flasherTeamKey !== blind.flashedTeamKey) {
        row.enemyBlindVictims += 1;
        continue;
      }
      if (blind.flasherSteamId64 === blind.flashedSteamId64) continue;
      const key = `${player.playerKey}:${blind.flashId ?? `${blind.roundNumber}-${Math.round(blind.tick / 16)}`}`;
      const cell = grouped.get(key) ?? {
        playerKey: player.playerKey,
        roundNumber: blind.roundNumber,
        tick: blind.tick,
        victims: new Set<string>(),
        seconds: 0
      };
      cell.tick = Math.min(cell.tick, blind.tick);
      cell.victims.add(blind.flashedSteamId64);
      cell.seconds += blind.durationSeconds;
      grouped.set(key, cell);
    }
    for (const cell of grouped.values()) {
      rows.get(cell.playerKey)!.teamFlashes.push({
        matchId,
        roundNumber: cell.roundNumber,
        tick: cell.tick,
        victimCount: cell.victims.size,
        totalSeconds: round(cell.seconds, 2)
      });
    }
  }

  return [...rows.values()].map((row) => {
    row.teamFlashes.sort((a, b) => b.totalSeconds - a.totalSeconds);
    return {
      playerKey: row.playerKey,
      name: row.name,
      flashesThrown: row.flashesThrown,
      enemyBlindSeconds: round(row.enemyBlindSeconds, 1),
      teamBlindSeconds: round(row.teamBlindSeconds, 1),
      enemyBlindVictims: row.enemyBlindVictims,
      enemySecondsPerFlash: row.flashesThrown > 0 ? round(row.enemyBlindSeconds / row.flashesThrown, 2) : null,
      netSecondsPerFlash: row.flashesThrown > 0
        ? round((row.enemyBlindSeconds - row.teamBlindSeconds) / row.flashesThrown, 2)
        : null,
      flashAssists: row.flashAssists,
      worstTeamFlashes: row.teamFlashes.slice(0, MAX_EVIDENCE)
    };
  });
}

// ── Buy Quality（单场，比赛工作台经济页用）──────────────────────────────────

export interface BuyQualityRow {
  economy: string;
  label: string;
  rounds: number;
  wins: number;
  winRatePercent: number | null;
}

export interface MatchBuyQuality {
  teamA: BuyQualityRow[];
  teamB: BuyQualityRow[];
  /** 手枪局之后一回合（conversion）的胜率。 */
  conversion: { teamA: { rounds: number; wins: number }; teamB: { rounds: number; wins: number } };
}

const ECONOMY_ORDER = ["pistol", "eco", "semi", "force", "full"] as const;
const ECONOMY_LABEL: Record<string, string> = {
  pistol: "手枪局",
  eco: "Eco",
  semi: "半起",
  force: "强起",
  full: "长枪局"
};

export function buildMatchBuyQuality(economy: MatchWorkspaceModel["economy"]): MatchBuyQuality {
  const rowsFor = (teamKey: "teamA" | "teamB"): BuyQualityRow[] =>
    ECONOMY_ORDER.map((type) => {
      const rounds = economy.filter((p) => (teamKey === "teamA" ? p.teamAEconomy : p.teamBEconomy) === type);
      const wins = rounds.filter((p) => p.winnerTeamKey === teamKey).length;
      return {
        economy: type,
        label: ECONOMY_LABEL[type],
        rounds: rounds.length,
        wins,
        winRatePercent: rounds.length > 0 ? round((wins / rounds.length) * 100, 1) : null
      };
    }).filter((row) => row.rounds > 0);

  const conversionFor = (teamKey: "teamA" | "teamB") => {
    const ordered = [...economy].sort((a, b) => a.roundNumber - b.roundNumber);
    let rounds = 0;
    let wins = 0;
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const cur = ordered[i]!;
      const isPistol = (teamKey === "teamA" ? cur.teamAEconomy : cur.teamBEconomy) === "pistol";
      if (!isPistol || cur.winnerTeamKey !== teamKey) continue;
      rounds += 1;
      if (ordered[i + 1]!.winnerTeamKey === teamKey) wins += 1;
    }
    return { rounds, wins };
  };

  return {
    teamA: rowsFor("teamA"),
    teamB: rowsFor("teamB"),
    conversion: { teamA: conversionFor("teamA"), teamB: conversionFor("teamB") }
  };
}

// ── Tournament Dashboard（跨场赛事总览）────────────────────────────────────

export interface TournamentMapStat {
  mapName: string;
  matches: number;
  tWinRatePercent: number;
  ctWinRatePercent: number;
  pistolTWinRatePercent: number | null;
}

export interface TournamentWeaponStat {
  weapon: string;
  label: string;
  kills: number;
  headshotPercent: number | null;
  topPlayerName: string | null;
  topPlayerKills: number;
}

export interface TournamentTeamPistolStat {
  teamName: string;
  pistolRounds: number;
  pistolWins: number;
  winRatePercent: number | null;
  conversionRounds: number;
  conversionWins: number;
  conversionPercent: number | null;
  /** 反转换机会数：对手赢下手枪局且存在下一回合的次数。 */
  breakRounds: number;
  /** 反转换：对手赢手枪局后，该队赢了下一回合的次数。 */
  breakWins: number;
  breakRatePercent: number | null;
}

/**
 * 经济对位胜率（按高低经济重排，跨场聚合时 A/B 队伍无意义）。
 * 手枪局不入矩阵（见手枪局表）；同档对局对称，lowWinRatePercent 为 null。
 */
export interface TournamentEconomyMatrixCell {
  lowEconomy: string;
  highEconomy: string;
  rounds: number;
  lowWinRatePercent: number | null;
}

export interface TournamentEcoUpsetStat {
  teamName: string;
  opportunities: number;
  wins: number;
  winRatePercent: number | null;
}

export interface TournamentManAdvantageStat {
  advantageAlive: number;
  disadvantageAlive: number;
  advantageLabel: string;
  disadvantageLabel: string;
  opportunities: number;
  advantageWins: number;
  advantageConversionPercent: number | null;
  disadvantageWins: number;
  disadvantageConversionPercent: number | null;
}

export interface TournamentInsights {
  matchCount: number;
  roundCount: number;
  maps: TournamentMapStat[];
  weaponKills: TournamentWeaponStat[];
  teamPistols: TournamentTeamPistolStat[];
  economyMatrix: TournamentEconomyMatrixCell[];
  ecoUpsets: TournamentEcoUpsetStat[];
  manAdvantageConversions: TournamentManAdvantageStat[];
  /** 全部回合的 T / CT 胜率（0-100）。 */
  tWinRatePercent: number;
  ctWinRatePercent: number;
  /** 手枪局赢家把下一回合也拿下的比率。 */
  pistolConversionPercent: number | null;
}

export function buildTournamentInsights(demos: SeasonInsightsDemo[]): TournamentInsights {
  let totalRounds = 0;
  let tWins = 0;
  let pistolConversions = 0;
  let pistolWonRounds = 0;
  const byMap = new Map<string, { matches: number; rounds: number; tWins: number; pistolT: number; pistolTotal: number }>();
  const weaponRows = new Map<string, { weapon: string; kills: number; headshots: number; players: Map<string, { name: string; kills: number }> }>();
  const teamPistols = new Map<string, TournamentTeamPistolStat>();
  // 经济档位：低买 → 高买；手枪局单列，不入矩阵
  const ECON_RANK: Record<string, number> = { eco: 0, semi: 1, force: 2, full: 3 };
  const economyMatrix = new Map<string, { lowEconomy: string; highEconomy: string; rounds: number; lowWins: number; symmetric: boolean }>();
  const ecoUpsets = new Map<string, { teamName: string; opportunities: number; wins: number }>();
  const manAdvantage = new Map<string, {
    advantageAlive: number;
    disadvantageAlive: number;
    opportunities: number;
    advantageWins: number;
    disadvantageWins: number;
  }>();

  const teamNameFor = (pkg: DemoPackage, teamKey: "teamA" | "teamB") =>
    teamKey === "teamA" ? (pkg.match.teamA.name ?? "Team A") : (pkg.match.teamB.name ?? "Team B");
  const pistolCell = (teamName: string) => {
    const existing = teamPistols.get(teamName);
    if (existing) return existing;
    const created: TournamentTeamPistolStat = {
      teamName,
      pistolRounds: 0,
      pistolWins: 0,
      winRatePercent: null,
      conversionRounds: 0,
      conversionWins: 0,
      conversionPercent: null,
      breakRounds: 0,
      breakWins: 0,
      breakRatePercent: null
    };
    teamPistols.set(teamName, created);
    return created;
  };
  const ecoCell = (teamName: string) => {
    const existing = ecoUpsets.get(teamName);
    if (existing) return existing;
    const created = { teamName, opportunities: 0, wins: 0 };
    ecoUpsets.set(teamName, created);
    return created;
  };

  for (const { pkg } of demos) {
    const mapName = pkg.match.mapName;
    const cell = byMap.get(mapName) ?? { matches: 0, rounds: 0, tWins: 0, pistolT: 0, pistolTotal: 0 };
    cell.matches += 1;
    const ordered = [...pkg.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
    const playerNameBySteam = new Map(pkg.players.map((player) => [player.steamId64, player.name ?? player.steamId64]));
    const killsByRound = new Map<number, typeof pkg.kills>();
    for (const kill of pkg.kills) {
      const roundKills = killsByRound.get(kill.roundNumber) ?? [];
      roundKills.push(kill);
      killsByRound.set(kill.roundNumber, roundKills);

      const weapon = kill.weapon || "unknown";
      const weaponCell = weaponRows.get(weapon) ?? { weapon, kills: 0, headshots: 0, players: new Map() };
      weaponCell.kills += 1;
      if (kill.headshot) weaponCell.headshots += 1;
      if (kill.killerSteamId64) {
        const playerName = playerNameBySteam.get(kill.killerSteamId64) ?? kill.killerSteamId64;
        const playerCell = weaponCell.players.get(kill.killerSteamId64) ?? { name: playerName, kills: 0 };
        playerCell.kills += 1;
        weaponCell.players.set(kill.killerSteamId64, playerCell);
      }
      weaponRows.set(weapon, weaponCell);
    }
    const playersByTeam = {
      teamA: new Set(pkg.players.filter((player) => player.teamKey === "teamA").map((player) => player.steamId64)),
      teamB: new Set(pkg.players.filter((player) => player.teamKey === "teamB").map((player) => player.steamId64))
    };
    for (let i = 0; i < ordered.length; i += 1) {
      const row = ordered[i]!;
      totalRounds += 1;
      cell.rounds += 1;
      if (row.winnerSide === "t") {
        tWins += 1;
        cell.tWins += 1;
      }
      const isPistol = row.teamAEconomy === "pistol" || row.teamBEconomy === "pistol";
      if (isPistol) {
        cell.pistolTotal += 1;
        if (row.winnerSide === "t") cell.pistolT += 1;
        if (i + 1 < ordered.length) {
          pistolWonRounds += 1;
          if (ordered[i + 1]!.winnerTeamKey === row.winnerTeamKey) pistolConversions += 1;
        }
      }
      const rankA = ECON_RANK[row.teamAEconomy];
      const rankB = ECON_RANK[row.teamBEconomy];
      if (rankA != null && rankB != null) {
        const lowIsA = rankA <= rankB;
        const lowEconomy = lowIsA ? row.teamAEconomy : row.teamBEconomy;
        const highEconomy = lowIsA ? row.teamBEconomy : row.teamAEconomy;
        const matrixKey = `${lowEconomy}:${highEconomy}`;
        const matrixCell = economyMatrix.get(matrixKey) ?? {
          lowEconomy,
          highEconomy,
          rounds: 0,
          lowWins: 0,
          symmetric: rankA === rankB
        };
        matrixCell.rounds += 1;
        if (row.winnerTeamKey === (lowIsA ? "teamA" : "teamB")) matrixCell.lowWins += 1;
        economyMatrix.set(matrixKey, matrixCell);
      }

      const teamAName = teamNameFor(pkg, "teamA");
      const teamBName = teamNameFor(pkg, "teamB");
      if (row.roundNumber === 1 || row.roundNumber === 13 || isPistol) {
        const a = pistolCell(teamAName);
        const b = pistolCell(teamBName);
        a.pistolRounds += 1;
        b.pistolRounds += 1;
        if (row.winnerTeamKey === "teamA") a.pistolWins += 1;
        if (row.winnerTeamKey === "teamB") b.pistolWins += 1;
        const next = ordered[i + 1];
        if (next) {
          const winnerName = teamNameFor(pkg, row.winnerTeamKey);
          const loserName = teamNameFor(pkg, row.winnerTeamKey === "teamA" ? "teamB" : "teamA");
          const winner = pistolCell(winnerName);
          const loser = pistolCell(loserName);
          winner.conversionRounds += 1;
          loser.breakRounds += 1;
          if (next.winnerTeamKey === row.winnerTeamKey) winner.conversionWins += 1;
          else loser.breakWins += 1;
        }
      }

      const aWeak = row.teamAEconomy === "eco" || row.teamAEconomy === "semi";
      const bWeak = row.teamBEconomy === "eco" || row.teamBEconomy === "semi";
      if (aWeak && row.teamBEconomy === "full") {
        const c = ecoCell(teamAName);
        c.opportunities += 1;
        if (row.winnerTeamKey === "teamA") c.wins += 1;
      }
      if (bWeak && row.teamAEconomy === "full") {
        const c = ecoCell(teamBName);
        c.opportunities += 1;
        if (row.winnerTeamKey === "teamB") c.wins += 1;
      }

      collectManAdvantageRound(
        manAdvantage,
        playersByTeam,
        killsByRound.get(row.roundNumber) ?? [],
        row.winnerTeamKey
      );
    }
    byMap.set(mapName, cell);
  }

  return {
    matchCount: demos.length,
    roundCount: totalRounds,
    maps: [...byMap.entries()]
      .map(([mapName, cell]) => ({
        mapName,
        matches: cell.matches,
        tWinRatePercent: round((cell.tWins / Math.max(1, cell.rounds)) * 100, 1),
        ctWinRatePercent: round(((cell.rounds - cell.tWins) / Math.max(1, cell.rounds)) * 100, 1),
        pistolTWinRatePercent: cell.pistolTotal > 0 ? round((cell.pistolT / cell.pistolTotal) * 100, 1) : null
      }))
      .sort((a, b) => b.matches - a.matches),
    weaponKills: [...weaponRows.values()]
      .map((cell) => {
        const topPlayer = [...cell.players.values()].sort((a, b) => b.kills - a.kills)[0];
        return {
          weapon: cell.weapon,
          label: displayWeaponName(cell.weapon),
          kills: cell.kills,
          headshotPercent: cell.kills > 0 ? round((cell.headshots / cell.kills) * 100, 1) : null,
          topPlayerName: topPlayer?.name ?? null,
          topPlayerKills: topPlayer?.kills ?? 0
        };
      })
      .sort((a, b) => b.kills - a.kills)
      .slice(0, 10),
    teamPistols: [...teamPistols.values()]
      .map((row) => ({
        ...row,
        winRatePercent: row.pistolRounds > 0 ? round((row.pistolWins / row.pistolRounds) * 100, 1) : null,
        conversionPercent: row.conversionRounds > 0 ? round((row.conversionWins / row.conversionRounds) * 100, 1) : null,
        breakRatePercent: row.breakRounds > 0 ? round((row.breakWins / row.breakRounds) * 100, 1) : null
      }))
      .sort((a, b) => b.pistolWins - a.pistolWins),
    economyMatrix: [...economyMatrix.values()]
      .map((row) => ({
        lowEconomy: row.lowEconomy,
        highEconomy: row.highEconomy,
        rounds: row.rounds,
        // 同档对局对称，没有“低经济方”可言
        lowWinRatePercent: !row.symmetric && row.rounds > 0 ? round((row.lowWins / row.rounds) * 100, 1) : null
      }))
      .sort((a, b) => b.rounds - a.rounds),
    ecoUpsets: [...ecoUpsets.values()]
      .map((row) => ({
        teamName: row.teamName,
        opportunities: row.opportunities,
        wins: row.wins,
        winRatePercent: row.opportunities > 0 ? round((row.wins / row.opportunities) * 100, 1) : null
      }))
      .sort((a, b) => b.wins - a.wins || b.opportunities - a.opportunities),
    manAdvantageConversions: [...manAdvantage.values()]
      .map((row) => ({
        ...row,
        advantageLabel: `${row.advantageAlive}v${row.disadvantageAlive}`,
        disadvantageLabel: `${row.disadvantageAlive}v${row.advantageAlive}`,
        advantageConversionPercent: row.opportunities > 0 ? round((row.advantageWins / row.opportunities) * 100, 1) : null,
        disadvantageConversionPercent: row.opportunities > 0 ? round((row.disadvantageWins / row.opportunities) * 100, 1) : null
      }))
      .sort((a, b) => b.advantageAlive - a.advantageAlive || b.disadvantageAlive - a.disadvantageAlive),
    tWinRatePercent: round((tWins / Math.max(1, totalRounds)) * 100, 1),
    ctWinRatePercent: round(((totalRounds - tWins) / Math.max(1, totalRounds)) * 100, 1),
    pistolConversionPercent: pistolWonRounds > 0
      ? round((pistolConversions / pistolWonRounds) * 100, 1)
      : null
  };
}

const MAN_ADVANTAGE_TARGETS = new Set(["5:4", "5:3"]);

function collectManAdvantageRound(
  rows: Map<string, {
    advantageAlive: number;
    disadvantageAlive: number;
    opportunities: number;
    advantageWins: number;
    disadvantageWins: number;
  }>,
  playersByTeam: Record<TeamKey, Set<string>>,
  kills: DemoPackage["kills"],
  winnerTeamKey: TeamKey
): void {
  const alive: Record<TeamKey, Set<string>> = {
    teamA: new Set(playersByTeam.teamA),
    teamB: new Set(playersByTeam.teamB)
  };
  const seen = new Set<string>();
  for (const kill of [...kills].sort((a, b) => a.tick - b.tick)) {
    alive[kill.victimTeamKey].delete(kill.victimSteamId64);
    const teamAAlive = alive.teamA.size;
    const teamBAlive = alive.teamB.size;
    if (teamAAlive === teamBAlive) continue;

    const advantageAlive = Math.max(teamAAlive, teamBAlive);
    const disadvantageAlive = Math.min(teamAAlive, teamBAlive);
    const key = `${advantageAlive}:${disadvantageAlive}`;
    if (!MAN_ADVANTAGE_TARGETS.has(key) || seen.has(key)) continue;
    seen.add(key);

    const row = rows.get(key) ?? {
      advantageAlive,
      disadvantageAlive,
      opportunities: 0,
      advantageWins: 0,
      disadvantageWins: 0
    };
    row.opportunities += 1;
    const advantageTeam: TeamKey = teamAAlive > teamBAlive ? "teamA" : "teamB";
    if (winnerTeamKey === advantageTeam) row.advantageWins += 1;
    else row.disadvantageWins += 1;
    rows.set(key, row);
  }
}

// ── 赛事报表（Markdown）─────────────────────────────────────────────────────

/** 单场比赛报告：half-by-half、关键回合、记分板。给主办方发布用。 */
export function buildMatchReportMarkdown(model: MatchWorkspaceModel): string {
  const lines: string[] = [];
  lines.push(`# ${model.title}`);
  lines.push("");
  lines.push(`**${model.mapName}** · 比分 **${model.scoreline}**`);
  lines.push("");
  for (const beat of model.overview.story) {
    lines.push(`> ${beat}`);
  }
  lines.push("");
  lines.push("## 记分板");
  lines.push("");
  lines.push("| 选手 | 队伍 | K/D/A | ADR | KAST | RR |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of model.scoreboard) {
    const teamName = row.teamKey === "teamA" ? model.teams.teamA.name : model.teams.teamB.name;
    lines.push(
      `| ${row.name} | ${teamName} | ${row.kills}/${row.deaths}/${row.assists} | ${row.adr.toFixed(1)} | ${row.kast.toFixed(1)}% | ${row.accountRR.toFixed(2)} |`
    );
  }
  lines.push("");
  lines.push("## 关键回合");
  lines.push("");
  const keyRounds = model.rounds.filter(
    (row) => row.facets && (row.facets.clutch || row.facets.maxKillsByOnePlayer >= 3)
  );
  if (keyRounds.length === 0) {
    lines.push("（本场无 3+ 多杀或残局回合）");
  }
  for (const row of keyRounds) {
    const tags: string[] = [];
    if (row.facets?.clutch) {
      tags.push(`1v${row.facets.clutch.opponentCount} 残局${row.facets.clutch.won ? "成功" : "失败"}`);
    }
    if ((row.facets?.maxKillsByOnePlayer ?? 0) >= 3) {
      tags.push(`${row.facets!.maxKillsByOnePlayer} 杀回合`);
    }
    lines.push(`- **R${row.roundNumber}**（${row.scoreBefore}，${row.winnerSide.toUpperCase()} 胜）：${tags.join("、")}`);
  }
  lines.push("");
  lines.push("## 经济与回合");
  lines.push("");
  lines.push("| 回合 | 比分 | 胜方 | A 队经济 | B 队经济 | 结束方式 |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of model.rounds) {
    lines.push(
      `| R${row.roundNumber} | ${row.scoreBefore} | ${row.winnerSide.toUpperCase()} | ${row.teamAEconomy} | ${row.teamBEconomy} | ${row.endReason} |`
    );
  }
  lines.push("");
  lines.push(`---\n由 DAK Studio 生成 · cs2-demo-analysis-kit`);
  return lines.join("\n");
}
