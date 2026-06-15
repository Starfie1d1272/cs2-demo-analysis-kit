import {
  derivePlayerMechanics,
  derivePlayerWeaponHighlights,
  deriveRRIndicators,
  deriveRRSignals,
  type PlayerMechanicsFact
} from "@cs2dak/core";
import type { SeasonCohortFactRow } from "@cs2dak/cohort";
import type { DemoPackage, EconomyType, MatchWorkspaceModel, OpeningTrailsModel, Side, TeamKey } from "@cs2dak/contract";
import { decodeDelta, FLAG_ALIVE, FLAG_HAS_BOMB } from "@cs2dak/contract";
import type { TriangleBvh, CalloutGrid, Vec3 } from "@cs2dak/maps";
import type { LineupGrenadeLike } from "@cs2dak/maps";
import { calloutNear, calloutTendency, roleOf } from "@cs2dak/maps";
import {
  buildMatchWorkspaceModel,
  buildOpeningTrails,
  buildPlayerMechanicsProfileFromRows,
  buildPlayerSeasonInsights,
  extractDuelInsightsFacts,
  extractTeamComparisonFacts,
  extractTournamentFacts,
  displayWeaponName,
  type DuelInsightsFacts,
  type PlayerMechanicsProfile,
  type PlayerSeasonInsights,
  type PlayerWeaponStat,
  type TeamComparisonFacts,
  type TournamentFacts
} from "@cs2dak/presentation";
import { getStorage, type RecordStore, type StorageAdapter } from "./storage";

// ── 事实行基类型（消除 13 个接口中重复的 matchId/playerKey/…//） ──

interface FactBase {
  matchId: string;
}

interface PlayerFactBase extends FactBase {
  playerKey: string;
  steamId64: string;
  playerName: string;
}

interface MatchFactBase extends FactBase {
  mapName: string;
}

export interface PlayerMatchStatsFact extends PlayerFactBase {
  teamKey: TeamKey;
  mapName: string;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  damageHealth: number;
  kastRounds: number;
  firstKillCount: number;
  firstDeathCount: number;
  flashAssistCount: number;
  enemyFlashDurationSeconds: number;
  teamFlashDurationSeconds: number;
  utilityDamage: number;
  tradeKillCount: number;
  tradeDeathCount: number;
  headshotCount: number;
  vsOneCount: number;
  vsOneWonCount: number;
  vsTwoCount: number;
  vsTwoWonCount: number;
  vsThreeCount: number;
  vsThreeWonCount: number;
  vsFourCount: number;
  vsFourWonCount: number;
  vsFiveCount: number;
  vsFiveWonCount: number;
}

export interface PlayerInsightFact extends PlayerFactBase {
  insight: PlayerSeasonInsights;
}

export interface PlayerWeaponFact extends PlayerFactBase {
  weapon: string;
  kills: number;
  headshots: number;
}

export interface MechanicsSamplesFact extends PlayerFactBase {
  weapon: string;
  row: PlayerMechanicsFact;
}

export interface CohortFact extends PlayerFactBase {
  row: SeasonCohortFactRow;
}

export interface TournamentFact extends MatchFactBase {
  row: TournamentFacts;
}

export interface TeamComparisonFact extends MatchFactBase {
  row: TeamComparisonFacts;
}

export interface DuelFact extends MatchFactBase {
  row: DuelInsightsFacts;
}

export interface MatchWorkspaceFact extends MatchFactBase {
  row: MatchWorkspaceModel;
}

export interface OpeningTrailFact extends MatchFactBase {
  playerKey: string;
  steamId64: string;
  row: OpeningTrailsModel;
}

export interface LineupFact extends MatchFactBase {
  grenades: LineupGrenadeLike[];
  roundWinners: Array<[string, string]>;
  tickrate: number;
}

/** 回合剩余秒（1:55=115 起倒计时）下的一次站位切片。 */
export interface TacticalSnapshot {
  remainSec: number;
  defaults: Record<string, number>;   // anchorId → 存活人数
  advanced: Record<string, number>;   // advanced callout → 人数
  positions: Array<{ playerIndex: number; x: number; y: number; z: number; callout: string | null }>;
}

export type ExecuteBucket = "rush" | "fast" | "mid" | "late";

export interface SiteEntryFact {
  entrants: number;
  firstEntryTick: number | null;
  secondEntryTick: number | null;
  firstEntryRemainSec: number | null;
  executeRemainSec: number | null;
  /** entryCallout：进入包点前的最后一个非包点 callout（A1/A2/拱门等真实入口路线）。 */
  order: Array<{ playerIndex: number; tick: number; remainSec: number; callout: string; entryCallout: string | null }>;
}

export interface TacticalPlantFact {
  site: "a" | "b";
  tick: number;
  remainSec: number;
}

export interface TacticalGrenadeOccurrence {
  id: string;
  type: string;
  throwTick: number;
  effectTick: number | null;
  throwPosition: Vec3;
  effectPosition: Vec3;
  throwCallout: string | null;
  effectCallout: string | null;
  effectCalloutSource: "exact" | "nearby" | null;
  effectCalloutDistance: number | null;
  confidence: number;
  samples: number;
  targetRegion: "a" | "b" | "mid" | "other" | "unknown";
}

/** C4 携带/落点轨迹：用于推断主攻方向与转点，并作为佯攻的第二条独立证据。 */
export interface C4RouteFact {
  /** 携带者经过的去重相邻 callout 序列（freezeEnd → 安放/回合结束）。 */
  callouts: string[];
  /** 初期方向区域（首个可判定 region）。 */
  startRegion: "a" | "b" | "mid" | "other" | null;
  /** 末期方向区域（最后一个可判定 region）。 */
  endRegion: "a" | "b" | "mid" | "other" | null;
  /** 主方向是否在 A/B 之间发生转点。 */
  rotated: boolean;
  /** 安放点 callout（未安放为 null）。 */
  plantCallout: string | null;
}

