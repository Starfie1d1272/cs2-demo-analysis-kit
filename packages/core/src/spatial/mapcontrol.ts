/**
 * Official MapControl 派生（严格重建 SP2）。设计见 docs/design/rr-model.md §3.2/§3.3。
 *
 * 本增量聚焦 doc 的 P2 闭环——`strategicIsolationDeaths`（Trade 盲区修正）：
 * rival-rating 的 Trade 已接好 `effectiveUntradedDeaths = deaths − tradedDeaths −
 * strategicIsolationDeaths`，只缺 core 提供非 null 的 credit。
 *
 * 两个 official 指标在此落地（其余 denial/advance/firstControl 留待后续增量）：
 * - activeSoloPressureSeconds：玩家**独自**承担一条动线/侧翼、且敌方在同线施压、
 *   处 official phase 的有效秒数（doc §6，callout-based MVP ablation，per-round cap 8s）。
 * - strategicIsolationDeaths：未被交易的死亡，若死前 W 秒内有足够 solo pressure 且
 *   死亡 objective 相关、非 save/exit，则给 0~1 连续 credit（doc §10）。
 *
 * 输入只用 positions（callout + 1Hz）+ routes + kills + phase，不依赖尚未标定的 zone。
 */
import type { DemoPackage } from "@cs2dak/contract";
import { routeIndex, type MapRoutes } from "@cs2dak/maps";
import { annotatePositions, type SpatialAssets, type AnnotatedSample } from "./annotate.js";
import { inferRoundPhases, phaseAtTick } from "./phase.js";
import { isOfficialScoringPhase, type RoundPhaseModel } from "./types.js";

export interface OfficialMapControl {
  /** 有效独自施压秒数（capped per-round 8s，已汇总全场）。 */
  activeSoloPressureSeconds: number;
  /** 战略孤立死亡抵扣（0~N，连续值；接入 Trade.strategicIsolationDeaths）。 */
  strategicIsolationDeaths: number;
}

// —— gate 常数（doc §6/§10/§22）——
const SOLO_PRESSURE_PER_ROUND_CAP = 8; // 秒
const ISOLATION_WINDOW_SECONDS = 8; // 死前回看窗口 W
const ISOLATION_MIN_PRESSURE_SECONDS = 3; // 触发阈值 S
const SAMPLE_SECONDS = 1; // positions-1s 为 1Hz，每样本计 1 秒

/**
 * 派生 official MapControl 信号。无 positions / 无 routes → 返回空 Map（调用方按 null 处理）。
 */
export function buildOfficialMapControl(
  pkg: DemoPackage,
  assets: SpatialAssets,
  phases?: Map<number, RoundPhaseModel>,
): Map<string, OfficialMapControl> {
  const out = new Map<string, OfficialMapControl>();
  if (!assets.routes) return out; // callout-based，需要动线资产；缺失则全 null
  const routes = assets.routes;
  const samples = annotatePositions(pkg, assets);
  if (samples.length === 0) return out;
  const phaseModels = phases ?? inferRoundPhases(pkg);

  const teamByPlayer = new Map(pkg.players.map((p) => [p.steamId64, p.teamKey]));

  // 每回合、每 tick 标记「solo pressure」玩家集合。
  const soloByRoundTick = new Map<number, Map<number, Set<string>>>();
  const byRound = groupByRound(samples);
  for (const [roundNumber, rows] of byRound) {
    const phase = phaseModels.get(roundNumber);
    const byTick = groupByTick(rows);
    const tickMap = new Map<number, Set<string>>();
    for (const [tick, tickRows] of byTick) {
      if (phase && !isOfficialScoringPhase(phaseAtTick(phase, tick))) continue;
      const solo = soloPressurePlayers(tickRows, routes, teamByPlayer);
      if (solo.size > 0) tickMap.set(tick, solo);
    }
    soloByRoundTick.set(roundNumber, tickMap);
  }

  // activeSoloPressureSeconds：逐回合累加 solo tick × 1s，per-round cap 8s。
  const pressureSeconds = new Map<string, number>();
  for (const [, tickMap] of soloByRoundTick) {
    const perRound = new Map<string, number>();
    for (const [, solo] of tickMap) {
      for (const id of solo) perRound.set(id, (perRound.get(id) ?? 0) + SAMPLE_SECONDS);
    }
    for (const [id, secs] of perRound) {
      const capped = Math.min(secs, SOLO_PRESSURE_PER_ROUND_CAP);
      pressureSeconds.set(id, (pressureSeconds.get(id) ?? 0) + capped);
    }
  }

  // strategicIsolationDeaths：未交易死亡 × 死前窗口内 solo pressure。
  const credits = buildIsolationCredits(pkg, soloByRoundTick, phaseModels);

  const playerIds = new Set<string>([...pressureSeconds.keys(), ...credits.keys()]);
  for (const id of playerIds) {
    out.set(id, {
      activeSoloPressureSeconds: round3(pressureSeconds.get(id) ?? 0),
      strategicIsolationDeaths: round3(credits.get(id) ?? 0),
    });
  }
  return out;
}

