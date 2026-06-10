import {
  matchWorkspaceModelSchema,
  type AnalysisBundle,
  type DemoPackage,
  type EconomyPoint,
  type HeatmapPoint,
  type MatchWorkspaceModel,
  type PlayerScoreboardRow,
  type TeamKey,
  type WorkspaceKillEvent,
  type WorkspaceReplayFrame,
  type WorkspaceSpatialPoint
} from "@cs2dak/contract";
import { groupBy, nameForSteamId, round, normalizeWeapon, isNamedWeapon } from "./workspace-utils.js";
import { displayWeaponName } from "./weapons.js";
import { analyzeDemoPackage, normalizeDemoPackage } from "@cs2dak/core";
import { getMapCalibration } from "@cs2dak/maps";

export function buildDemoViewModel(bundle: AnalysisBundle) {
  return {
    title: `${bundle.teams.teamA.name} vs ${bundle.teams.teamB.name}`,
    subtitle: `${bundle.mapName} · ${bundle.scoreboard.length} 名选手 · ${bundle.economy.length} 回合`,
    map: {
      name: bundle.mapName,
      radarImageUrl: radarImageUrlForMap(bundle.mapName),
      calibrated: bundle.heatmap.length > 0
    },
    scoreline: `${bundle.teams.teamA.score}:${bundle.teams.teamB.score}`,
    teams: bundle.teams,
    scoreboard: bundle.scoreboard,
    playerIndicators: bundle.playerIndicators,
    playerRoundFacts: bundle.playerRoundFacts,
    timeline: bundle.timeline,
    economy: bundle.economy,
    heatmap: bundle.heatmap,
    qa: bundle.qa
  };
}

export function buildMatchWorkspaceModel(input: unknown): MatchWorkspaceModel {
  const pkg = normalizeDemoPackage(input);
  const bundle = analyzeDemoPackage(pkg);

  const view = buildDemoViewModel(bundle);
  const eventsByRound = groupBy(bundle.timeline, (event) => event.roundNumber);
  const factsByRound = groupBy(bundle.playerRoundFacts, (fact) => fact.roundNumber);
  const factsByPlayer = groupBy(bundle.playerRoundFacts, (fact) => fact.steamId64);
  const teamNames = {
    teamA: bundle.teams.teamA.name,
    teamB: bundle.teams.teamB.name
  };

  return matchWorkspaceModelSchema.parse({
    version: "cs2-demo-analysis-kit/workspace-0.1",
    sourceSchemaVersion: bundle.sourceSchemaVersion,
    title: view.title,
    subtitle: view.subtitle,
    scoreline: view.scoreline,
    mapName: bundle.mapName,
    teams: bundle.teams,
    tabs: [
      { key: "overview", label: "总览" },
      { key: "rounds", label: "回合" },
      { key: "players", label: "选手" },
      { key: "economy", label: "经济" },
      { key: "weapons", label: "武器" },
      { key: "duels", label: "对位" },
      { key: "map", label: "地图" },
      { key: "replay", label: "回放" }
    ],
    overview: {
      kpis: buildWorkspaceKpis(bundle),
      story: buildWorkspaceStory(bundle, pkg)
    },
    scoreboard: bundle.scoreboard,
    rounds: pkg.rounds.map((roundRow) => ({
      roundNumber: roundRow.roundNumber,
      scoreBefore: `${roundRow.teamAScoreBefore}:${roundRow.teamBScoreBefore}`,
      winnerTeamKey: roundRow.winnerTeamKey,
      winnerSide: roundRow.winnerSide,
      endReason: roundRow.endReason,
      teamAEconomy: roundRow.teamAEconomy,
      teamBEconomy: roundRow.teamBEconomy,
      events: eventsByRound.get(roundRow.roundNumber) ?? [],
      playerFacts: factsByRound.get(roundRow.roundNumber) ?? []
    })),
    players: bundle.scoreboard.map((row) => ({
      row,
      teamName: teamNames[row.teamKey],
      summary: buildPlayerSummary(row),
      rrBreakdown: [
        { key: "combat", label: "Combat", value: row.accountBreakdown.combat },
        { key: "trade", label: "Trade", value: row.accountBreakdown.trade },
        { key: "mapControl", label: "MapControl", value: row.accountBreakdown.mapControl },
        { key: "clutch", label: "Clutch", value: row.accountBreakdown.clutch },
        { key: "objective", label: "Objective", value: row.accountBreakdown.objective },
        { key: "utility", label: "Utility", value: row.accountBreakdown.utility }
      ],
      roundFacts: factsByPlayer.get(row.steamId64) ?? []
    })),
    economy: bundle.economy,
    weapons: buildWorkspaceWeapons(pkg),
    duels: buildWorkspaceDuels(pkg, bundle),
    map: buildWorkspaceMap(pkg, view.map, bundle.heatmap),
    replay: buildWorkspaceReplay(pkg),
    adminQa: bundle.qa
  });
}

