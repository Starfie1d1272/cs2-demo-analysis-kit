import {
  FLAG_ALIVE,
  FLAG_HAS_BOMB,
  decodeDelta,
  type DemoPackage,
  type EconomyType,
  type Side,
  type TeamKey,
} from "@cs2dak/contract";
import {
  calloutNear,
  getCalloutTendencies,
  getPrimaryCalloutRegion,
  resolveSiteEntry,
  type CalloutGrid,
  type TacticalRegion,
  type Vec3,
} from "@cs2dak/maps";
import { buildPlayerTacticalSegments } from "./segments.js";
import { deriveOpeningPattern, deriveOpeningPressure } from "./formations.js";
import type { OpeningPattern, OpeningPressureEvent, TacticalFrameSample } from "./types.js";

export const TACTICAL_FACT_VERSION = 9;
export type ExecuteBucket = "rush" | "fast" | "mid" | "late";

export interface SiteEntryOccurrence {
  playerIndex: number;
  tick: number;
  remainSec: number;
  callout: string;
  /** 原始最后一个非包点 callout，仅作为证据。 */
  entryCallout: string | null;
  entryChokeId: string | null;
  routeFamilyId: string | null;
  routeMarkerCallout: string | null;
  /** freeze end 到首次进点的去重 callout 序列。 */
  trajectory: string[];
}

export interface SiteEntryFact {
  entrants: number;
  firstEntryTick: number | null;
  secondEntryTick: number | null;
  firstEntryRemainSec: number | null;
  executeRemainSec: number | null;
  distinctEntryChokeIds?: string[];
  entrySpanSec?: number | null;
  order: SiteEntryOccurrence[];
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
  targetRegion: TacticalRegion | "other" | "unknown";
  tendencies?: readonly TacticalRegion[];
}

export interface C4RouteFact {
  /** 原始相邻去重轨迹，仅作为证据，不直接等同于战术。 */
  callouts: string[];
  startRegion: TacticalRegion | "other" | null;
  endRegion: TacticalRegion | "other" | null;
  rotated: boolean;
  plantCallout: string | null;
}

export interface TacticalRoundFact {
  analysisVersion: number;
  matchId: string;
  mapName: string;
  side: Side;
  teamKey: TeamKey;
  teamName: string;
  opponentName: string;
  /** ZIP rounds.json 的本方原生经济。 */
  economy: EconomyType;
  opponentEconomy: EconomyType;
  won: boolean;
  roundNumber: number;
  openingPattern: OpeningPattern;
  openingPressure: OpeningPressureEvent[];
  targetSite: "a" | "b" | null;
  siteEntries: { a: SiteEntryFact; b: SiteEntryFact };
  plant: TacticalPlantFact | null;
  grenades: TacticalGrenadeOccurrence[];
  c4Route: C4RouteFact | null;
  executeRemainSec: number | null;
  executeBucket: ExecuteBucket | null;
  firstKillForTeam: boolean | null;
  grenadeOccurrenceIds: string[];
}

