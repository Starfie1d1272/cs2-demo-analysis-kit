/**
 * 回合阶段推导（严格重建 SP1）。设计见 docs/design/rr-model.md §3.1。
 *
 * MVP 确定性派生 freeze / default / take / execute / postPlant / clutch：
 * - freeze     : [startTick, freezeEndTick)
 * - postPlant  : [plantTick, endTick)（双方通用窗口；side-aware gate 自行区分守包/retake）
 * - clutch     : 一方仅剩 1 人存活（另一方 ≥ 1）起，覆盖战斗类阶段
 * - take       : T 首次推进出生区外（routeIndex ≥ 1）
 * - execute    : 某条动线上 ≥ 2 名 T 逼近包点入口（routeIndex ≥ len-2）
 *
 * 无 positions / routes 时 take/execute 为 null（降级为 default），并在
 * RoundPhaseModel.hasPositions/hasRoutes 标注，供 evidenceQuality 使用。
 */
import type { DemoPackage } from "@cs2dak/contract";
import { getMapRoutes, routeIndex, type MapRoutes } from "@cs2dak/maps";
import type { RoundPhase, RoundPhaseModel } from "./types.js";

type Round = DemoPackage["rounds"][number];
type PositionRow = { roundNumber: number; tick: number; steamId64: string; lastPlaceName?: string | null };
type Kill = DemoPackage["kills"][number];

export function inferRoundPhases(pkg: DemoPackage): Map<number, RoundPhaseModel> {
  const routes = getMapRoutes(pkg.match?.mapName ?? "");
  // Build positions from replay 8Hz stream (v3 replaces positions-1s)
  const positions = buildPositionRows(pkg);
  const hasPositions = positions.length > 0;
  const hasRoutes = routes != null;

  const teamByPlayer = new Map(pkg.players.map((p) => [p.steamId64, p.teamKey]));
  const teamSize = countByTeam(pkg);

  const posByRound = groupBy(positions, (row) => row.roundNumber);
  const killsByRound = groupBy(pkg.kills, (k) => k.roundNumber);
  const playerTeams = pkg.players.map((p) => p.teamKey);
  const plantByRound = new Map<number, number>();
  for (const bomb of pkg.bombs) {
    if (bomb.type === "planted" && !plantByRound.has(bomb.roundNumber)) {
      plantByRound.set(bomb.roundNumber, bomb.tick);
    }
  }

  const out = new Map<number, RoundPhaseModel>();
  for (const round of pkg.rounds) {
    const tTeam = round.teamASide === "t" ? "teamA" : round.teamBSide === "t" ? "teamB" : null;
    const plantTick = plantByRound.get(round.roundNumber) ?? null;
    const clutchStartTick = computeClutchStart(killsByRound.get(round.roundNumber) ?? [], teamSize, playerTeams);
    const { takeTick, executeTick } = computeTakeExecute(
      round,
      tTeam,
      routes,
      posByRound.get(round.roundNumber) ?? [],
      teamByPlayer,
      plantTick,
    );
    out.set(round.roundNumber, {
      roundNumber: round.roundNumber,
      startTick: round.startTick,
      freezeEndTick: round.freezeEndTick,
      endTick: round.endTick,
      plantTick,
      takeTick,
      executeTick,
      clutchStartTick,
      hasPositions,
      hasRoutes,
    });
  }
  return out;
}

export function phaseAtTick(model: RoundPhaseModel, tick: number): RoundPhase {
  if (tick < model.freezeEndTick) return "freeze";
  if (model.clutchStartTick != null && tick >= model.clutchStartTick) return "clutch";
  if (model.plantTick != null && tick >= model.plantTick) return "postPlant";
  if (model.executeTick != null && tick >= model.executeTick) return "execute";
  if (model.takeTick != null && tick >= model.takeTick) return "take";
  return "default";
}