/** 比赛级武器统计：击杀来自 kills.json，伤害来自 damages.json（healthDamage 口径）。 */
function buildWorkspaceWeapons(pkg: DemoPackage) {
  const killsByWeapon = groupBy(
    pkg.kills.filter((kill) => isNamedWeapon(kill.weapon)),
    (kill) => normalizeWeapon(kill.weapon)
  );
  const damageByWeapon = new Map<string, number>();
  for (const damage of pkg.damages) {
    if (!isNamedWeapon(damage.weapon)) continue;
    const key = normalizeWeapon(damage.weapon);
    damageByWeapon.set(key, (damageByWeapon.get(key) ?? 0) + damage.healthDamage);
  }

  return [...killsByWeapon.entries()]
    .map(([weapon, kills]) => {
      const killerCounts = new Map<string, number>();
      for (const kill of kills) {
        if (kill.killerSteamId64) {
          killerCounts.set(kill.killerSteamId64, (killerCounts.get(kill.killerSteamId64) ?? 0) + 1);
        }
      }
      const topKiller = [...killerCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
      const headshots = kills.filter((kill) => kill.headshot).length;
      return {
        weapon,
        label: displayWeaponName(weapon),
        kills: kills.length,
        headshotPercent: kills.length > 0 ? round((headshots / kills.length) * 100, 1) : null,
        damage: damageByWeapon.get(weapon) ?? 0,
        wallbangKills: kills.filter((kill) => kill.penetratedObjects > 0).length,
        noScopeKills: kills.filter((kill) => kill.noScope).length,
        throughSmokeKills: kills.filter((kill) => kill.throughSmoke).length,
        topKillerName: topKiller ? nameForSteamId(pkg, topKiller[0]) : null,
        topKillerKills: topKiller ? topKiller[1] : 0
      };
    })
    .sort((a, b) => b.kills - a.kills);
}

/** 对位：10x10 击杀矩阵（teamA 在前）+ 开局对枪统计（来自 playerRoundFacts）。 */
function buildWorkspaceDuels(pkg: DemoPackage, bundle: AnalysisBundle) {
  const players = [...bundle.scoreboard]
    .sort((a, b) => (a.teamKey === b.teamKey ? b.accountRR - a.accountRR : a.teamKey === "teamA" ? -1 : 1))
    .map((row) => ({ steamId64: row.steamId64, name: row.name, teamKey: row.teamKey }));
  const indexBySteamId = new Map(players.map((player, index) => [player.steamId64, index]));

  const matrix = players.map(() => players.map(() => 0));
  for (const kill of pkg.kills) {
    if (!kill.killerSteamId64) continue;
    const killerIndex = indexBySteamId.get(kill.killerSteamId64);
    const victimIndex = indexBySteamId.get(kill.victimSteamId64);
    if (killerIndex == null || victimIndex == null) continue;
    matrix[killerIndex][victimIndex] += 1;
  }

  const factsByPlayer = groupBy(bundle.playerRoundFacts, (fact) => fact.steamId64);
  const openings = players.map((player) => {
    const facts = factsByPlayer.get(player.steamId64) ?? [];
    const openingKills = facts.filter((fact) => fact.openingDuel === "won").length;
    const openingDeaths = facts.filter((fact) => fact.openingDuel === "lost").length;
    const total = openingKills + openingDeaths;
    return {
      ...player,
      openingKills,
      openingDeaths,
      winRatePercent: total > 0 ? round((openingKills / total) * 100, 1) : null
    };
  });

  return { players, matrix, openings };
}

function radarImageUrlForMap(mapName: string): string | null {
  // 有标定即有底图：apps 的 public/maps/radars/ 与 MAP_CALIBRATIONS 保持同套地图。
  // Relative path so it resolves from both http:// dev server and file:// pywebview.
  return getMapCalibration(mapName) ? `./maps/radars/${mapName}.png` : null;
}

function buildWorkspaceKpis(bundle: AnalysisBundle) {
  const topRR = bundle.scoreboard[0];
  const topAdr = [...bundle.scoreboard].sort((a, b) => b.adr - a.adr)[0];
  const tradedDeaths = bundle.scoreboard.reduce((sum, row) => sum + row.tradeKills, 0);
  const roundCount = bundle.economy.length;

  return [
    {
      key: "topRR",
      label: "最高 V2 RR",
      value: topRR ? topRR.accountRR.toFixed(3) : "0.000",
      detail: topRR?.name ?? "暂无选手"
    },
    {
      key: "topADR",
      label: "最高 ADR",
      value: topAdr ? topAdr.adr.toFixed(1) : "0.0",
      detail: topAdr?.name ?? "暂无选手"
    },
    {
      key: "roundCount",
      label: "总回合数",
      value: roundCount.toString(),
      detail: `${bundle.teams.teamA.score}:${bundle.teams.teamB.score}`
    },
    {
      key: "tradeActivity",
      label: "补枪参与",
      value: tradedDeaths.toString(),
      detail: "来自 player-stats / kills"
    }
  ];
}

// ── 比赛叙事（overview.story）────────────────────────────────────────────
// 采用「候选 beat 池 + 显著度择优」：每个生成器产出一条候选，按显著度排序取前
// MAX_STORY_BEATS 条；开场 beat 强制置顶，选手类 beat 最多占 MAX_PLAYER_BEATS 条，
// 显著度低于阈值的不强凑。文案为解说式口语。

const MAX_STORY_BEATS = 6;
const MAX_PLAYER_BEATS = 2;
const MIN_BEAT_SALIENCE = 0.2;
const PLAYER_BEAT_KEYS = new Set(["mvp", "entry", "clutch"]);

const MAP_DISPLAY_NAMES: Record<string, string> = {
  de_ancient: "Ancient",
  de_anubis: "Anubis",
  de_dust2: "Dust2",
  de_inferno: "Inferno",
  de_mirage: "Mirage",
  de_nuke: "Nuke",
  de_overpass: "Overpass",
  de_train: "Train",
  de_vertigo: "Vertigo"
};

function mapDisplayName(mapName: string): string {
  return MAP_DISPLAY_NAMES[mapName] ?? mapName.replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase());
}