interface DecodedTrack {
  playerIndex: number;
  side: Side | null;
  x: number[];
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

function decodeRound(pkg: DemoPackage, round: DemoPackage["rounds"][number]): DecodedRound | null {
  const replayRound = pkg.replay?.rounds.find((row) => row.roundNumber === round.roundNumber);
  if (!pkg.replay || !replayRound) return null;
  const scale = pkg.replay.meta.coordScale;
  return {
    startTick: replayRound.startTick,
    tickStep: replayRound.tickStep,
    frameCount: replayRound.frameCount,
    placeDict: pkg.replay.placeDict ?? [],
    tracks: replayRound.players.map((track) => {
      const player = pkg.players[track.playerIndex];
      const side = player
        ? (player.teamKey === "teamA" ? round.teamASide : round.teamBSide)
        : null;
      return {
        playerIndex: track.playerIndex,
        side,
        x: decodeDelta(track.x).map((value) => value * scale),
        y: decodeDelta(track.y).map((value) => value * scale),
        z: decodeDelta(track.z).map((value) => value * scale),
        flags: track.flags,
        place: track.place,
      };
    }),
  };
}

function locateGrid(grid: CalloutGrid | null, point: Vec3) {
  if (!grid) return null;
  return calloutNear(grid, point, { horizontalRadius: 20, verticalRadius: 40 });
}

function calloutAtFrame(
  decoded: DecodedRound,
  track: DecodedTrack,
  index: number,
  grid: CalloutGrid | null,
): string | null {
  const place = decoded.placeDict[track.place[index] ?? -1] ?? null;
  if (place) return place;
  return locateGrid(grid, {
    x: track.x[index] ?? 0,
    y: track.y[index] ?? 0,
    z: track.z[index] ?? 0,
  })?.callout ?? null;
}

const ROUND_SECONDS = 115;

function remainSecAt(tick: number, freezeEndTick: number, tickrate: number): number {
  return Math.max(0, Math.round(ROUND_SECONDS - (tick - freezeEndTick) / tickrate));
}

function bucketOf(remainSec: number | null): ExecuteBucket | null {
  if (remainSec == null) return null;
  if (remainSec > 95) return "rush";
  if (remainSec > 70) return "fast";
  if (remainSec > 40) return "mid";
  return "late";
}

function economyFor(round: DemoPackage["rounds"][number], teamKey: TeamKey): EconomyType {
  return teamKey === "teamA" ? round.teamAEconomy : round.teamBEconomy;
}

function emptySiteEntry(): SiteEntryFact {
  return {
    entrants: 0,
    firstEntryTick: null,
    secondEntryTick: null,
    firstEntryRemainSec: null,
    executeRemainSec: null,
    distinctEntryChokeIds: [],
    entrySpanSec: null,
    order: [],
  };
}

function openingAnalysisFor(
  decoded: DecodedRound | null,
  round: DemoPackage["rounds"][number],
  mapName: string,
  side: Side,
  tickrate: number,
  grid: CalloutGrid | null,
): { openingPattern: OpeningPattern; openingPressure: OpeningPressureEvent[] } {
  const endTick = Math.min(round.endTick, round.freezeEndTick + 30 * tickrate);
  const samples: TacticalFrameSample[] = [];
  for (const track of decoded?.tracks ?? []) {
    if (track.side !== side) continue;
    for (let index = 0; index < (decoded?.frameCount ?? 0); index += 1) {
      const tick = decoded!.startTick + index * decoded!.tickStep;
      if (tick < round.freezeEndTick) continue;
      if (tick > endTick) break;
      const alive = ((track.flags[index] ?? 0) & FLAG_ALIVE) !== 0;
      samples.push({
        tick,
        playerIndex: track.playerIndex,
        side,
        alive,
        callout: alive ? calloutAtFrame(decoded!, track, index, grid) : null,
      });
    }
  }
  const segments = buildPlayerTacticalSegments(samples, {
    mapName,
    tickrate,
    maxGapTicks: decoded ? decoded.tickStep * 2 : undefined,
  });
  return {
    openingPattern: deriveOpeningPattern(segments, { side, startTick: round.freezeEndTick, endTick }),
    openingPressure: deriveOpeningPressure(segments, { mapName, side, startTick: round.freezeEndTick, endTick }),
  };
}

function siteEntriesFor(
  decoded: DecodedRound | null,
  round: DemoPackage["rounds"][number],
  mapName: string,
  side: Side,
  tickrate: number,
  grid: CalloutGrid | null,
): { a: SiteEntryFact; b: SiteEntryFact } {
  if (!decoded) return { a: emptySiteEntry(), b: emptySiteEntry() };
  const bySite = {
    a: new Map<number, SiteEntryOccurrence>(),
    b: new Map<number, SiteEntryOccurrence>(),
  };
  for (const track of decoded.tracks) {
    if (track.side !== side) continue;
    const seen = new Set<"a" | "b">();
    const trajectory: string[] = [];
    for (let index = 0; index < decoded.frameCount; index += 1) {
      const tick = decoded.startTick + index * decoded.tickStep;
      if (tick < round.freezeEndTick || tick > round.endTick) continue;
      if (((track.flags[index] ?? 0) & FLAG_ALIVE) === 0) break;
      const callout = calloutAtFrame(decoded, track, index, grid);
      if (!callout) continue;
      if (callout !== trajectory.at(-1)) trajectory.push(callout);
      const site = callout === "BombsiteA" ? "a" : callout === "BombsiteB" ? "b" : null;
      if (!site || seen.has(site)) continue;
      seen.add(site);
      const resolved = resolveSiteEntry(mapName, site, trajectory);
      bySite[site].set(track.playerIndex, {
        playerIndex: track.playerIndex,
        tick,
        remainSec: remainSecAt(tick, round.freezeEndTick, tickrate),
        callout,
        entryCallout: trajectory.at(-2) ?? null,
        entryChokeId: resolved.entryChokeId,
        routeFamilyId: resolved.routeFamilyId,
        routeMarkerCallout: resolved.routeMarkerCallout,
        trajectory: [...trajectory],
      });
    }
  }
  const build = (site: "a" | "b"): SiteEntryFact => {
    const order = [...bySite[site].values()].sort((a, b) => a.tick - b.tick || a.playerIndex - b.playerIndex);
    const first = order[0];
    const last = order.at(-1);
    return {
      entrants: order.length,
      firstEntryTick: first?.tick ?? null,
      secondEntryTick: order[1]?.tick ?? null,
      firstEntryRemainSec: first?.remainSec ?? null,
      executeRemainSec: order[1]?.remainSec ?? null,
      distinctEntryChokeIds: [...new Set(order.flatMap((row) => row.entryChokeId ? [row.entryChokeId] : []))].sort(),
      entrySpanSec: first && last ? Math.round(((last.tick - first.tick) / tickrate) * 10) / 10 : null,
      order,
    };
  };
  return { a: build("a"), b: build("b") };
}

function targetRegion(mapName: string, callout: string | null): TacticalGrenadeOccurrence["targetRegion"] {
  if (!callout) return "unknown";
  return getPrimaryCalloutRegion(mapName, callout) ?? "unknown";
}

function plantFor(pkg: DemoPackage, round: DemoPackage["rounds"][number], tickrate: number): TacticalPlantFact | null {
  const plant = pkg.bombs.find((event) =>
    event.roundNumber === round.roundNumber && event.type === "planted" && (event.site === "a" || event.site === "b"),
  );
  if (!plant || (plant.site !== "a" && plant.site !== "b")) return null;
  return { site: plant.site, tick: plant.tick, remainSec: remainSecAt(plant.tick, round.freezeEndTick, tickrate) };
}

function targetSiteFor(plant: TacticalPlantFact | null, entries: { a: SiteEntryFact; b: SiteEntryFact }): "a" | "b" | null {
  if (plant) return plant.site;
  if (entries.a.entrants > entries.b.entrants) return "a";
  if (entries.b.entrants > entries.a.entrants) return "b";
  return null;
}

function throwerCallout(pkg: DemoPackage, roundNumber: number, playerIndex: number, tick: number): string | null {
  const replayRound = pkg.replay?.rounds.find((row) => row.roundNumber === roundNumber);
  const track = replayRound?.players.find((row) => row.playerIndex === playerIndex);
  if (!pkg.replay || !replayRound || !track) return null;
  const frame = Math.max(0, Math.min(replayRound.frameCount - 1, Math.round((tick - replayRound.startTick) / replayRound.tickStep)));
  return pkg.replay.placeDict[track.place[frame] ?? -1] ?? null;
}

function sideOf(pkg: DemoPackage, playerIndex: number, round: DemoPackage["rounds"][number]): Side | null {
  const player = pkg.players[playerIndex];
  if (!player) return null;
  return player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
}

function grenadesFor(
  pkg: DemoPackage,
  matchId: string,
  round: DemoPackage["rounds"][number],
  side: Side,
  grid: CalloutGrid | null,
): TacticalGrenadeOccurrence[] {
  return (pkg.grenades ?? [])
    .map((grenade, index) => ({ grenade, index }))
    .filter(({ grenade }) => grenade.roundNumber === round.roundNumber && sideOf(pkg, grenade.throwerIndex, round) === side)
    .map(({ grenade, index }) => {
      const located = locateGrid(grid, grenade.effectPosition);
      const effectCallout = located?.callout ?? null;
      return {
        id: grenade.grenadeId ?? `${matchId}:r${grenade.roundNumber}:g${index}`,
        type: grenade.grenade,
        throwTick: grenade.throwTick,
        effectTick: grenade.effectTick ?? null,
        throwPosition: grenade.throwPosition,
        effectPosition: grenade.effectPosition,
        throwCallout: throwerCallout(pkg, grenade.roundNumber, grenade.throwerIndex, grenade.throwTick),
        effectCallout,
        effectCalloutSource: located?.source ?? null,
        effectCalloutDistance: located?.distance ?? null,
        confidence: located?.confidence ?? 0,
        samples: located?.samples ?? 0,
        targetRegion: targetRegion(pkg.match.mapName, effectCallout),
        tendencies: effectCallout ? getCalloutTendencies(pkg.match.mapName, effectCallout) ?? [] : [],
      };
    });
}

function c4RouteFor(
  decoded: DecodedRound | null,
  round: DemoPackage["rounds"][number],
  mapName: string,
  plant: TacticalPlantFact | null,
  grid: CalloutGrid | null,
): C4RouteFact | null {
  if (!decoded) return null;
  const callouts: string[] = [];
  let carrierIndex = -1;
  for (let index = 0; index < decoded.frameCount; index += 1) {
    const tick = decoded.startTick + index * decoded.tickStep;
    if (tick < round.freezeEndTick || tick > round.endTick) continue;
    const cached = decoded.tracks[carrierIndex];
    if (!cached || ((cached.flags[index] ?? 0) & FLAG_ALIVE) === 0 || ((cached.flags[index] ?? 0) & FLAG_HAS_BOMB) === 0) {
      carrierIndex = decoded.tracks.findIndex((track) =>
        ((track.flags[index] ?? 0) & FLAG_ALIVE) !== 0 && ((track.flags[index] ?? 0) & FLAG_HAS_BOMB) !== 0,
      );
    }
    if (carrierIndex < 0) continue;
    const callout = calloutAtFrame(decoded, decoded.tracks[carrierIndex]!, index, grid);
    if (callout && callout !== callouts.at(-1)) callouts.push(callout);
  }
  if (callouts.length === 0) return null;
  const regions = callouts.map((callout) => targetRegion(mapName, callout)).filter((region) => region !== "unknown");
  const directional = regions.filter((region): region is "a" | "b" => region === "a" || region === "b");
  return {
    callouts,
    startRegion: regions[0] ?? null,
    endRegion: regions.at(-1) ?? null,
    rotated: Boolean(directional[0] && directional.at(-1) && directional[0] !== directional.at(-1)),
    plantCallout: plant ? callouts.at(-1) ?? null : null,
  };
}

function firstKillForTeam(pkg: DemoPackage, roundNumber: number, teamKey: TeamKey): boolean | null {
  const first = pkg.kills.filter((kill) => kill.roundNumber === roundNumber).sort((a, b) => a.tick - b.tick)[0];
  if (first?.killerIndex == null) return null;
  return pkg.players[first.killerIndex]?.teamKey === teamKey;
}

function teamName(pkg: DemoPackage, teamKey: TeamKey): string {
  return pkg.match[teamKey].name ?? teamKey;
}

export function extractTacticalRoundFacts(
  pkg: DemoPackage,
  options: { matchId: string; calloutGrid?: CalloutGrid | null },
): TacticalRoundFact[] {
  const tickrate = pkg.match.tickrate || 64;
  const out: TacticalRoundFact[] = [];
  for (const round of pkg.rounds) {
    const decoded = decodeRound(pkg, round);
    const plant = plantFor(pkg, round, tickrate);
    for (const side of ["t", "ct"] as const) {
      if (!decoded?.tracks.some((track) => track.side === side)) continue;
      const teamKey: TeamKey = round.teamASide === side ? "teamA" : "teamB";
      const opponentKey: TeamKey = teamKey === "teamA" ? "teamB" : "teamA";
      const entries = siteEntriesFor(decoded, round, pkg.match.mapName, side, tickrate, options.calloutGrid ?? null);
      const opening = openingAnalysisFor(decoded, round, pkg.match.mapName, side, tickrate, options.calloutGrid ?? null);
      const targetSite = targetSiteFor(plant, entries);
      const executeRemainSec = targetSite ? entries[targetSite].executeRemainSec : null;
      const grenades = grenadesFor(pkg, options.matchId, round, side, options.calloutGrid ?? null);
      out.push({
        analysisVersion: TACTICAL_FACT_VERSION,
        matchId: options.matchId,
        mapName: pkg.match.mapName,
        side,
        teamKey,
        teamName: teamName(pkg, teamKey),
        opponentName: teamName(pkg, opponentKey),
        economy: economyFor(round, teamKey),
        opponentEconomy: economyFor(round, opponentKey),
        won: round.winnerSide === side,
        roundNumber: round.roundNumber,
        openingPattern: opening.openingPattern,
        openingPressure: opening.openingPressure,
        targetSite,
        siteEntries: entries,
        plant,
        grenades,
        c4Route: side === "t" ? c4RouteFor(decoded, round, pkg.match.mapName, plant, options.calloutGrid ?? null) : null,
        executeRemainSec,
        executeBucket: bucketOf(executeRemainSec),
        firstKillForTeam: firstKillForTeam(pkg, round.roundNumber, teamKey),
        grenadeOccurrenceIds: grenades.map((grenade) => grenade.id),
      });
    }
  }
  return out;
}
