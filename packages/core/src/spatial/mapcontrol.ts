/**
 * Official MapControl 派生（严格重建 SP2）。设计见 docs/design/rr-model.md §3.2/§3.3。
 *
 * 已落地 official 指标（callout/index-based MVP gates，输入 positions+routes+kills+phase）：
 * - activeSoloPressureSeconds   独占某动线 + 同线敌方施压 + official phase（cap 8s/round）
 * - sidePhaseAwareDenialSeconds 防守方在敌方施压的动线上 holding × phaseFactor（cap 10s/round）
 * - firstMeaningfulControlEvents T 首次推进到动线关键段（neutral/key index），每回合每动线一次
 * - strategicIsolationDeaths    未交易死亡 × 死前窗口内 solo/denial/firstControl → 0~1 credit
 *
 * 这些 official 指标当前进 review/shadow 与 Trade 闭环（strategicIsolationDeaths），
 * **不进 RR MapControl 评分账户**——后者需 rival-rating schema V2 + 权重（跨仓库 SP4）。
 * 仍缺：denial 的 LOS/nav 距离精修、nonUtilityAssistedAdvanceUnits、UtilitySpatial
 * actual-effect（需 zone 多边形标定）。
 */
import type { DemoPackage } from "@cs2dak/contract";
import { routeIndex, type MapRoute, type MapRoutes } from "@cs2dak/maps";
import { createResolverFromPackage, type PlayerResolver } from "../resolve.js";
import { groupBy } from "../utils.js";
import { annotatePositions, type SpatialAssets, type AnnotatedSample } from "./annotate.js";
import { inferRoundPhases, phaseAtTick } from "./phase.js";
import { isOfficialScoringPhase, type RoundPhase, type RoundPhaseModel } from "./types.js";

export interface OfficialMapControl {
  activeSoloPressureSeconds: number;
  sidePhaseAwareDenialSeconds: number;
  firstMeaningfulControlEvents: number;
  strategicIsolationDeaths: number;
}

// —— gate 常数（doc §6/§8/§10/§22）——
const SOLO_PRESSURE_PER_ROUND_CAP = 8; // 秒
const DENIAL_PER_ROUND_CAP = 10; // 秒（已乘 phaseFactor）
const ISOLATION_WINDOW_SECONDS = 8; // 死前回看窗口 W
const ISOLATION_MIN_TRIGGER_SECONDS = 3; // 触发阈值 S
const DEFAULT_SAMPLE_RATE = 1; // 无 replay 时降级为 1Hz

type Team = string;

interface RoundEvidence {
  /** tick → solo-pressure 玩家集合。 */
  soloByTick: Map<number, Set<string>>;
  /** tick → denial 玩家集合（用于 isolation 触发，未加权）。 */
  denialByTick: Map<number, Set<string>>;
}

