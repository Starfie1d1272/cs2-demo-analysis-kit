import type { DemoPackage, MatchWorkspaceModel } from "@cs2dak/contract";
import { round } from "./season-metrics.js";

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
  victimCount: number;
  totalSeconds: number;
}

export interface FlashValueSummary {
  flashesThrown: number;
  enemyBlindSeconds: number;
  teamBlindSeconds: number;
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
  detail: string;
}

export interface MistakeReview {
  /** 低买局（eco/semi/force）中首死的回合。 */
  lowBuyFirstDeaths: { count: number; attempts: number; evidence: MistakeEvidence[] };
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
  const teamFlashes: TeamFlashIncident[] = [];
  const lowBuyEvidence: MistakeEvidence[] = [];
  let lowBuyFirstDeaths = 0;
  let lowBuyAttempts = 0;
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

    // 队闪事件：同 (round, tick±8) 的同投掷者致盲友方行归并为一颗闪
    const teamBlindRows = pkg.blinds.filter(
      (b) => ids.has(b.flasherSteamId64) && b.flasherTeamKey === b.flashedTeamKey && b.flasherSteamId64 !== b.flashedSteamId64
    );
    const grouped = new Map<string, { roundNumber: number; victims: Set<string>; seconds: number }>();
    for (const blind of teamBlindRows) {
      const key = blind.flashId ?? `${blind.roundNumber}-${Math.round(blind.tick / 16)}`;
      const cell = grouped.get(key) ?? { roundNumber: blind.roundNumber, victims: new Set(), seconds: 0 };
      cell.victims.add(blind.flashedSteamId64);
      cell.seconds += blind.durationSeconds;
      grouped.set(key, cell);
    }
    for (const cell of grouped.values()) {
      teamFlashes.push({
        matchId,
        roundNumber: cell.roundNumber,
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
    const tickrate = tickrateOf(pkg);

    for (const [roundNumber, list] of killsByRound) {
      const sorted = [...list].sort((a, b) => a.tick - b.tick);
      const economy = economyByRound.get(roundNumber);
      const firstDeath = sorted[0];
      const isLowBuy = economy != null && LOW_BUY_TYPES.has(economy);
      if (isLowBuy) lowBuyAttempts += 1;
      if (firstDeath && ids.has(firstDeath.victimSteamId64) && isLowBuy) {
        lowBuyFirstDeaths += 1;
        lowBuyEvidence.push({ matchId, roundNumber, detail: `${economy} 局首死` });
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
      netSecondsPerFlash: flashesThrown > 0
        ? round((enemyBlindSeconds - teamBlindSeconds) / flashesThrown, 2)
        : null,
      flashAssists,
      worstTeamFlashes: teamFlashes.slice(0, MAX_EVIDENCE)
    },
    mistakes: {
      lowBuyFirstDeaths: {
        count: lowBuyFirstDeaths,
        attempts: lowBuyAttempts,
        evidence: lowBuyEvidence.slice(0, MAX_EVIDENCE)
      },
      deathTiming,
      clutchLosses: { count: clutchLosses, evidence: clutchLossEvidence.slice(0, MAX_EVIDENCE) }
    }
  };
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

export interface TournamentInsights {
  matchCount: number;
  roundCount: number;
  maps: TournamentMapStat[];
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

  for (const { pkg } of demos) {
    const mapName = pkg.match.mapName;
    const cell = byMap.get(mapName) ?? { matches: 0, rounds: 0, tWins: 0, pistolT: 0, pistolTotal: 0 };
    cell.matches += 1;
    const ordered = [...pkg.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
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
    tWinRatePercent: round((tWins / Math.max(1, totalRounds)) * 100, 1),
    ctWinRatePercent: round(((totalRounds - tWins) / Math.max(1, totalRounds)) * 100, 1),
    pistolConversionPercent: pistolWonRounds > 0
      ? round((pistolConversions / pistolWonRounds) * 100, 1)
      : null
  };
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