function sideLabelZh(side: "ct" | "t" | null): string {
  return side === "ct" ? "CT" : "T";
}

// ── 文案模板（集中管理，改词只动这里）─────────────────────────────────────
// 上面的 beat 生成器只负责算数据、决定走哪个分支；具体「怎么说」全部收在这里。
// 想调措辞、换口吻、改用词，编辑这个对象即可，无需碰逻辑。
const STORY_COPY = {
  headline: {
    /** 比分差 → 动词。 */
    verb: (margin: number) => (margin >= 8 ? "碾压" : margin <= 2 ? "险胜" : "拿下"),
    comeback: (firstHalf: number, secondHalf: number) =>
      `上半场只拿到 ${firstHalf} 分被压着打，换边后连下 ${secondHalf} 分完成翻盘`,
    frontRunner: (firstHalf: number, secondHalf: number) =>
      `上半场就先声夺人拿下 ${firstHalf} 分，下半场再补 ${secondHalf} 分锁死悬念`,
    even: (firstHalf: number, secondHalf: number) =>
      `上半场拿 ${firstHalf} 分、下半场再添 ${secondHalf} 分`,
    overtime: (overtimeWins: number) => `，加时又咬下 ${overtimeWins} 分才分出胜负`,
    line: (mapName: string, winner: string, winnerScore: number, loserScore: number, verb: string, loser: string, half: string, overtime: string) =>
      `${mapName} 一图，${winner} ${winnerScore}:${loserScore} ${verb} ${loser}——${half}${overtime}。`
  },
  momentum: {
    /** 连胜的攻防上下文短语；非赢家或无 side 时返回空串。 */
    context: (sideLabel: string, crossSwitch: boolean, ownedByWinner: boolean) =>
      !ownedByWinner ? "" : crossSwitch ? "横跨换边" : `靠 ${sideLabel} 半场`,
    line: (startRound: number, endRound: number, length: number, team: string, context: string) =>
      `真正拉开差距的是 R${startRound}-R${endRound} 那波 ${length} 连胜，${team}${context}借此锁定胜局。`
  },
  pistol: {
    sweep: "这场比赛几乎已经拿下一半。",
    none: "这场胜利完全是靠后面一分分追回来的。",
    split: "另一个交还给对手，靠后续长枪局把节奏拉了回来。",
    line: (total: number, winner: string, wins: number, tail: string) =>
      `${total} 个手枪局 ${winner} 拿下 ${wins} 个，${tail}`
  },
  clutch: {
    line: (who: string, teamTag: string, round: number, opponents: number) =>
      `最精彩的残局是 ${who}${teamTag}在 R${round} 的 1v${opponents} 残局翻盘，这种回合最能鼓舞士气。`
  },
  entry: {
    line: (name: string, entryKills: number) =>
      `${name} 是队里首杀最多的选手，${entryKills} 次首杀大多由他先行完成。`
  },
  lowBuy: {
    line: (winner: string, count: number, round: number) =>
      `${winner} 还在 ${count} 个eco或半起中完成了对对手的翻盘（如 R${round}），这种以弱胜强是对对手经济的严重打击。`
  },
  closeout: {
    reason: {
      target_bombed: "C4爆炸",
      bomb_defused: "拆弹",
      t_win: "正面歼灭",
      ct_win: "正面歼灭",
      target_saved: "拖到时间耗尽"
    } as Record<string, string>,
    line: (winner: string, count: number, total: number, reason: string) =>
      `${winner} 的胜局里有 ${count}/${total} 个靠${reason}收尾，打法偏好相当鲜明。`
  },
  mvp: {
    dom: {
      combat: "纯粹的枪法压制",
      trade: "默契的补枪联动",
      mapControl: "地图空间的控制",
      clutch: "残局里的收割能力",
      objective: "对包点目标的推进",
      utility: "道具开路的支援"
    } as Record<string, string>,
    winnerAdrTail: (name: string, adr: string) => `；场均伤害最高的则是 ${name}（ADR ${adr}）`,
    winner: (name: string, kda: string, adr: string, rr: string, dom: string, adrTail: string) =>
      `胜者这边 ${name} 打得最稳，${kda}、场均 ${adr} 伤害，全场最高的 RR ${rr} 主要来自${dom}${adrTail}。`,
    loser: (rr: string, kda: string, name: string, team: string, dom: string) =>
      `值得一提的是，全场 RR 最高（${rr}，${kda}）的 ${name} 来自落败的 ${team}，凭${dom}撑起了大部分火力，可惜独木难支。`
  }
} as const;