export function buildOfficialMapControl(
  pkg: DemoPackage,
  assets: SpatialAssets,
  phases?: Map<number, RoundPhaseModel>,
): Map<string, OfficialMapControl> {
  const out = new Map<string, OfficialMapControl>();
  if (!assets.routes) return out; // callout-based，需要动线资产
  const routes = assets.routes;
  const resolver = createResolverFromPackage(pkg);
  const samples = annotatePositions(pkg, assets);
  if (samples.length === 0) return out;
  const sampleRate = pkg.replay?.meta.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const SAMPLE_SECONDS = 1 / sampleRate;
  const phaseModels = phases ?? inferRoundPhases(pkg);
  const teamByPlayer = new Map(pkg.players.map((p) => [p.steamId64, p.teamKey]));
  const sideByTeam = new Map<number, { defendPre: Team | null; t: Team | null; ct: Team | null }>();
  for (const round of pkg.rounds) {
    const t = round.teamASide === "t" ? "teamA" : round.teamBSide === "t" ? "teamB" : null;
    const ct = round.teamASide === "ct" ? "teamA" : round.teamBSide === "ct" ? "teamB" : null;
    sideByTeam.set(round.roundNumber, { defendPre: ct, t, ct });
  }
  const plantByRound = plantTicks(pkg);

  const pressureSeconds = new Map<string, number>();
  const denialSeconds = new Map<string, number>();
  const firstControlEvents = new Map<string, number>();
  const evidenceByRound = new Map<number, RoundEvidence>();

  const byRound = groupBy(samples, (s) => s.roundNumber);
  for (const [roundNumber, rows] of byRound) {
    const phase = phaseModels.get(roundNumber);
    const sides = sideByTeam.get(roundNumber) ?? { defendPre: null, t: null, ct: null };
    const plantTick = plantByRound.get(roundNumber) ?? null;
    const evidence: RoundEvidence = { soloByTick: new Map(), denialByTick: new Map() };

    const perRoundSolo = new Map<string, number>();
    const perRoundDenial = new Map<string, number>();
    const takenRoutes = new Set<string>(); // firstControl 去重：每回合每动线一次

    for (const [tick, tickRows] of groupBy(rows, (r) => r.tick)) {
      const ph: RoundPhase = phase ? phaseAtTick(phase, tick) : "default";
      if (!isOfficialScoringPhase(ph)) continue;
      const presence = routePresence(tickRows, routes, teamByPlayer);
      const defenderTeam = plantTick != null && tick >= plantTick ? sides.t : sides.ct;

      const solo = new Set<string>();
      const denial = new Set<string>();
      for (const [route, byTeam] of presence) {
        deriveSoloAndDenial(route, byTeam, defenderTeam, ph, solo, denial, perRoundSolo, perRoundDenial, SAMPLE_SECONDS);
        // firstMeaningfulControlEvents：T 首次到达关键段（neutral/key index）
        recordFirstControl(route, byTeam, sides.t, takenRoutes, firstControlEvents, ph);
      }
      if (solo.size) evidence.soloByTick.set(tick, solo);
      if (denial.size) evidence.denialByTick.set(tick, denial);
    }

    for (const [id, secs] of perRoundSolo) {
      pressureSeconds.set(id, (pressureSeconds.get(id) ?? 0) + Math.min(secs, SOLO_PRESSURE_PER_ROUND_CAP));
    }
    for (const [id, secs] of perRoundDenial) {
      denialSeconds.set(id, (denialSeconds.get(id) ?? 0) + Math.min(secs, DENIAL_PER_ROUND_CAP));
    }
    evidenceByRound.set(roundNumber, evidence);
  }

  const credits = buildIsolationCredits(pkg, evidenceByRound, phaseModels, SAMPLE_SECONDS, resolver);

  const ids = new Set<string>([
    ...pressureSeconds.keys(),
    ...denialSeconds.keys(),
    ...firstControlEvents.keys(),
    ...credits.keys(),
  ]);
  for (const id of ids) {
    out.set(id, {
      activeSoloPressureSeconds: round3(pressureSeconds.get(id) ?? 0),
      sidePhaseAwareDenialSeconds: round3(denialSeconds.get(id) ?? 0),
      firstMeaningfulControlEvents: firstControlEvents.get(id) ?? 0,
      strategicIsolationDeaths: round3(credits.get(id) ?? 0),
    });
  }
  return out;
}

/** 每动线 → 每队在线（routeIndex≥1）成员。 */
function routePresence(
  tickRows: AnnotatedSample[],
  routes: MapRoutes,
  teamByPlayer: Map<string, string>,
): Map<MapRoute, Map<Team, { id: string; index: number }[]>> {
  const out = new Map<MapRoute, Map<Team, { id: string; index: number }[]>>();
  for (const route of routes.routes) {
    const byTeam = new Map<Team, { id: string; index: number }[]>();
    for (const row of tickRows) {
      if (!row.alive) continue;
      const idx = routeIndex(route, row.callout);
      if (idx < 1) continue;
      const team = teamByPlayer.get(row.steamId64) ?? row.teamKey;
      const arr = byTeam.get(team) ?? [];
      arr.push({ id: row.steamId64, index: idx });
      byTeam.set(team, arr);
    }
    if (byTeam.size > 0) out.set(route, byTeam);
  }
  return out;
}

function deriveSoloAndDenial(
  route: MapRoute,
  byTeam: Map<Team, { id: string; index: number }[]>,
  defenderTeam: Team | null,
  phase: RoundPhase,
  solo: Set<string>,
  denial: Set<string>,
  perRoundSolo: Map<string, number>,
  perRoundDenial: Map<string, number>,
  sampleSecs: number,
): void {
  if (byTeam.size < 2) return; // 需双方都在该线（敌方施压）
  for (const [team, members] of byTeam) {
    const enemyPresent = [...byTeam].some(([t, m]) => t !== team && m.length >= 1);
    if (!enemyPresent) continue;
    // solo：本队仅此一人在该线
    if (members.length === 1 && !solo.has(members[0]!.id)) {
      solo.add(members[0]!.id);
      perRoundSolo.set(members[0]!.id, (perRoundSolo.get(members[0]!.id) ?? 0) + sampleSecs);
    }
    // denial：防守方在敌方施压的动线上 holding（× phaseFactor）
    if (defenderTeam != null && team === defenderTeam) {
      const factor = phaseFactor(phase);
      if (factor > 0) {
        for (const m of members) {
          if (denial.has(m.id)) continue;
          denial.add(m.id);
          perRoundDenial.set(m.id, (perRoundDenial.get(m.id) ?? 0) + sampleSecs * factor);
        }
      }
    }
  }
}