/**
 * 一个 tick 上「独自承担某条动线、且敌方在同线施压」的玩家（callout-based MVP ablation）。
 * 条件：玩家在动线 R 上 routeIndex≥1；本队在 R 上 routeIndex≥1 的仅此一人；
 * 敌方至少一人在 R 上 routeIndex≥1（同线施压）。
 */
function soloPressurePlayers(
  tickRows: AnnotatedSample[],
  routes: MapRoutes,
  teamByPlayer: Map<string, string>,
): Set<string> {
  const solo = new Set<string>();
  for (const route of routes.routes) {
    // 每队在该动线上的成员（index≥1）
    const onLine = new Map<string, { id: string; index: number }[]>();
    for (const row of tickRows) {
      if (!row.alive) continue;
      const idx = routeIndex(route, row.callout);
      if (idx < 1) continue;
      const team = teamByPlayer.get(row.steamId64) ?? row.teamKey;
      const arr = onLine.get(team) ?? [];
      arr.push({ id: row.steamId64, index: idx });
      onLine.set(team, arr);
    }
    if (onLine.size < 2) continue; // 需要双方都在该线上（敌方施压）
    for (const [team, members] of onLine) {
      if (members.length !== 1) continue; // 本队仅此一人 = solo
      const enemyPresent = [...onLine].some(([t, m]) => t !== team && m.length >= 1);
      if (enemyPresent) solo.add(members[0]!.id);
    }
  }
  return solo;
}

function buildIsolationCredits(
  pkg: DemoPackage,
  soloByRoundTick: Map<number, Map<number, Set<string>>>,
  phases: Map<number, RoundPhaseModel>,
): Map<string, number> {
  const tickrate = pkg.match?.tickrate ?? pkg.manifest?.tickrate ?? 64;
  const windowTicks = ISOLATION_WINDOW_SECONDS * tickrate;
  const credits = new Map<string, number>();

  for (const kill of pkg.kills) {
    // 仅看「敌方击杀、未被交易」的死亡
    if (kill.killerTeamKey && kill.victimTeamKey && kill.killerTeamKey === kill.victimTeamKey) continue;
    if ((kill as { tradeDeath?: boolean }).tradeDeath) continue;
    const victim = kill.victimSteamId64;
    if (!victim) continue;
    const phase = phases.get(kill.roundNumber);
    if (phase && !isOfficialScoringPhase(phaseAtTick(phase, kill.tick))) continue;

    const tickMap = soloByRoundTick.get(kill.roundNumber);
    if (!tickMap) continue;
    let pressureSecondsInWindow = 0;
    for (const [tick, solo] of tickMap) {
      if (tick > kill.tick) continue;
      if (tick < kill.tick - windowTicks) continue;
      if (solo.has(victim)) pressureSecondsInWindow += SAMPLE_SECONDS;
    }
    if (pressureSecondsInWindow < ISOLATION_MIN_PRESSURE_SECONDS) continue;

    // credit = clamp(0.25 + 0.10×窗口内 solo 秒数, 0, 1)（doc §10.3 的 MVP 子集）
    const credit = clamp(0.25 + 0.1 * pressureSecondsInWindow, 0, 1);
    credits.set(victim, (credits.get(victim) ?? 0) + credit);
  }
  return credits;
}

function groupByRound(samples: AnnotatedSample[]): Map<number, AnnotatedSample[]> {
  const out = new Map<number, AnnotatedSample[]>();
  for (const s of samples) {
    const arr = out.get(s.roundNumber) ?? [];
    arr.push(s);
    out.set(s.roundNumber, arr);
  }
  return out;
}

function groupByTick(rows: AnnotatedSample[]): Map<number, AnnotatedSample[]> {
  const out = new Map<number, AnnotatedSample[]>();
  for (const r of rows) {
    const arr = out.get(r.tick) ?? [];
    arr.push(r);
    out.set(r.tick, arr);
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
