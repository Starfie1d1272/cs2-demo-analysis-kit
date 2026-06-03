import type { DemoPackage, EconomyPoint, HeatmapPoint, TimelineEvent } from "@cs2dak/contract";
import { round, clamp, formatClock, nameForSteamId, normalizeWeapon } from "./utils.js";

export function buildTimeline(pkg: DemoPackage): TimelineEvent[] {
  const killEvents = pkg.kills.map<TimelineEvent>((kill, index) => ({
    id: `kill-${index}`,
    roundNumber: kill.roundNumber,
    tick: kill.tick,
    timeSeconds: tickToRoundSeconds(pkg, kill.roundNumber, kill.tick),
    ...clockForTick(pkg, kill.roundNumber, kill.tick),
    type: "kill",
    label: `${nameForSteamId(pkg, kill.killerSteamId64) ?? "环境"} 击杀 ${nameForSteamId(pkg, kill.victimSteamId64)}`,
    teamKey: kill.killerTeamKey
  }));

  const bombEvents = pkg.bombs.map<TimelineEvent>((bomb, index) => ({
    id: `bomb-${index}`,
    roundNumber: bomb.roundNumber,
    tick: bomb.tick,
    timeSeconds: tickToRoundSeconds(pkg, bomb.roundNumber, bomb.tick),
    ...clockForTick(pkg, bomb.roundNumber, bomb.tick),
    type: "bomb",
    label: bombLabel(pkg, bomb),
    teamKey: bomb.actorTeamKey
  }));

  const grenadeEvents = pkg.grenades.map<TimelineEvent>((grenade, index) => ({
    id: `grenade-${index}`,
    roundNumber: grenade.roundNumber,
    tick: grenade.effectTick,
    timeSeconds: tickToRoundSeconds(pkg, grenade.roundNumber, grenade.effectTick),
    ...clockForTick(pkg, grenade.roundNumber, grenade.effectTick),
    type: "grenade",
    label: `${nameForSteamId(pkg, grenade.throwerSteamId64) ?? "未知选手"} 投掷${grenadeLabel(grenade.grenade)}`,
    teamKey: grenade.throwerTeamKey
  }));

  const roundEvents = pkg.rounds.map<TimelineEvent>((roundRow) => ({
    id: `round-end-${roundRow.roundNumber}`,
    roundNumber: roundRow.roundNumber,
    tick: roundRow.endTick,
    timeSeconds: tickToRoundSeconds(pkg, roundRow.roundNumber, roundRow.endTick),
    clockPhase: "round-end",
    clockSeconds: 0,
    clockLabel: "结束",
    type: "round-end",
    label: `${sideLabel(roundRow.winnerSide)}获胜 · ${endReasonLabel(roundRow.endReason)}`,
    teamKey: roundRow.winnerTeamKey
  }));

  return [...killEvents, ...bombEvents, ...grenadeEvents, ...roundEvents]
    .sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick || eventSortWeight(a.type) - eventSortWeight(b.type));
}

export function buildEconomy(pkg: DemoPackage): EconomyPoint[] {
  return pkg.rounds.map((roundRow) => {
    const rows = pkg.playerEconomies.filter((row) => row.roundNumber === roundRow.roundNumber);
    const sumForTeam = (teamKey: "teamA" | "teamB") =>
      rows
        .filter((row) => row.teamKey === teamKey)
        .reduce((sum, row) => sum + row.equipmentValue, 0);
    const teamA = sumForTeam("teamA");
    const teamB = sumForTeam("teamB");

    return {
      roundNumber: roundRow.roundNumber,
      teamA,
      teamB,
      advantage: teamA - teamB,
      teamAEconomy: roundRow.teamAEconomy,
      teamBEconomy: roundRow.teamBEconomy,
      winnerTeamKey: roundRow.winnerTeamKey
    };
  });
}