/** TacticalRoundFact 口径版本：schema/语义变化时 +1，旧 facts 据此提示重建。 */
export const TACTICAL_FACT_VERSION = 3;

export interface TacticalRoundFact extends MatchFactBase {
  /** 口径版本（见 TACTICAL_FACT_VERSION）。 */
  analysisVersion: number;
  side: Side;
  teamKey: "teamA" | "teamB";
  teamName: string;
  opponentName: string;
  economy: EconomyType;
  won: boolean;
  roundNumber: number;
  snapshots: TacticalSnapshot[];
  targetSite: "a" | "b" | null;
  siteEntries: { a: SiteEntryFact; b: SiteEntryFact };
  plant: TacticalPlantFact | null;
  grenades: TacticalGrenadeOccurrence[];
  /** C4 轨迹（仅 T 方计算；CT 或无回放为 null）。 */
  c4Route: C4RouteFact | null;
  executeRemainSec: number | null;
  executeBucket: ExecuteBucket | null;
  firstKillForTeam: boolean | null;
  grenadeOccurrenceIds: string[];
}

export interface MatchFacts {
  matchId: string;
  mapName: string;
  playerMatchStats: PlayerMatchStatsFact[];
  playerInsights: PlayerInsightFact[];
  playerWeapons: PlayerWeaponFact[];
  mechanicsSamples: MechanicsSamplesFact[];
  cohortRows: CohortFact[];
  tournamentFacts: TournamentFact[];
  teamComparisonFacts: TeamComparisonFact[];
  duelFacts: DuelFact[];
  matchWorkspace: MatchWorkspaceFact[];
  openingTrails: OpeningTrailFact[];
  lineups: LineupFact[];
  tacticalRounds: TacticalRoundFact[];
}

export interface ExtractMatchFactsOptions {
  matchId: string;
  visibilityFor?: (mapName: string) => TriangleBvh | null;
  calloutGrid?: CalloutGrid | null;
  playerKeyFor?: (player: { steamId64: string; name: string; teamKey: string }) => string;
}

export interface FactsScope {
  matchIds?: string[];
  playerKeys?: string[];
  steamIds?: string[];
  mapNames?: string[];
}

export interface ProjectedMechanicsRows {
  matchId: string;
  rows: PlayerMechanicsFact[];
}

export interface FactsStore {
  putMatchFacts(facts: MatchFacts): Promise<void>;
  getPlayerMatchStats(scope?: FactsScope): Promise<PlayerMatchStatsFact[]>;
  getPlayerInsights(scope?: FactsScope): Promise<PlayerInsightFact[]>;
  getPlayerWeapons(scope?: FactsScope): Promise<PlayerWeaponFact[]>;
  getMechanicsRows(scope?: FactsScope): Promise<ProjectedMechanicsRows[]>;
  getCohortRows(scope?: FactsScope): Promise<SeasonCohortFactRow[]>;
  getTournamentFacts(scope?: FactsScope): Promise<TournamentFacts[]>;
  getTeamComparisonFacts(scope?: FactsScope): Promise<TeamComparisonFacts[]>;
  getDuelFacts(scope?: FactsScope): Promise<DuelInsightsFacts[]>;
  getMatchWorkspaces(scope?: FactsScope): Promise<MatchWorkspaceFact[]>;
  getOpeningTrails(scope?: FactsScope): Promise<OpeningTrailFact[]>;
  getLineups(scope?: FactsScope): Promise<LineupFact[]>;
  getTacticalRounds(scope?: FactsScope): Promise<TacticalRoundFact[]>;
  deleteMatchFacts(matchId: string): Promise<void>;
}

export interface PlayerSeasonDetailsFactsOptions extends FactsScope {
  steamIds: string[];
}

export interface PlayerSeasonDetailsFromFacts {
  insights: PlayerSeasonInsights;
  weaponStats: PlayerWeaponStat[];
  mechanics: PlayerMechanicsProfile;
}

export interface PlayerFlashSummariesFactsOptions extends FactsScope {
  players: Array<{ playerKey: string; name: string; steamIds: string[] }>;
}

function defaultPlayerKey(player: { steamId64: string }): string {
  return `steam:${player.steamId64}`;
}

function playerBySteamId(pkg: DemoPackage): Map<string, DemoPackage["players"][number]> {
  return new Map(pkg.players.map((player) => [player.steamId64, player]));
}

function sideOf(pkg: DemoPackage, playerIndex: number, roundNumber: number): Side | null {
  const player = pkg.players[playerIndex];
  const round = pkg.rounds.find((row) => row.roundNumber === roundNumber);
  if (!player || !round) return null;
  return player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
}

function throwerPlaceAt(pkg: DemoPackage, roundNumber: number, playerIndex: number, tick: number): string | null {
  const replay = pkg.replay;
  if (!replay) return null;
  const replayRound = replay.rounds.find((row) => row.roundNumber === roundNumber);
  if (!replayRound) return null;
  const track = replayRound.players.find((player) => player.playerIndex === playerIndex);
  if (!track) return null;
  const frameIndex = Math.max(
    0,
    Math.min(replayRound.frameCount - 1, Math.round((tick - replayRound.startTick) / replayRound.tickStep))
  );
  const placeIndex = track.place[frameIndex];
  if (placeIndex == null || placeIndex < 0 || placeIndex >= replay.placeDict.length) return null;
  return replay.placeDict[placeIndex] || null;
}

function teamNameOf(pkg: DemoPackage, teamKey: "teamA" | "teamB"): string {
  return pkg.match[teamKey].name ?? teamKey;
}