function countByTeam(pkg: DemoPackage): { teamA: number; teamB: number } {
  let teamA = 0;
  let teamB = 0;
  for (const p of pkg.players) {
    if (p.teamKey === "teamA") teamA += 1;
    else if (p.teamKey === "teamB") teamB += 1;
  }
  return { teamA, teamB };
}

/** 一方存活降到 1（另一方 ≥ 1）的首个 tick。 */
function computeClutchStart(kills: Kill[], teamSize: { teamA: number; teamB: number }, playerTeams: string[]): number | null {
  let aliveA = teamSize.teamA;
  let aliveB = teamSize.teamB;
  if (aliveA === 0 || aliveB === 0) return null;
  for (const kill of [...kills].sort((a, b) => a.tick - b.tick)) {
    const victimTeam = playerTeams[kill.victimIndex];
    if (victimTeam === "teamA") aliveA = Math.max(0, aliveA - 1);
    else if (victimTeam === "teamB") aliveB = Math.max(0, aliveB - 1);
    if ((aliveA === 1 && aliveB >= 1) || (aliveB === 1 && aliveA >= 1)) {
      return kill.tick;
    }
  }
  return null;
}

function computeTakeExecute(
  round: Round,
  tTeam: "teamA" | "teamB" | null,
  routes: MapRoutes | null,
  rows: PositionRow[],
  teamByPlayer: Map<string, string>,
  plantTick: number | null,
): { takeTick: number | null; executeTick: number | null } {
  if (!routes || !tTeam || rows.length === 0) return { takeTick: null, executeTick: null };

  // 按 tick 聚合本回合 freeze 后、plant 前的 T 方 callout。
  const placesByTick = new Map<number, string[]>();
  for (const row of rows) {
    if (teamByPlayer.get(row.steamId64) !== tTeam) continue;
    if (row.tick < round.freezeEndTick) continue;
    if (plantTick != null && row.tick >= plantTick) continue;
    if (!row.lastPlaceName) continue;
    const arr = placesByTick.get(row.tick) ?? [];
    arr.push(row.lastPlaceName);
    placesByTick.set(row.tick, arr);
  }

  let takeTick: number | null = null;
  let executeTick: number | null = null;
  for (const tick of [...placesByTick.keys()].sort((a, b) => a - b)) {
    const places = placesByTick.get(tick)!;
    let advanced = false;
    for (const route of routes.routes) {
      const threshold = Math.max(1, route.zones.length - 2);
      let nearSite = 0;
      for (const place of places) {
        const idx = routeIndex(route, place);
        if (idx >= 1) advanced = true;
        if (idx >= threshold) nearSite += 1;
      }
      if (nearSite >= 2 && executeTick == null) executeTick = tick;
    }
    if (advanced && takeTick == null) takeTick = tick;
    if (takeTick != null && executeTick != null) break;
  }
  // execute 蕴含 take
  if (executeTick != null && (takeTick == null || takeTick > executeTick)) takeTick = executeTick;
  return { takeTick, executeTick };
}

function groupBy<T>(items: readonly T[], key: (item: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = out.get(k) ?? [];
    arr.push(item);
    out.set(k, arr);
  }
  return out;
}

/** 从 replay 8Hz 流提取回合阶段推导所需的简化位置行。 */
function buildPositionRows(pkg: DemoPackage): PositionRow[] {
  const replay = pkg.replay;
  if (!replay) return [];
  const placeDict = replay.placeDict ?? [];
  const out: PositionRow[] = [];
  for (const round of replay.rounds) {
    const tickStep = round.tickStep;
    for (const track of round.players) {
      const player = pkg.players[track.playerIndex];
      if (!player) continue;
      for (let i = 0; i < track.x.length; i++) {
        const placeIdx = track.place[i] ?? -1;
        const lastPlaceName =
          placeIdx >= 0 && placeIdx < placeDict.length ? placeDict[placeIdx] : null;
        out.push({
          roundNumber: round.roundNumber,
          tick: round.startTick + i * tickStep,
          steamId64: player.steamId64,
          lastPlaceName,
        });
      }
    }
  }
  return out;
}
