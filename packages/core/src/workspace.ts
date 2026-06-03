import {
  analysisBundleSchema,
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
import { groupBy, nameForSteamId, round, normalizeWeapon, isNamedWeapon } from "./utils.js";
import { displayWeaponName } from "./weapons.js";
import { normalizeDemoPackage } from "./normalize.js";
import { buildQaReport } from "./qa.js";
import { buildPlayerRoundFacts, buildPlayerIndicators, buildScoreboard } from "./scoreboard.js";
import { computeAccountRatingsV2 } from "./signals.js";
import { buildTimeline, buildEconomy, buildHeatmap } from "./timeline.js";

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
  const qa = buildQaReport(pkg);
  const playerRoundFacts = buildPlayerRoundFacts(pkg);
  const playerIndicators = buildPlayerIndicators(pkg, playerRoundFacts);
  const accountRatings = computeAccountRatingsV2(pkg);
  const scoreboard = buildScoreboard(pkg, playerIndicators, accountRatings);
  const timeline = buildTimeline(pkg);
  const economy = buildEconomy(pkg);
  const heatmap = buildHeatmap(pkg);

  const bundle: AnalysisBundle = analysisBundleSchema.parse({
    version: "cs2-demo-analysis-kit/0.2",
    sourceSchemaVersion: pkg.manifest.schemaVersion,
    mapName: pkg.match.mapName,
    tickrate: pkg.match.tickrate,
    teams: {
      teamA: { name: pkg.match.teamA.name ?? "Team A", score: pkg.match.teamA.score },
      teamB: { name: pkg.match.teamB.name ?? "Team B", score: pkg.match.teamB.score }
    },
    scoreboard,
    playerIndicators,
    playerRoundFacts,
    timeline,
    economy,
    heatmap,
    qa
  });

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
      { key: "map", label: "地图" },
      { key: "replay", label: "回放" }
    ],
    overview: {
      kpis: buildWorkspaceKpis(bundle),
      story: buildWorkspaceStory(bundle)
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
        { key: "clutch", label: "Clutch", value: row.accountBreakdown.clutch },
        { key: "objective", label: "Objective", value: row.accountBreakdown.objective },
        { key: "utility", label: "Utility", value: row.accountBreakdown.utility }
      ],
      roundFacts: factsByPlayer.get(row.steamId64) ?? []
    })),
    economy: bundle.economy,
    map: buildWorkspaceMap(pkg, view.map, bundle.heatmap),
    replay: buildWorkspaceReplay(pkg),
    adminQa: bundle.qa
  });
}

function radarImageUrlForMap(mapName: string): string | null {
  const knownMaps = new Set(["de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_overpass"]);
  return knownMaps.has(mapName) ? `/maps/radars/${mapName}.png` : null;
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

function buildWorkspaceStory(bundle: AnalysisBundle): string[] {
  const topRR = bundle.scoreboard[0];
  const topAdr = [...bundle.scoreboard].sort((a, b) => b.adr - a.adr)[0];
  const winnerKey: TeamKey = bundle.teams.teamA.score >= bundle.teams.teamB.score ? "teamA" : "teamB";
  const loserKey: TeamKey = winnerKey === "teamA" ? "teamB" : "teamA";
  const winner = bundle.teams[winnerKey];
  const loser = bundle.teams[loserKey];
  const openingHalf = bundle.economy.slice(0, 12);
  const closingHalf = bundle.economy.slice(12);
  const openingWins = countWins(openingHalf, winnerKey);
  const closingWins = countWins(closingHalf, winnerKey);
  const longestRun = longestWinRun(bundle.economy);
  const lowBuySteals = bundle.economy.filter((roundRow) => {
    const winnerEconomy = winnerKey === "teamA" ? roundRow.teamAEconomy : roundRow.teamBEconomy;
    const loserEconomy = winnerKey === "teamA" ? roundRow.teamBEconomy : roundRow.teamAEconomy;
    return roundRow.winnerTeamKey === winnerKey && ["eco", "semi", "force"].includes(winnerEconomy) && loserEconomy === "full";
  });
  const pistolRounds = bundle.economy.filter((roundRow) => roundRow.teamAEconomy === "pistol" || roundRow.teamBEconomy === "pistol");
  const pistolWins = pistolRounds.filter((roundRow) => roundRow.winnerTeamKey === winnerKey).length;
  const story = [
    `在 ${bundle.mapName}，${winner.name} 以 ${winner.score}:${loser.score} 击败 ${loser.name}。${openingHalf.length > 0 ? `前半场他们拿到 ${openingWins} 分` : ""}${closingHalf.length > 0 ? `，易边后再收下 ${closingWins} 分` : ""}。`
  ];

  if (longestRun.length >= 4) {
    story.push(`${teamNameForKey(bundle, longestRun.teamKey)} 在 R${longestRun.startRound}-R${longestRun.endRound} 打出 ${longestRun.length} 连胜，这是本图最明显的一段节奏转折。`);
  }
  if (pistolRounds.length > 0) {
    story.push(`手枪局方面，${winner.name} 拿下 ${pistolWins}/${pistolRounds.length} 个手枪局；${pistolWins < pistolRounds.length && winner.score > loser.score ? "他们仍靠后续长枪局和经济转换把领先拿了回来。" : "这给后续经济滚动提供了起点。"}`);
  }
  if (lowBuySteals.length > 0) {
    story.push(`${winner.name} 有 ${lowBuySteals.length} 个低经济回合打穿对手长枪局，典型回合是 R${lowBuySteals[0]?.roundNumber}，这类回合比单纯装备价值差更能解释胜负。`);
  }
  if (topRR) {
    const topLine = `${topRR.name} 是本图最稳定的个人输出点，V2 RR ${topRR.accountRR.toFixed(3)}，${topRR.kills}/${topRR.deaths}/${topRR.assists}，ADR ${topRR.adr.toFixed(1)}`;
    story.push(topAdr && topAdr.steamId64 !== topRR.steamId64 ? `${topLine}；同时 ${topAdr.name} 打出全场最高 ADR ${topAdr.adr.toFixed(1)}。` : `${topLine}。`);
  }
  return story;
}

function countWins(rounds: EconomyPoint[], teamKey: TeamKey): number {
  return rounds.filter((roundRow) => roundRow.winnerTeamKey === teamKey).length;
}

function teamNameForKey(bundle: AnalysisBundle, teamKey: TeamKey): string {
  return teamKey === "teamA" ? bundle.teams.teamA.name : bundle.teams.teamB.name;
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
        hasDefuseKit: false,
        hasBombPosition: false
      }
    };
  }

  const killsByRound = groupBy(pkg.kills, (k) => k.roundNumber);

  let hasDefuseKit = false;
  const rounds = replay.rounds.map((roundRow) => ({
    roundNumber: roundRow.roundNumber,
    startTick: roundRow.startTick,
    tickStep: roundRow.tickStep,
    frameCount: roundRow.frameCount,
    kills: buildRoundKills(pkg, killsByRound.get(roundRow.roundNumber) ?? []),
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
          hasDefuseKit: (flags & 4) !== 0
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
      hasDefuseKit,
      hasBombPosition: false
    }
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