function opponentTeamKey(teamKey: "teamA" | "teamB"): "teamA" | "teamB" {
  return teamKey === "teamA" ? "teamB" : "teamA";
}

function effectCalloutFor(grid: CalloutGrid | null, point: Vec3): {
  callout: string | null;
  confidence: number | null;
  samples: number | null;
  source: "exact" | "nearby" | null;
  distance: number | null;
} {
  if (!grid) return { callout: null, confidence: null, samples: null, source: null, distance: null };
  const result = calloutNear(grid, point, { horizontalRadius: 20, verticalRadius: 40 });
  return result
    ? { callout: result.callout, confidence: result.confidence, samples: result.samples, source: result.source, distance: result.distance }
    : { callout: null, confidence: null, samples: null, source: null, distance: null };
}

function extractLineupFact(pkg: DemoPackage, matchId: string, grid: CalloutGrid | null): LineupFact {
  const roundsByNumber = new Map(pkg.rounds.map((round) => [round.roundNumber, round]));
  return {    matchId,
    mapName: pkg.match.mapName,
    tickrate: pkg.match.tickrate || 64,
    roundWinners: pkg.rounds.map((round) => [`${matchId}:${round.roundNumber}`, round.winnerTeamKey]),
    grenades: (pkg.grenades ?? []).map((grenade) => {
      const round = roundsByNumber.get(grenade.roundNumber);
      const player = pkg.players[grenade.throwerIndex];
      const effect = effectCalloutFor(grid, grenade.effectPosition);
      return {
        roundNumber: grenade.roundNumber,
        grenade: grenade.grenade,
        throwerIndex: grenade.throwerIndex,
        throwTick: grenade.throwTick,
        throwPosition: grenade.throwPosition,
        effectPosition: grenade.effectPosition,
        entryId: matchId,
        freezeEndTick: round?.freezeEndTick ?? 0,
        throwerPlaceName: throwerPlaceAt(pkg, grenade.roundNumber, grenade.throwerIndex, grenade.throwTick),
        effectCallout: effect.callout,
        effectCalloutConfidence: effect.confidence,
        effectCalloutSamples: effect.samples,
        side: sideOf(pkg, grenade.throwerIndex, grenade.roundNumber),
        teamKey: player?.teamKey ?? null
      };
    })
  };
}


// ── 每回合解码一次（避免每个 snapshot/进点/C4 轨迹重复 decodeDelta）──────────────
interface DecodedTrack {
  playerIndex: number;
  side: Side | null;
  x: number[];  // 游戏单位（已 × coordScale）
  y: number[];
  z: number[];
  flags: number[];
  place: number[];
}

interface DecodedRound {
  startTick: number;
  tickStep: number;
  frameCount: number;
  tracks: DecodedTrack[];
  placeDict: string[];
}

/** 解码一回合所有玩家轨迹（x/y/z 前缀和 × coordScale）；无回放返回 null。 */
function decodeRound(pkg: DemoPackage, round: DemoPackage["rounds"][number]): DecodedRound | null {
  const replay = pkg.replay;
  const replayRound = replay?.rounds.find((row) => row.roundNumber === round.roundNumber);
  if (!replay || !replayRound) return null;
  const scale = replay.meta.coordScale;
  const tracks: DecodedTrack[] = replayRound.players.map((track) => {
    const player = pkg.players[track.playerIndex];
    const side = player ? (player.teamKey === "teamA" ? round.teamASide : round.teamBSide) : null;
    return {
      playerIndex: track.playerIndex,
      side,
      x: decodeDelta(track.x).map((v) => v * scale),
      y: decodeDelta(track.y).map((v) => v * scale),
      z: decodeDelta(track.z).map((v) => v * scale),
      flags: track.flags,
      place: track.place,
    };
  });
  return {
    startTick: replayRound.startTick,
    tickStep: replayRound.tickStep,
    frameCount: replayRound.frameCount,
    tracks,
    placeDict: replay.placeDict ?? [],
  };
}

function frameIndexAt(dr: DecodedRound, tick: number): number {
  return Math.max(0, Math.min(dr.frameCount - 1, Math.round((tick - dr.startTick) / dr.tickStep)));
}

/** 某帧某玩家的 callout：优先 placeDict，回退到 callout-grid 邻近格。 */
function calloutAtFrame(dr: DecodedRound, track: DecodedTrack, index: number, grid: CalloutGrid | null): string | null {
  const place = dr.placeDict[track.place[index] ?? -1] ?? null;
  if (place) return place;
  return effectCalloutFor(grid, { x: track.x[index] ?? 0, y: track.y[index] ?? 0, z: track.z[index] ?? 0 }).callout;
}

// ── TacticalRoundFact helpers ─────────────────────────────────────────────────

const ROUND_SECONDS = 115; // 1:55 倒计时起点

function remainSecAt(tick: number, freezeEndTick: number, tickrate: number): number {
  return Math.max(0, Math.round(ROUND_SECONDS - (tick - freezeEndTick) / tickrate));
}

function bucketOf(remainSec: number | null): ExecuteBucket | null {
  if (remainSec == null) return null;
  if (remainSec > 95) return "rush";  // 剩 >1:35
  if (remainSec > 70) return "fast";  // 1:35–1:10
  if (remainSec > 40) return "mid";   // 1:10–0:40
  return "late";                      // <0:40
}