interface StoryBeat {
  key: string;
  available: boolean;
  salience: number;
  text: string;
}

interface StoryContext {
  bundle: AnalysisBundle;
  pkg: DemoPackage;
  mapName: string;
  winnerKey: TeamKey;
  loserKey: TeamKey;
  winner: AnalysisBundle["teams"]["teamA"];
  loser: AnalysisBundle["teams"]["teamA"];
  /** 赢家在某回合所站的边（ct/t）。 */
  sideOfWinner: (roundNumber: number) => "ct" | "t" | null;
  /** 赢家 CT 半 / T 半各赢多少分（跨加时聚合，靠 per-round side 判定）。 */
  ctWins: number;
  tWins: number;
  /** 真实换边后的上/下半场与加时赢分（赢家视角）。 */
  firstHalfWins: number;
  secondHalfWins: number;
  overtimeWins: number;
  hasOvertime: boolean;
}

function buildStoryContext(bundle: AnalysisBundle, pkg: DemoPackage): StoryContext {
  const winnerKey: TeamKey = bundle.teams.teamA.score >= bundle.teams.teamB.score ? "teamA" : "teamB";
  const loserKey: TeamKey = winnerKey === "teamA" ? "teamB" : "teamA";

  const roundsByNumber = new Map(pkg.rounds.map((roundRow) => [roundRow.roundNumber, roundRow]));
  const sideOfWinner = (roundNumber: number): "ct" | "t" | null => {
    const roundRow = roundsByNumber.get(roundNumber);
    if (!roundRow) return null;
    return winnerKey === "teamA" ? roundRow.teamASide : roundRow.teamBSide;
  };

  // 找真实换边点：side 相对上一回合翻转处即为换边。
  const ordered = [...bundle.economy].sort((a, b) => a.roundNumber - b.roundNumber);
  const switchRounds: number[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    if (sideOfWinner(ordered[index]!.roundNumber) !== sideOfWinner(ordered[index - 1]!.roundNumber)) {
      switchRounds.push(ordered[index]!.roundNumber);
    }
  }
  const firstSwitch = switchRounds[0] ?? Infinity;
  const overtimeStart = 25; // CS2 常规局 24 回合，加时从 R25 起。

  let ctWins = 0;
  let tWins = 0;
  let firstHalfWins = 0;
  let secondHalfWins = 0;
  let overtimeWins = 0;
  for (const point of ordered) {
    if (point.winnerTeamKey !== winnerKey) continue;
    const side = sideOfWinner(point.roundNumber);
    if (side === "ct") ctWins += 1;
    else if (side === "t") tWins += 1;
    if (point.roundNumber >= overtimeStart) overtimeWins += 1;
    else if (point.roundNumber < firstSwitch) firstHalfWins += 1;
    else secondHalfWins += 1;
  }

  return {
    bundle,
    pkg,
    mapName: mapDisplayName(bundle.mapName),
    winnerKey,
    loserKey,
    winner: bundle.teams[winnerKey],
    loser: bundle.teams[loserKey],
    sideOfWinner,
    ctWins,
    tWins,
    firstHalfWins,
    secondHalfWins,
    overtimeWins,
    hasOvertime: ordered.some((point) => point.roundNumber >= overtimeStart)
  };
}