export function buildHeatmap(pkg: DemoPackage): HeatmapPoint[] {
  const kills = pkg.kills.flatMap<HeatmapPoint>((kill) => {
    const out: HeatmapPoint[] = [
      {
        x: kill.victimPosition.x,
        y: kill.victimPosition.y,
        z: kill.victimPosition.z,
        roundNumber: kill.roundNumber,
        teamKey: kill.victimTeamKey,
        steamId64: kill.victimSteamId64,
        kind: "death"
      }
    ];
    if (kill.killerPosition) {
      out.push({
        x: kill.killerPosition.x,
        y: kill.killerPosition.y,
        z: kill.killerPosition.z,
        roundNumber: kill.roundNumber,
        teamKey: kill.killerTeamKey,
        steamId64: kill.killerSteamId64,
        kind: "kill"
      });
    }
    return out;
  });

  const grenades = pkg.grenades
    .map<HeatmapPoint>((grenade) => ({
      x: grenade.effectPosition.x,
      y: grenade.effectPosition.y,
      z: grenade.effectPosition.z,
      roundNumber: grenade.roundNumber,
      teamKey: grenade.throwerTeamKey,
      steamId64: grenade.throwerSteamId64,
      kind: "grenade"
    }));

  return [...kills, ...grenades].filter((point) => point.x !== 0 || point.y !== 0);
}

function tickToRoundSeconds(pkg: DemoPackage, roundNumber: number, tick: number): number {
  const roundRow = pkg.rounds.find((row) => row.roundNumber === roundNumber);
  if (!roundRow) {
    return 0;
  }
  return round(Math.max(0, tick - roundRow.freezeEndTick) / pkg.match.tickrate, 2);
}

function clockForTick(pkg: DemoPackage, roundNumber: number, tick: number): Pick<TimelineEvent, "clockPhase" | "clockSeconds" | "clockLabel"> {
  const roundRow = pkg.rounds.find((row) => row.roundNumber === roundNumber);
  if (!roundRow) {
    return { clockPhase: "round", clockSeconds: 0, clockLabel: "0:00" };
  }
  if (tick < roundRow.freezeEndTick) {
    return { clockPhase: "freeze", clockSeconds: 0, clockLabel: "冻结" };
  }
  const plant = [...pkg.bombs]
    .filter((bomb) => bomb.roundNumber === roundNumber && bomb.type === "planted" && bomb.tick <= tick)
    .sort((a, b) => b.tick - a.tick)[0];
  if (plant) {
    const remaining = clamp(40 - (tick - plant.tick) / pkg.match.tickrate, 0, 40);
    return { clockPhase: "bomb", clockSeconds: round(remaining, 2), clockLabel: formatClock(remaining) };
  }
  const remaining = clamp(115 - (tick - roundRow.freezeEndTick) / pkg.match.tickrate, 0, 115);
  return { clockPhase: "round", clockSeconds: round(remaining, 2), clockLabel: formatClock(remaining) };
}

function eventSortWeight(type: TimelineEvent["type"]): number {
  if (type === "bomb") return 0;
  if (type === "kill") return 1;
  if (type === "grenade") return 2;
  return 3;
}

function bombLabel(pkg: DemoPackage, bomb: DemoPackage["bombs"][number]): string {
  const actor = nameForSteamId(pkg, bomb.actorSteamId64) ?? "未知选手";
  const labels: Record<string, string> = {
    planted: "下包",
    defused: "拆包",
    exploded: "爆炸",
    dropped: "掉包",
    picked_up: "捡包",
    plant_begin: "开始下包",
    defuse_begin: "开始拆包"
  };
  return `${actor} ${labels[bomb.type] ?? bomb.type}`;
}

function grenadeLabel(type: string): string {
  const labels: Record<string, string> = {
    smoke: "烟雾弹",
    smokegrenade: "烟雾弹",
    flashbang: "闪光弹",
    hegrenade: "手雷",
    molotov: "燃烧弹",
    incgrenade: "燃烧弹",
    decoy: "诱饵弹"
  };
  return labels[normalizeWeapon(type)] ?? type;
}

function sideLabel(side: "t" | "ct"): string {
  return side === "t" ? "进攻方" : "防守方";
}

function endReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    t_win: "歼灭",
    ct_win: "歼灭",
    target_bombed: "爆炸",
    bomb_defused: "拆包",
    target_saved: "时间耗尽"
  };
  return labels[reason] ?? reason;
}