function snapshotAt(
  dr: DecodedRound,
  mapName: string,
  side: Side,
  tick: number,
  freezeEndTick: number,
  tickrate: number,
  grid: CalloutGrid | null
): TacticalSnapshot {
  const remainSec = remainSecAt(tick, freezeEndTick, tickrate);
  const defaults: Record<string, number> = {};
  const advanced: Record<string, number> = {};
  const positions: TacticalSnapshot["positions"] = [];
  const index = frameIndexAt(dr, tick);
  for (const track of dr.tracks) {
    if (track.side !== side) continue;
    if (((track.flags[index] ?? 0) & FLAG_ALIVE) === 0) continue;
    const place = dr.placeDict[track.place[index] ?? -1] ?? null;
    if (place) {
      const role = roleOf(mapName, side, place);
      if (role.kind === "default") {
        defaults[role.anchorId] = (defaults[role.anchorId] ?? 0) + 1;
      } else if (role.kind === "advanced") {
        advanced[place] = (advanced[place] ?? 0) + 1;
      }
    }
    const point = { x: track.x[index] ?? 0, y: track.y[index] ?? 0, z: track.z[index] ?? 0 };
    positions.push({
      playerIndex: track.playerIndex,
      ...point,
      callout: place || effectCalloutFor(grid, point).callout,
    });
  }
  return { remainSec, defaults, advanced, positions };
}