function buildWorkspaceStory(bundle: AnalysisBundle, pkg: DemoPackage): string[] {
  const ctx = buildStoryContext(bundle, pkg);
  const candidates = [
    headlineBeat(ctx),
    momentumBeat(ctx),
    pistolBeat(ctx),
    clutchBeat(ctx),
    entryBeat(ctx),
    lowBuyBeat(ctx),
    closeoutBeat(ctx),
    mvpBeat(ctx)
  ].filter((beat): beat is StoryBeat => beat !== null && beat.available);

  const headline = candidates.find((beat) => beat.key === "headline");
  const rest = candidates
    .filter((beat) => beat.key !== "headline" && beat.salience >= MIN_BEAT_SALIENCE)
    .sort((a, b) => b.salience - a.salience);

  // 选手类 beat 限流，避免整段都在夸人。
  let playerCount = 0;
  const picked: StoryBeat[] = [];
  for (const beat of rest) {
    if (PLAYER_BEAT_KEYS.has(beat.key)) {
      if (playerCount >= MAX_PLAYER_BEATS) continue;
      playerCount += 1;
    }
    picked.push(beat);
  }

  return [headline, ...picked]
    .filter((beat): beat is StoryBeat => beat !== undefined)
    .slice(0, MAX_STORY_BEATS)
    .map((beat) => beat.text);
}

function headlineBeat(ctx: StoryContext): StoryBeat {
  const { winner, loser, mapName } = ctx;
  const verb = STORY_COPY.headline.verb(winner.score - loser.score);
  let half: string;
  if (ctx.firstHalfWins <= 4 && ctx.secondHalfWins > ctx.firstHalfWins) {
    half = STORY_COPY.headline.comeback(ctx.firstHalfWins, ctx.secondHalfWins);
  } else if (ctx.firstHalfWins >= 9) {
    half = STORY_COPY.headline.frontRunner(ctx.firstHalfWins, ctx.secondHalfWins);
  } else {
    half = STORY_COPY.headline.even(ctx.firstHalfWins, ctx.secondHalfWins);
  }
  const overtime = ctx.hasOvertime ? STORY_COPY.headline.overtime(ctx.overtimeWins) : "";
  return {
    key: "headline",
    available: true,
    salience: 1,
    text: STORY_COPY.headline.line(mapName, winner.name, winner.score, loser.score, verb, loser.name, half, overtime)
  };
}

function momentumBeat(ctx: StoryContext): StoryBeat | null {
  const run = longestWinRun(ctx.bundle.economy);
  if (run.length < 4) return null;
  const team = run.teamKey === "teamA" ? ctx.bundle.teams.teamA.name : ctx.bundle.teams.teamB.name;
  const total = ctx.bundle.teams.teamA.score + ctx.bundle.teams.teamB.score;
  const startSide = ctx.sideOfWinner(run.startRound);
  const endSide = ctx.sideOfWinner(run.endRound);
  const ownedByWinner = run.teamKey === ctx.winnerKey;
  const crossSwitch = ownedByWinner && startSide !== null && endSide !== null && startSide !== endSide;
  const context = STORY_COPY.momentum.context(sideLabelZh(startSide), crossSwitch, ownedByWinner);
  return {
    key: "momentum",
    available: true,
    salience: Math.min(0.95, run.length / total + 0.2),
    text: STORY_COPY.momentum.line(run.startRound, run.endRound, run.length, team, context)
  };
}

function pistolBeat(ctx: StoryContext): StoryBeat | null {
  const pistols = ctx.bundle.economy.filter(
    (roundRow) => roundRow.teamAEconomy === "pistol" || roundRow.teamBEconomy === "pistol"
  );
  if (pistols.length === 0) return null;
  const wins = pistols.filter((roundRow) => roundRow.winnerTeamKey === ctx.winnerKey).length;
  const tail = wins === pistols.length ? STORY_COPY.pistol.sweep : wins === 0 ? STORY_COPY.pistol.none : STORY_COPY.pistol.split;
  return {
    key: "pistol",
    available: true,
    salience: wins === pistols.length ? 0.7 : wins === 0 ? 0.55 : 0.45,
    text: STORY_COPY.pistol.line(pistols.length, ctx.winner.name, wins, tail)
  };
}