/** T 首次推进到动线关键段：index ≥ max(1, ceil(len×0.4))，每回合每动线记一次，归 frontier T。 */
function recordFirstControl(
  route: MapRoute,
  byTeam: Map<Team, { id: string; index: number }[]>,
  tTeam: Team | null,
  taken: Set<string>,
  firstControlEvents: Map<string, number>,
  phase: RoundPhase,
): void {
  if (tTeam == null || taken.has(route.id)) return;
  if (phase !== "default" && phase !== "take" && phase !== "execute") return;
  const tMembers = byTeam.get(tTeam);
  if (!tMembers) return;
  const threshold = Math.max(1, Math.ceil(route.zones.length * 0.4));
  const frontier = tMembers.filter((m) => m.index >= threshold).sort((a, b) => b.index - a.index)[0];
  if (!frontier) return;
  taken.add(route.id);
  firstControlEvents.set(frontier.id, (firstControlEvents.get(frontier.id) ?? 0) + 1);
}

function buildIsolationCredits(
  pkg: DemoPackage,
  evidenceByRound: Map<number, RoundEvidence>,
  phases: Map<number, RoundPhaseModel>,
  sampleSecs: number,
  resolver: PlayerResolver,
): Map<string, number> {
  const tickrate = pkg.match?.tickrate ?? pkg.manifest?.tickrate ?? 64;
  const windowTicks = ISOLATION_WINDOW_SECONDS * tickrate;
  const credits = new Map<string, number>();

  for (const kill of pkg.kills) {
    const killerPlayer = resolver.byIndexOrNull(kill.killerIndex);
    const victimPlayer = resolver.byIndexOrNull(kill.victimIndex);
    if (!victimPlayer) continue;
    if (killerPlayer && killerPlayer.teamKey === victimPlayer.teamKey) continue;
    if ((kill as { tradeDeath?: boolean }).tradeDeath) continue;
    const victim = victimPlayer.steamId64;
    if (!victim) continue;
    const phase = phases.get(kill.roundNumber);
    if (phase && !isOfficialScoringPhase(phaseAtTick(phase, kill.tick))) continue;
    const evidence = evidenceByRound.get(kill.roundNumber);
    if (!evidence) continue;

    const lo = kill.tick - windowTicks;
    const pressure = secondsInWindow(evidence.soloByTick, victim, lo, kill.tick, sampleSecs);
    const denial = secondsInWindow(evidence.denialByTick, victim, lo, kill.tick, sampleSecs);
    if (pressure < ISOLATION_MIN_TRIGGER_SECONDS && denial < ISOLATION_MIN_TRIGGER_SECONDS) continue;

    // credit = clamp(0.25 + 0.10×pressure + 0.10×denial, 0, 1)（doc §10.3 子集）
    const credit = clamp(0.25 + 0.1 * pressure + 0.1 * denial, 0, 1);
    credits.set(victim, (credits.get(victim) ?? 0) + credit);
  }
  return credits;
}

function secondsInWindow(byTick: Map<number, Set<string>>, id: string, lo: number, hi: number, sampleSecs: number): number {
  let secs = 0;
  for (const [tick, set] of byTick) {
    if (tick > hi || tick < lo) continue;
    if (set.has(id)) secs += sampleSecs;
  }
  return secs;
}

function phaseFactor(phase: RoundPhase): number {
  switch (phase) {
    case "execute":
    case "postPlant":
    case "retake":
    case "clutch":
      return 1.2;
    case "take":
      return 1.0;
    case "default":
      return 0.5;
    default:
      return 0;
  }
}

function plantTicks(pkg: DemoPackage): Map<number, number> {
  const out = new Map<number, number>();
  for (const bomb of pkg.bombs) {
    if (bomb.type === "planted" && !out.has(bomb.roundNumber)) out.set(bomb.roundNumber, bomb.tick);
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