function economyTypeFor(
  pkg: DemoPackage,
  round: DemoPackage["rounds"][number],
  teamKey: "teamA" | "teamB"
): EconomyType {
  const teamIndices = new Set(
    pkg.players.map((p, i) => ({ p, i })).filter(({ p }) => p.teamKey === teamKey).map(({ i }) => i)
  );
  const econs = pkg.playerEconomies.filter(
    (e) => e.roundNumber === round.roundNumber && teamIndices.has(e.playerIndex)
  );
  if (econs.length === 0) return "full";
  const counts = new Map<EconomyType, number>();
  for (const e of econs) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function emptySiteEntry(): SiteEntryFact {
  return {
    entrants: 0,
    firstEntryTick: null,
    secondEntryTick: null,
    firstEntryRemainSec: null,
    executeRemainSec: null,
    order: [],
  };
}

function siteFromCallout(callout: string | null): "a" | "b" | null {
  if (!callout) return null;
  if (callout === "BombsiteA") return "a";
  if (callout === "BombsiteB") return "b";
  return null;
}

/** 查 callout 的战术方向：委托 calloutTendency（CALLOUT_DICT 倾向表），
 *  取代旧的 anchorId 前缀启发式（对非标准锚点名会产生误报 "other"）。 */
function targetRegionFromCallout(mapName: string, callout: string | null): TacticalGrenadeOccurrence["targetRegion"] {
  if (!callout) return "unknown";
  return calloutTendency(mapName, callout)?.[0] ?? "unknown";
}

function siteEntriesFor(
  dr: DecodedRound | null,
  round: DemoPackage["rounds"][number],
  side: Side,
  tickrate: number,
  grid: CalloutGrid | null
): { a: SiteEntryFact; b: SiteEntryFact } {
  if (!dr) return { a: emptySiteEntry(), b: emptySiteEntry() };

  const bySite = { a: new Map<number, SiteEntryFact["order"][number]>(), b: new Map<number, SiteEntryFact["order"][number]>() };
  for (const track of dr.tracks) {
    if (track.side !== side) continue;

    const seen = new Set<"a" | "b">();
    // 进入包点前的最后一个非包点 callout = 真实入口路线（A1/A2/拱门），用来区分打法。
    let lastEntryCallout: string | null = null;
    for (let index = 0; index < dr.frameCount; index += 1) {
      const tick = dr.startTick + index * dr.tickStep;
      if (tick < round.freezeEndTick || tick > round.endTick) continue;
      if (((track.flags[index] ?? 0) & FLAG_ALIVE) === 0) break;
      const callout = calloutAtFrame(dr, track, index, grid);
      const site = siteFromCallout(callout);
      if (!site) {
        if (callout) lastEntryCallout = callout;
        continue;
      }
      if (seen.has(site)) continue;
      seen.add(site);
      bySite[site].set(track.playerIndex, {
        playerIndex: track.playerIndex,
        tick,
        remainSec: remainSecAt(tick, round.freezeEndTick, tickrate),
        callout: callout ?? site,
        entryCallout: lastEntryCallout,
      });
    }
  }

  const build = (site: "a" | "b"): SiteEntryFact => {
    const order = [...bySite[site].values()].sort((a, b) => a.tick - b.tick || a.playerIndex - b.playerIndex);
    return {
      entrants: order.length,
      firstEntryTick: order[0]?.tick ?? null,
      secondEntryTick: order[1]?.tick ?? null,
      firstEntryRemainSec: order[0]?.remainSec ?? null,
      executeRemainSec: order[1]?.remainSec ?? null,
      order,
    };
  };

  return { a: build("a"), b: build("b") };
}

/**
 * C4 携带/落点轨迹：扫描每帧持弹（FLAG_HAS_BOMB）玩家的 callout，得到去重相邻序列，
 * 据此推断主攻方向与转点。用作佯攻的第二条独立证据（道具指向 A 但 C4 走向 B → 强佯攻）。
 */
function c4RouteFor(
  dr: DecodedRound | null,
  round: DemoPackage["rounds"][number],
  mapName: string,
  plant: TacticalPlantFact | null,
  grid: CalloutGrid | null
): C4RouteFact | null {
  if (!dr) return null;
  const callouts: string[] = [];
  let carrierIndex = -1; // 缓存的持弹者索引，利用时空局部性减少线性搜索
  for (let index = 0; index < dr.frameCount; index += 1) {
    const tick = dr.startTick + index * dr.tickStep;
    if (tick < round.freezeEndTick || tick > round.endTick) continue;
    // 优先检查上次已知持弹者（同一玩家很少切枪/死亡后立即换人，绝大多数帧命中缓存）
    if (carrierIndex < 0 ||
      ((dr.tracks[carrierIndex]?.flags[index] ?? 0) & FLAG_ALIVE) === 0 ||
      ((dr.tracks[carrierIndex]?.flags[index] ?? 0) & FLAG_HAS_BOMB) === 0) {
      carrierIndex = dr.tracks.findIndex((track) =>
        ((track.flags[index] ?? 0) & FLAG_ALIVE) !== 0 && ((track.flags[index] ?? 0) & FLAG_HAS_BOMB) !== 0
      );
    }
    if (carrierIndex < 0) continue;
    const callout = calloutAtFrame(dr, dr.tracks[carrierIndex]!, index, grid);
    if (callout && callout !== callouts[callouts.length - 1]) callouts.push(callout);
  }
  if (callouts.length === 0) return null;
  const regionOf = (callout: string) => targetRegionFromCallout(mapName, callout);
  const regions = callouts.map(regionOf).filter((r): r is "a" | "b" | "mid" | "other" => r !== "unknown");
  const directional = regions.filter((r): r is "a" | "b" => r === "a" || r === "b");
  const startRegion = regions[0] ?? null;
  const endRegion = regions[regions.length - 1] ?? null;
  const firstSide = directional[0] ?? null;
  const lastSide = directional[directional.length - 1] ?? null;
  const rotated = Boolean(firstSide && lastSide && firstSide !== lastSide);
  return {
    callouts,
    startRegion,
    endRegion,
    rotated,
    plantCallout: plant ? callouts[callouts.length - 1] ?? null : null,
  };
}

function plantFor(pkg: DemoPackage, round: DemoPackage["rounds"][number], tickrate: number): TacticalPlantFact | null {
  const plant = pkg.bombs.find((b) => b.roundNumber === round.roundNumber && b.type === "planted" && (b.site === "a" || b.site === "b"));
  if (!plant || (plant.site !== "a" && plant.site !== "b")) return null;
  return { site: plant.site, tick: plant.tick, remainSec: remainSecAt(plant.tick, round.freezeEndTick, tickrate) };
}

function targetSiteFor(plant: TacticalPlantFact | null, entries: { a: SiteEntryFact; b: SiteEntryFact }): "a" | "b" | null {
  if (plant) return plant.site;
  if (entries.a.entrants > entries.b.entrants) return "a";
  if (entries.b.entrants > entries.a.entrants) return "b";
  return null;
}

function grenadeOccurrencesFor(
  pkg: DemoPackage,
  matchId: string,
  round: DemoPackage["rounds"][number],
  side: Side,
  grid: CalloutGrid | null
): TacticalGrenadeOccurrence[] {
  return (pkg.grenades ?? [])
    .map((grenade, index) => ({ grenade, index }))
    .filter(({ grenade }) => grenade.roundNumber === round.roundNumber && sideOf(pkg, grenade.throwerIndex, round.roundNumber) === side)
    .map(({ grenade, index }) => {
      const effect = effectCalloutFor(grid, grenade.effectPosition);
      const throwCallout = throwerPlaceAt(pkg, grenade.roundNumber, grenade.throwerIndex, grenade.throwTick);
      return {
        id: grenade.grenadeId ?? `${matchId}:r${grenade.roundNumber}:g${index}`,
        type: grenade.grenade,
        throwTick: grenade.throwTick,
        effectTick: grenade.effectTick ?? null,
        throwPosition: grenade.throwPosition,
        effectPosition: grenade.effectPosition,
        throwCallout,
        effectCallout: effect.callout,
        effectCalloutSource: effect.source,
        effectCalloutDistance: effect.distance,
        confidence: effect.confidence ?? 0,
        samples: effect.samples ?? 0,
        targetRegion: targetRegionFromCallout(pkg.match.mapName, effect.callout),
      };
    });
}

function firstKillForTeamFor(
  pkg: DemoPackage,
  round: DemoPackage["rounds"][number],
  teamKey: "teamA" | "teamB"
): boolean | null {
  const kills = pkg.kills.filter((k) => k.roundNumber === round.roundNumber).sort((a, b) => a.tick - b.tick);
  if (kills.length === 0) return null;
  const first = kills[0];
  if (first.killerIndex == null) return null;
  const killer = pkg.players[first.killerIndex];
  if (!killer) return null;
  return killer.teamKey === teamKey;
}

function extractTacticalRoundFacts(pkg: DemoPackage, matchId: string, grid: CalloutGrid | null): TacticalRoundFact[] {
  const tickrate = pkg.match.tickrate || 64;
  const mapName = pkg.match.mapName;
  const out: TacticalRoundFact[] = [];
  for (const round of pkg.rounds) {
    const fe = round.freezeEndTick;
    // 每回合解码一次玩家轨迹，snapshots / 进点 / C4 轨迹共用，避免重复 decodeDelta。
    const dr = decodeRound(pkg, round);
    // T: 剩 1:30 / 1:10 / 0:55 / 0:35（从 1:55 倒计时；回合提前结束的切片自动剔除）
    const tSlices = [fe + 25 * tickrate, fe + 45 * tickrate, fe + 60 * tickrate, fe + 80 * tickrate];
    // CT: 剩 1:35 / 1:00 / 0:30
    const ctSlices = [fe + 20 * tickrate, fe + 55 * tickrate, fe + 85 * tickrate];
    const plant = plantFor(pkg, round, tickrate);
    for (const side of ["t", "ct"] as const) {
      const slices = side === "t" ? tSlices : ctSlices;
      const allSnapshots = dr
        ? slices.map((tk) => snapshotAt(dr, mapName, side, tk, fe, tickrate, grid))
        : slices.map((tk) => ({ remainSec: remainSecAt(tk, fe, tickrate), defaults: {}, advanced: {}, positions: [] }));
      // T 方：回合提前结束后无存活玩家的切片自动剔除，保留 1-4 片。
      const snapshots = side === "t" ? allSnapshots.filter((s) => s.positions.length > 0) : allSnapshots;
      if (snapshots.every((s) => Object.keys(s.defaults).length === 0 && Object.keys(s.advanced).length === 0 && s.positions.length === 0)) continue;
      const teamKey = round.teamASide === side ? "teamA" : "teamB";
      const entries = siteEntriesFor(dr, round, side, tickrate, grid);
      const target = targetSiteFor(plant, entries);
      const exec = target ? entries[target].executeRemainSec : null;
      const grenades = grenadeOccurrencesFor(pkg, matchId, round, side, grid);
      // C4 轨迹只对进攻方（T）有意义。
      const c4Route = side === "t" ? c4RouteFor(dr, round, mapName, plant, grid) : null;
      out.push({
        analysisVersion: TACTICAL_FACT_VERSION,
        matchId, mapName, side, teamKey,
        teamName: teamNameOf(pkg, teamKey),
        opponentName: teamNameOf(pkg, opponentTeamKey(teamKey)),
        economy: economyTypeFor(pkg, round, teamKey),
        won: round.winnerSide === side,
        roundNumber: round.roundNumber,
        snapshots, targetSite: target,
        siteEntries: entries,
        plant,
        grenades,
        c4Route,
        executeRemainSec: exec, executeBucket: bucketOf(exec),
        firstKillForTeam: firstKillForTeamFor(pkg, round, teamKey),
        grenadeOccurrenceIds: grenades.map((grenade) => grenade.id),
      });
    }
  }
  return out;
}

export function extractMatchFacts(pkg: DemoPackage, options: ExtractMatchFactsOptions): MatchFacts {
  const playerKeyFor = options.playerKeyFor ?? defaultPlayerKey;
  const playerStats = pkg.playerStats.map((stats): PlayerMatchStatsFact | null => {
    const player = pkg.players[stats.playerIndex];
    if (!player) return null;
    return {      matchId: options.matchId,
      playerKey: playerKeyFor(player),
      steamId64: player.steamId64,
      playerName: player.name,
      teamKey: player.teamKey,
      mapName: pkg.match.mapName,
      rounds: stats.rounds,
      kills: stats.kills,
      deaths: stats.deaths,
      assists: stats.assists,
      damageHealth: stats.damageHealth,
      kastRounds: stats.kastRounds,
      firstKillCount: stats.firstKillCount,
      firstDeathCount: stats.firstDeathCount,
      flashAssistCount: stats.flashAssistCount,
      enemyFlashDurationSeconds: stats.enemyFlashDurationSeconds,
      teamFlashDurationSeconds: stats.teamFlashDurationSeconds,
      utilityDamage: stats.utilityDamage,
      tradeKillCount: stats.tradeKillCount,
      tradeDeathCount: stats.tradeDeathCount,
      headshotCount: stats.headshotCount,
      vsOneCount: stats.vsOneCount,
      vsOneWonCount: stats.vsOneWonCount,
      vsTwoCount: stats.vsTwoCount,
      vsTwoWonCount: stats.vsTwoWonCount,
      vsThreeCount: stats.vsThreeCount,
      vsThreeWonCount: stats.vsThreeWonCount,
      vsFourCount: stats.vsFourCount,
      vsFourWonCount: stats.vsFourWonCount,
      vsFiveCount: stats.vsFiveCount,
      vsFiveWonCount: stats.vsFiveWonCount
    } satisfies PlayerMatchStatsFact;
  }).filter((row): row is PlayerMatchStatsFact => row != null);

  const players = playerBySteamId(pkg);
  const rrSignals = deriveRRSignals(pkg);
  const rrIndicators = deriveRRIndicators(pkg);
  const weaponHighlights = derivePlayerWeaponHighlights(pkg);
  const signalBySteamId = new Map(rrSignals.map((row) => [row.steamId64, row]));
  const indicatorBySteamId = new Map(rrIndicators.map((row) => [row.steamId64, row]));
  const weaponBySteamId = new Map(weaponHighlights.map((row) => [row.steamId64, row]));
  const playerInsights = pkg.players.map((player) => ({    matchId: options.matchId,
    playerKey: playerKeyFor(player),
    steamId64: player.steamId64,
    playerName: player.name,
    insight: buildPlayerSeasonInsights([{ matchId: options.matchId, pkg }], [player.steamId64])
  } satisfies PlayerInsightFact));

  const weaponCells = new Map<string, PlayerWeaponFact>();
  for (const kill of pkg.kills) {
    if (kill.killerIndex == null) continue;
    const killer = pkg.players[kill.killerIndex];
    if (!killer) continue;
    const weapon = kill.weapon || "unknown";
    const key = rowKey(options.matchId, killer.steamId64, weapon);
    const cell = weaponCells.get(key) ?? {      matchId: options.matchId,
      playerKey: playerKeyFor(killer),
      steamId64: killer.steamId64,
      playerName: killer.name,
      weapon,
      kills: 0,
      headshots: 0
    };
    cell.kills += 1;
    if (kill.headshot) cell.headshots += 1;
    weaponCells.set(key, cell);
  }
  const playerWeapons = [...weaponCells.values()];

  const mechanicsSamples = derivePlayerMechanics(pkg, {
    visibility: options.visibilityFor?.(pkg.match.mapName) ?? null
  }).map((row) => {
    const player = players.get(row.steamId64);
    return {      matchId: options.matchId,
      playerKey: player ? playerKeyFor(player) : defaultPlayerKey(row),
      steamId64: row.steamId64,
      playerName: player?.name ?? row.steamId64,
      weapon: row.weapon,
      row
    } satisfies MechanicsSamplesFact;
  });

  const cohortRows = pkg.players.map((player): CohortFact | null => {
    const signals = signalBySteamId.get(player.steamId64);
    const indicators = indicatorBySteamId.get(player.steamId64);
    if (!signals || !indicators) return null;
    return {      matchId: options.matchId,
      playerKey: playerKeyFor(player),
      steamId64: player.steamId64,
      playerName: player.name,
      row: {
        matchId: options.matchId,
        sourceDemoHash: pkg.manifest.demo?.hash ?? null,
        steamId64: player.steamId64,
        playerName: player.name,
        teamKey: player.teamKey,
        signals,
        indicators,
        weaponHighlight: weaponBySteamId.get(player.steamId64) ?? null
      }
    };
  }).filter((row): row is CohortFact => row != null);
  const mapName = pkg.match.mapName;
  const visibilityFor = options.visibilityFor?.(mapName) ?? null;
  const calloutGrid = options.calloutGrid ?? null;
  const input = { matchId: options.matchId, pkg };
  const matchWorkspace = buildMatchWorkspaceModel(pkg);
  const openingTrails = pkg.players.map((player) => ({    matchId: options.matchId,
    mapName,
    playerKey: playerKeyFor(player),
    steamId64: player.steamId64,
    row: buildOpeningTrails(pkg, options.matchId, player.steamId64, { windowSeconds: 30 })
  } satisfies OpeningTrailFact));

  return {    matchId: options.matchId,
    mapName,
    playerMatchStats: playerStats,
    playerInsights,
    playerWeapons,
    mechanicsSamples,
    cohortRows,
    tournamentFacts: [{      matchId: options.matchId,
      mapName,
      row: extractTournamentFacts(input)
    }],
    teamComparisonFacts: [{      matchId: options.matchId,
      mapName,
      row: extractTeamComparisonFacts(input)
    }],
    duelFacts: [{      matchId: options.matchId,
      mapName,
      row: extractDuelInsightsFacts(input, { visibilityFor: () => visibilityFor })
    }],
    matchWorkspace: [{      matchId: options.matchId,
      mapName,
      row: matchWorkspace
    }],
    openingTrails,
    lineups: [extractLineupFact(pkg, options.matchId, calloutGrid)],
    tacticalRounds: extractTacticalRoundFacts(pkg, options.matchId, calloutGrid)
  };
}

function inScope(row: { matchId: string; playerKey?: string; mapName?: string; steamId64?: string }, scope?: FactsScope): boolean {
  if (!scope) return true;
  if (scope.matchIds && !scope.matchIds.includes(row.matchId)) return false;
  const steamId64 = row.steamId64 ?? "";
  if (scope.playerKeys && scope.steamIds) {
    if ((!row.playerKey || !scope.playerKeys.includes(row.playerKey)) && !scope.steamIds.includes(steamId64)) return false;
  } else {
    if (scope.playerKeys && (!row.playerKey || !scope.playerKeys.includes(row.playerKey))) return false;
    if (scope.steamIds && !scope.steamIds.includes(steamId64)) return false;
  }
  if (scope.mapNames && (!row.mapName || !scope.mapNames.includes(row.mapName))) return false;
  return true;
}

/**
 * 用新行整体替换某 matchId 的旧行。
 *
 * 委托后端 deleteByPrefix 实现键范围删除（IDBKeyRange / SQL LIKE），
 * 无需反序列化 key→value 映射，彻底消除批量重导时的 OOM 风险。
 */
async function replaceRows<T extends { matchId: string }>(
  store: RecordStore,
  rows: Array<[string, T]>,
  matchId: string
): Promise<void> {
  await store.deleteByPrefix(matchId);
  if (rows.length > 0) {
    await Promise.all(rows.map(([key, row]) => store.put(key, row)));
  }
}

const ROW_KEY_SEP = "\t";

function rowKey(...parts: string[]): string {
  return parts.join(ROW_KEY_SEP);
}

export function createFactsStore(adapter: StorageAdapter, namespace = "facts"): FactsStore {
  const playerStats = adapter.records(`${namespace}:player_match_stats`);
  const playerInsights = adapter.records(`${namespace}:player_insights`);
  const playerWeapons = adapter.records(`${namespace}:player_weapons`);
  const mechanics = adapter.records(`${namespace}:mechanics_samples`);
  const cohortRows = adapter.records(`${namespace}:cohort_rows`);
  const tournamentFacts = adapter.records(`${namespace}:tournament_facts`);
  const teamComparisonFacts = adapter.records(`${namespace}:team_comparison_facts`);
  const duelFacts = adapter.records(`${namespace}:duel_facts`);
  const matchWorkspace = adapter.records(`${namespace}:match_workspace`);
  const openingTrails = adapter.records(`${namespace}:opening_trails`);
  const lineups = adapter.records(`${namespace}:lineups`);
  const tacticalRounds = adapter.records(`${namespace}:tactical_rounds`);

  return {
    async putMatchFacts(facts) {
      await Promise.all([
        replaceRows(
          playerStats,
          facts.playerMatchStats.map((row) => [rowKey(row.matchId, row.playerKey), row]),
          facts.matchId
        ),
        replaceRows(
          playerInsights,
          facts.playerInsights.map((row) => [rowKey(row.matchId, row.playerKey), row]),
          facts.matchId
        ),
        replaceRows(
          playerWeapons,
          facts.playerWeapons.map((row) => [rowKey(row.matchId, row.playerKey, row.weapon), row]),
          facts.matchId
        ),
        replaceRows(
          mechanics,
          facts.mechanicsSamples.map((row) => [rowKey(row.matchId, row.playerKey, row.weapon), row]),
          facts.matchId
        ),
        replaceRows(
          cohortRows,
          facts.cohortRows.map((row) => [rowKey(row.matchId, row.playerKey), row]),
          facts.matchId
        ),
        replaceRows(
          tournamentFacts,
          facts.tournamentFacts.map((row) => [row.matchId, row]),
          facts.matchId
        ),
        replaceRows(
          teamComparisonFacts,
          facts.teamComparisonFacts.map((row) => [row.matchId, row]),
          facts.matchId
        ),
        replaceRows(
          duelFacts,
          facts.duelFacts.map((row) => [row.matchId, row]),
          facts.matchId
        ),
        replaceRows(
          matchWorkspace,
          facts.matchWorkspace.map((row) => [row.matchId, row]),
          facts.matchId
        ),
        replaceRows(
          openingTrails,
          facts.openingTrails.map((row) => [rowKey(row.matchId, row.playerKey), row]),
          facts.matchId
        ),
        replaceRows(
          lineups,
          facts.lineups.map((row) => [row.matchId, row]),
          facts.matchId
        ),
        replaceRows(
          tacticalRounds,
          facts.tacticalRounds.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.side), row]),
          facts.matchId
        )
      ]);
    },
    async getPlayerMatchStats(scope) {
      return (await playerStats.getAll<PlayerMatchStatsFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerName.localeCompare(b.playerName));
    },
    async getPlayerInsights(scope) {
      return (await playerInsights.getAll<PlayerInsightFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerName.localeCompare(b.playerName));
    },
    async getPlayerWeapons(scope) {
      return (await playerWeapons.getAll<PlayerWeaponFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.weapon.localeCompare(b.weapon));
    },
    async getMechanicsRows(scope) {
      const rows = (await mechanics.getAll<MechanicsSamplesFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey) || a.weapon.localeCompare(b.weapon));
      const byMatch = new Map<string, PlayerMechanicsFact[]>();
      for (const row of rows) {
        const bucket = byMatch.get(row.matchId) ?? [];
        bucket.push(row.row);
        byMatch.set(row.matchId, bucket);
      }
      return [...byMatch.entries()].map(([matchId, matchRows]) => ({ matchId, rows: matchRows }));
    },
    async getCohortRows(scope) {
      return (await cohortRows.getAll<CohortFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey))
        .map((row) => row.row);
    },
    async getTournamentFacts(scope) {
      return (await tournamentFacts.getAll<TournamentFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId))
        .map((row) => row.row);
    },
    async getTeamComparisonFacts(scope) {
      return (await teamComparisonFacts.getAll<TeamComparisonFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId))
        .map((row) => row.row);
    },
    async getDuelFacts(scope) {
      return (await duelFacts.getAll<DuelFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId))
        .map((row) => row.row);
    },
    async getMatchWorkspaces(scope) {
      return (await matchWorkspace.getAll<MatchWorkspaceFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId));
    },
    async getOpeningTrails(scope) {
      return (await openingTrails.getAll<OpeningTrailFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey));
    },
    async getLineups(scope) {
      return (await lineups.getAll<LineupFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId));
    },
    async getTacticalRounds(scope) {
      return (await tacticalRounds.getAll<TacticalRoundFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber || a.side.localeCompare(b.side));
    },
    async deleteMatchFacts(matchId) {
      await Promise.all(
        [playerStats, playerInsights, playerWeapons, mechanics,
         cohortRows, tournamentFacts, teamComparisonFacts, duelFacts,
         matchWorkspace, openingTrails, lineups, tacticalRounds]
          .map((store) => store.deleteByPrefix(matchId))
      );
    }
  };
}