function clutchBeat(ctx: StoryContext): StoryBeat | null {
  const won = ctx.pkg.clutches.filter((row) => row.won && (row.opponentCount ?? 0) >= 2);
  if (won.length === 0) return null;
  const top = [...won].sort((a, b) => (b.opponentCount ?? 0) - (a.opponentCount ?? 0))[0]!;
  const player = ctx.pkg.players.find((row) => row.steamId64 === top.clutcherSteamId64);
  const who = player?.name ?? "某选手";
  const teamName = player
    ? player.teamKey === "teamA"
      ? ctx.bundle.teams.teamA.name
      : ctx.bundle.teams.teamB.name
    : null;
  const teamTag = teamName ? `（${teamName}）` : "";
  return {
    key: "clutch",
    available: true,
    salience: 0.4 + (top.opponentCount ?? 2) * 0.12,
    text: STORY_COPY.clutch.line(who, teamTag, top.roundNumber, top.opponentCount)
  };
}

function entryBeat(ctx: StoryContext): StoryBeat | null {
  const topEntry = [...ctx.bundle.scoreboard].sort((a, b) => b.entryKills - a.entryKills)[0];
  // 与 MVP 撞人就让位给 MVP（同一人不重复出两条）。
  if (!topEntry || topEntry.entryKills < 3 || topEntry.steamId64 === ctx.bundle.scoreboard[0]?.steamId64) {
    return null;
  }
  return {
    key: "entry",
    available: true,
    salience: 0.3 + topEntry.entryKills * 0.05,
    text: STORY_COPY.entry.line(topEntry.name, topEntry.entryKills)
  };
}

function lowBuyBeat(ctx: StoryContext): StoryBeat | null {
  const steals = ctx.bundle.economy.filter((roundRow) => {
    const winnerEconomy = ctx.winnerKey === "teamA" ? roundRow.teamAEconomy : roundRow.teamBEconomy;
    const loserEconomy = ctx.winnerKey === "teamA" ? roundRow.teamBEconomy : roundRow.teamAEconomy;
    return roundRow.winnerTeamKey === ctx.winnerKey && ["eco", "semi", "force"].includes(winnerEconomy) && loserEconomy === "full";
  });
  if (steals.length === 0) return null;
  return {
    key: "lowBuy",
    available: true,
    salience: 0.25 + steals.length * 0.08,
    text: STORY_COPY.lowBuy.line(ctx.winner.name, steals.length, steals[0]!.roundNumber)
  };
}

function closeoutBeat(ctx: StoryContext): StoryBeat | null {
  const winnerRounds = ctx.pkg.rounds.filter((roundRow) => roundRow.winnerTeamKey === ctx.winnerKey);
  if (winnerRounds.length === 0) return null;
  const byReason = new Map<string, number>();
  for (const roundRow of winnerRounds) {
    byReason.set(roundRow.endReason, (byReason.get(roundRow.endReason) ?? 0) + 1);
  }
  const [reason, count] = [...byReason.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const ratio = count / winnerRounds.length;
  if (ratio < 0.5) return null;
  return {
    key: "closeout",
    available: true,
    salience: ratio - 0.25,
    text: STORY_COPY.closeout.line(ctx.winner.name, count, winnerRounds.length, STORY_COPY.closeout.reason[reason] ?? reason)
  };
}

function mvpBeat(ctx: StoryContext): StoryBeat | null {
  const top = ctx.bundle.scoreboard[0];
  if (!top) return null;
  const domKey = (Object.entries(top.accountBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0]) ?? "combat";
  const dom = STORY_COPY.mvp.dom[domKey] ?? STORY_COPY.mvp.dom.combat!;
  const kda = `${top.kills}/${top.deaths}/${top.assists}`;
  const rr = top.accountRR.toFixed(2);
  if (top.teamKey === ctx.winnerKey) {
    const topAdr = [...ctx.bundle.scoreboard].sort((a, b) => b.adr - a.adr)[0];
    const adrTail = topAdr && topAdr.steamId64 !== top.steamId64
      ? STORY_COPY.mvp.winnerAdrTail(topAdr.name, topAdr.adr.toFixed(0))
      : "";
    return {
      key: "mvp",
      available: true,
      salience: 0.6,
      text: STORY_COPY.mvp.winner(top.name, kda, top.adr.toFixed(0), rr, dom, adrTail)
    };
  }
  // 全场最高分落在败方：点明队属，避免误读成赢家 MVP。
  return {
    key: "mvp",
    available: true,
    salience: 0.55,
    text: STORY_COPY.mvp.loser(rr, kda, top.name, ctx.loser.name, dom)
  };
}

function longestWinRun(rounds: EconomyPoint[]): { teamKey: TeamKey; startRound: number; endRound: number; length: number } {
  let best = { teamKey: "teamA" as TeamKey, startRound: 0, endRound: 0, length: 0 };
  let current = { teamKey: "teamA" as TeamKey, startRound: 0, endRound: 0, length: 0 };
  for (const roundRow of rounds) {
    if (current.length > 0 && current.teamKey === roundRow.winnerTeamKey) {
      current = { ...current, endRound: roundRow.roundNumber, length: current.length + 1 };
    } else {
      current = { teamKey: roundRow.winnerTeamKey, startRound: roundRow.roundNumber, endRound: roundRow.roundNumber, length: 1 };
    }
    if (current.length > best.length) {
      best = current;
    }
  }
  return best;
}

function buildPlayerSummary(row: PlayerScoreboardRow): string[] {
  const summary = [
    `${row.kills}/${row.deaths}/${row.assists}，ADR ${row.adr.toFixed(1)}，KAST ${row.kast.toFixed(1)}%。`,
    `V2 RR ${row.accountRR.toFixed(3)}，数据可信度 ${(row.confidence * 100).toFixed(0)}%。`
  ];
  if (row.entryKills > 0) {
    summary.push(`贡献 ${row.entryKills} 次首杀。`);
  }
  if (row.tradeKills > 0) {
    summary.push(`完成 ${row.tradeKills} 次补枪。`);
  }
  if ((row.bombPlantCount ?? 0) + (row.bombDefuseCount ?? 0) > 0) {
    summary.push(`目标贡献：${row.bombPlantCount ?? 0} 次下包，${row.bombDefuseCount ?? 0} 次拆包。`);
  }
  return summary;
}

function buildWorkspaceMap(pkg: DemoPackage, view: ReturnType<typeof buildDemoViewModel>["map"], heatmap: HeatmapPoint[]) {
  const bombPoints: WorkspaceSpatialPoint[] = pkg.bombs
    .filter((bomb) => bomb.position && (bomb.position.x !== 0 || bomb.position.y !== 0))
    .map((bomb) => ({
      x: bomb.position.x,
      y: bomb.position.y,
      z: bomb.position.z,
      roundNumber: bomb.roundNumber,
      teamKey: bomb.actorTeamKey,
      steamId64: bomb.actorSteamId64,
      kind: "bomb",
      side: null,
      grenadeType: null
    }));
  const positionPoints: WorkspaceSpatialPoint[] = (pkg.positions1s ?? [])
    .filter((row) => row.position && (row.position.x !== 0 || row.position.y !== 0))
    .map((row) => ({
      x: row.position?.x ?? 0,
      y: row.position?.y ?? 0,
      z: row.position?.z ?? 0,
      roundNumber: row.roundNumber,
      teamKey: row.teamKey,
      steamId64: row.steamId64,
      kind: "position",
      side: null,
      grenadeType: null
    }));
  const points: WorkspaceSpatialPoint[] = [
    ...heatmap.map((point) => ({ ...point, kind: point.kind })),
    ...bombPoints,
    ...positionPoints
  ];
  const count = (kind: WorkspaceSpatialPoint["kind"]) => points.filter((point) => point.kind === kind).length;
  const hasPositionData = points.length > 0;

  return {
    view,
    modes: [
      { key: "death", label: "死亡", count: count("death") },
      { key: "kill", label: "击杀", count: count("kill") },
      { key: "grenade", label: "道具", count: count("grenade") },
      { key: "bomb", label: "炸弹", count: count("bomb") },
      { key: "position", label: "站位", count: count("position") }
    ],
    points,
    status: {
      hasRadar: !!view.radarImageUrl,
      hasPositionData,
      message: !view.radarImageUrl
        ? "该地图暂无雷达底图"
        : hasPositionData
          ? null
          : "该导出包暂无可展示的位置数据"
    }
  };
}

function buildWorkspaceReplay(pkg: DemoPackage) {
  const replay = pkg.replay;
  if (!replay) {
    return {
      available: false,
      sampleRate: null,
      tickrate: null,
      rounds: [],
      capabilities: {
        hasDefuseKit: false
      }
    };
  }

  const killsByRound = groupBy(pkg.kills, (k) => k.roundNumber);
  const grenadesByRound = groupBy(pkg.grenades, (g) => g.roundNumber);
  const bombsByRound = groupBy(pkg.bombs, (b) => b.roundNumber);

  let hasDefuseKit = false;
  const rounds = replay.rounds.map((roundRow) => ({
    roundNumber: roundRow.roundNumber,
    startTick: roundRow.startTick,
    tickStep: roundRow.tickStep,
    frameCount: roundRow.frameCount,
    kills: buildRoundKills(pkg, killsByRound.get(roundRow.roundNumber) ?? []),
    grenades: (grenadesByRound.get(roundRow.roundNumber) ?? []).map((row) => ({
      grenade: row.grenade,
      throwTick: row.throwTick,
      effectTick: row.effectTick,
      destroyTick: row.destroyTick,
      throwX: row.throwPosition.x,
      throwY: row.throwPosition.y,
      effectX: row.effectPosition.x,
      effectY: row.effectPosition.y
    })),
    // v2.3+ 导出包才带飞行轨迹；旧包置空，渲染端按"无数据"处理
    projectiles: (roundRow.projectiles ?? []).map((proj) => ({
      grenade: proj.grenade,
      startTick: proj.startTick,
      x: proj.x,
      y: proj.y
    })),
    bomb: buildRoundBomb(bombsByRound.get(roundRow.roundNumber) ?? []),
    players: roundRow.players.map((player) => {
      const frames: WorkspaceReplayFrame[] = [];
      for (let index = 0; index < roundRow.frameCount; index += 1) {
        const flags = player.flags[index] ?? 0;
        const frame = {
          tick: roundRow.startTick + index * roundRow.tickStep,
          x: player.x[index] ?? 0,
          y: player.y[index] ?? 0,
          z: player.z[index] ?? 0,
          yaw: player.yaw[index] ?? 0,
          hp: player.hp[index] ?? 0,
          weapon: weaponNameForIndex(replay.weaponDict, player.weapon[index] ?? -1),
          alive: (flags & 1) !== 0,
          flashed: (flags & 8) !== 0,
          hasDefuseKit: (flags & 4) !== 0,
          hasBomb: (flags & 2) !== 0
        };
        if (frame.hasDefuseKit) {
          hasDefuseKit = true;
        }
        frames.push(frame);
      }
      return {
        steamId64: player.steamId64,
        name: nameForSteamId(pkg, player.steamId64) ?? player.steamId64,
        teamKey: player.teamKey,
        side: player.side,
        frames
      };
    })
  }));

  return {
    available: true,
    sampleRate: replay.meta.sampleRate,
    tickrate: replay.meta.tickrate,
    rounds,
    capabilities: {
      hasDefuseKit
    }
  };
}

/** 从 bombs.json 取该回合 C4 锚点：plant 位置定格，defuse/explode 决定终态。 */
function buildRoundBomb(events: DemoPackage["bombs"]) {
  const plant = events.find((event) => event.type === "planted");
  if (!plant) return null;
  return {
    plantTick: plant.tick,
    x: plant.position.x,
    y: plant.position.y,
    defuseTick: events.find((event) => event.type === "defused")?.tick ?? null,
    explodeTick: events.find((event) => event.type === "exploded")?.tick ?? null
  };
}

function weaponNameForIndex(weaponDict: string[], index: number): string | null {
  const raw = index >= 0 ? weaponDict[index] ?? null : null;
  if (!raw) {
    return null;
  }
  // Only reject purely-numeric entries (untranslated weapon dict indices).
  // Display names with spaces (e.g. "M9 Bayonet") are intentionally allowed through
  // so displayWeaponName can match them via its knife/bayonet patterns.
  const normalized = normalizeWeapon(raw);
  return /^\d+$/.test(normalized) ? null : displayWeaponName(raw);
}

function buildRoundKills(pkg: DemoPackage, kills: DemoPackage["kills"]): WorkspaceKillEvent[] {
  return kills.map((kill, index) => {
    const activeRaw = kill.killerActiveWeapon;
    const weaponRaw = activeRaw && isNamedWeapon(normalizeWeapon(activeRaw)) ? activeRaw : kill.weapon;
    return {
      id: `kf-${kill.roundNumber}-${kill.tick}-${index}`,
      tick: kill.tick,
      killerName: nameForSteamId(pkg, kill.killerSteamId64),
      killerTeamKey: kill.killerTeamKey,
      victimName: nameForSteamId(pkg, kill.victimSteamId64) ?? kill.victimSteamId64,
      weapon: displayWeaponName(weaponRaw),
      headshot: kill.headshot,
      throughSmoke: kill.throughSmoke,
      noScope: kill.noScope,
      flashAssist: kill.flashAssist,
      tradeKill: kill.tradeKill
    };
  });
}