let factsStore: FactsStore | null = null;

export function getFactsStore(): FactsStore {
  return (factsStore ??= createFactsStore(getStorage()));
}

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
      worstTeamFlashes: []
    },
    mistakes: {
      lowBuyFirstDeaths: { count: 0, attempts: 0, evidence: [] },
      fullBuyFirstDeaths: { count: 0, attempts: 0, evidence: [] },
      antiEcoFirstDeaths: { count: 0, attempts: 0, evidence: [] },
      deathTiming: { early: 0, mid: 0, late: 0, total: 0 },
      clutchLosses: { count: 0, evidence: [] }
    }
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
  out.mistakes.lowBuyFirstDeaths.evidence = out.mistakes.lowBuyFirstDeaths.evidence.slice(0, 10);
  out.mistakes.fullBuyFirstDeaths.evidence = out.mistakes.fullBuyFirstDeaths.evidence.slice(0, 10);
  out.mistakes.antiEcoFirstDeaths.evidence = out.mistakes.antiEcoFirstDeaths.evidence.slice(0, 10);
  out.mistakes.clutchLosses.evidence = out.mistakes.clutchLosses.evidence.slice(0, 10);
  return out;
}

function mergeWeaponStats(rows: PlayerWeaponFact[], matchCount: number): PlayerWeaponStat[] {
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
      killsPerMatch: round2(row.kills / denominator)
    }))
    .sort((a, b) => b.kills - a.kills || a.label.localeCompare(b.label));
}

export async function buildPlayerSeasonDetailsFromFacts(
  store: FactsStore,
  options: PlayerSeasonDetailsFactsOptions
): Promise<PlayerSeasonDetailsFromFacts> {
  const [insights, weapons, mechanics] = await Promise.all([
    store.getPlayerInsights(options),
    store.getPlayerWeapons(options),
    store.getMechanicsRows(options)
  ]);
  return {
    insights: mergeInsights(insights),
    weaponStats: mergeWeaponStats(weapons, mechanics.length),
    mechanics: buildPlayerMechanicsProfileFromRows(mechanics.map((match) => match.rows), options.steamIds, mechanics.length)
  };
}

export async function buildPlayerFlashSummariesFromFacts(
  store: FactsStore,
  options: PlayerFlashSummariesFactsOptions
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
}>> {
  return Promise.all(options.players.map(async (player) => {
    const merged = mergeInsights(await store.getPlayerInsights({
      matchIds: options.matchIds,
      mapNames: options.mapNames,
      playerKeys: [player.playerKey],
      steamIds: player.steamIds
    }));
    return {
      playerKey: player.playerKey,
      name: player.name,
      ...merged.flash
    };
  }));
}
