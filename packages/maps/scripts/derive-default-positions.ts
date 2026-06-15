import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadDemoPackageFromZip } from "../../core/src/index.ts";
import { FLAG_ALIVE, type DemoPackage } from "../../contract/src/index.ts";
import { CALLOUT_DICT, calloutCn } from "../src/callout-names.js";
import { DEFAULT_POSITIONS, type DefaultAnchor } from "../src/default-positions.js";

const WINDOW_SEC = 30;
const DWELL_5_SEC = 5;
const DWELL_10_SEC = 10;
const PHASES = [
  { id: "s0_10", label: "0-10s", start: 0, end: 10 },
  { id: "s10_20", label: "10-20s", start: 10, end: 20 },
  { id: "s20_30", label: "20-30s", start: 20, end: 30 },
] as const;

type Side = "t" | "ct";
type Phase = (typeof PHASES)[number]["id"];
type SideCount = Record<Side, number>;
type Occ = Map<string, SideCount>;
type Transitions = Map<string, SideCount>;
type PhaseOccupancy = Record<Phase, Occ>;

interface SideDwellStats {
  visits: number;
  totalSeconds: number;
  maxContinuousSeconds: number;
  segments5: number;
  segments10: number;
  playerRounds: number;
  playerRounds5: number;
  playerRounds10: number;
  rounds: number;
  rounds5: number;
  rounds10: number;
}

type DwellStats = Record<Side, SideDwellStats>;
type Dwell = Map<string, DwellStats>;

export interface MapEvidence {
  occupancy: Occ;
  phaseOccupancy: PhaseOccupancy;
  transitions: Transitions;
  dwell: Dwell;
  zipCount: number;
  roundCount: number;
  playerRoundCount: SideCount;
}

function emptySideCount(): SideCount {
  return { t: 0, ct: 0 };
}

function emptyPhaseOccupancy(): PhaseOccupancy {
  return {
    s0_10: new Map(),
    s10_20: new Map(),
    s20_30: new Map(),
  };
}

function emptySideDwellStats(): SideDwellStats {
  return {
    visits: 0,
    totalSeconds: 0,
    maxContinuousSeconds: 0,
    segments5: 0,
    segments10: 0,
    playerRounds: 0,
    playerRounds5: 0,
    playerRounds10: 0,
    rounds: 0,
    rounds5: 0,
    rounds10: 0,
  };
}

function getDwellStats(dwell: Dwell, callout: string): DwellStats {
  let current = dwell.get(callout);
  if (!current) {
    current = { t: emptySideDwellStats(), ct: emptySideDwellStats() };
    dwell.set(callout, current);
  }
  return current;
}

function phaseAt(elapsedSec: number): Phase | null {
  if (elapsedSec < 0 || elapsedSec > WINDOW_SEC) return null;
  if (elapsedSec < 10) return "s0_10";
  if (elapsedSec < 20) return "s10_20";
  return "s20_30";
}

function sidePlaceKey(side: Side, place: string): string {
  return `${side}\t${place}`;
}

function parseSidePlaceKey(key: string): [Side, string] {
  const [side, place] = key.split("\t");
  return [side as Side, place];
}

function zipFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...zipFiles(path));
    else if (name.endsWith(".zip")) out.push(path);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

async function loadZip(path: string): Promise<DemoPackage> {
  return loadDemoPackageFromZip(readFileSync(path));
}

function add(occ: Occ, callout: string, side: Side): void {
  const current = occ.get(callout) ?? { t: 0, ct: 0 };
  current[side] += 1;
  occ.set(callout, current);
}

function transitionKey(from: string, to: string): string {
  return `${from}\t${to}`;
}

function addTransition(transitions: Transitions, from: string, to: string, side: Side): void {
  if (from === to) return;
  const key = transitionKey(from, to);
  const current = transitions.get(key) ?? { t: 0, ct: 0 };
  current[side] += 1;
  transitions.set(key, current);
}

function accumulate(pkg: DemoPackage, evidence: MapEvidence): void {
  const replay = pkg.replay;
  if (!replay) return;
  const rounds = new Map(pkg.rounds.map((round) => [round.roundNumber, round]));
  const placeDict = replay.placeDict ?? [];
  const tickrate = pkg.match.tickrate || 64;
  for (const replayRound of replay.rounds) {
    const round = rounds.get(replayRound.roundNumber);
    if (!round) continue;
    evidence.roundCount += 1;
    const endTick = Math.min(round.endTick, round.freezeEndTick + WINDOW_SEC * tickrate);
    const roundSeen = new Set<string>();
    const roundDwell5 = new Set<string>();
    const roundDwell10 = new Set<string>();
    for (const track of replayRound.players) {
      const player = pkg.players[track.playerIndex];
      if (!player) continue;
      const side = player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
      evidence.playerRoundCount[side] += 1;
      const playerSeen = new Set<string>();
      const playerDwell5 = new Set<string>();
      const playerDwell10 = new Set<string>();
      let activePlace: string | null = null;
      let activeStartTick = 0;
      let activeLastTick = 0;
      let previousPlace: string | null = null;
      const closeActiveVisit = (): void => {
        if (!activePlace) return;
        const durationSec = (activeLastTick - activeStartTick + replayRound.tickStep) / tickrate;
        const stats = getDwellStats(evidence.dwell, activePlace)[side];
        stats.visits += 1;
        stats.totalSeconds += durationSec;
        stats.maxContinuousSeconds = Math.max(stats.maxContinuousSeconds, durationSec);
        playerSeen.add(activePlace);
        roundSeen.add(sidePlaceKey(side, activePlace));
        if (durationSec >= DWELL_5_SEC) {
          stats.segments5 += 1;
          playerDwell5.add(activePlace);
          roundDwell5.add(sidePlaceKey(side, activePlace));
        }
        if (durationSec >= DWELL_10_SEC) {
          stats.segments10 += 1;
          playerDwell10.add(activePlace);
          roundDwell10.add(sidePlaceKey(side, activePlace));
        }
        activePlace = null;
      };
      for (let frame = 0; frame < replayRound.frameCount; frame++) {
        const tick = replayRound.startTick + frame * replayRound.tickStep;
        if (tick < round.freezeEndTick) continue;
        if (tick > endTick) break;
        const alive = ((track.flags[frame] ?? 0) & FLAG_ALIVE) !== 0;
        const place = alive ? placeDict[track.place[frame] ?? -1] : undefined;
        if (!alive || !place) {
          closeActiveVisit();
          previousPlace = null;
          continue;
        }
        add(evidence.occupancy, place, side);
        const phase = phaseAt((tick - round.freezeEndTick) / tickrate);
        if (phase) add(evidence.phaseOccupancy[phase], place, side);
        if (activePlace === null) {
          activePlace = place;
          activeStartTick = tick;
          activeLastTick = tick;
        } else if (activePlace === place) {
          activeLastTick = tick;
        } else {
          closeActiveVisit();
          activePlace = place;
          activeStartTick = tick;
          activeLastTick = tick;
        }
        if (previousPlace && previousPlace !== place) addTransition(evidence.transitions, previousPlace, place, side);
        previousPlace = place;
      }
      closeActiveVisit();
      for (const place of playerSeen) getDwellStats(evidence.dwell, place)[side].playerRounds += 1;
      for (const place of playerDwell5) getDwellStats(evidence.dwell, place)[side].playerRounds5 += 1;
      for (const place of playerDwell10) getDwellStats(evidence.dwell, place)[side].playerRounds10 += 1;
    }
    for (const key of roundSeen) {
      const [side, place] = parseSidePlaceKey(key);
      getDwellStats(evidence.dwell, place)[side].rounds += 1;
    }
    for (const key of roundDwell5) {
      const [side, place] = parseSidePlaceKey(key);
      getDwellStats(evidence.dwell, place)[side].rounds5 += 1;
    }
    for (const key of roundDwell10) {
      const [side, place] = parseSidePlaceKey(key);
      getDwellStats(evidence.dwell, place)[side].rounds10 += 1;
    }
  }
}

function knownCallouts(mapName: string): Set<string> {
  return new Set(Object.keys(CALLOUT_DICT[mapName] ?? {}));
}

function renderAnchors(mapName: string, side: Side): Record<string, DefaultAnchor> {
  const sourceAnchors = DEFAULT_POSITIONS[mapName]?.[side].anchors ?? {};
  const known = knownCallouts(mapName);
  return Object.fromEntries(
    Object.entries(sourceAnchors)
      .map(([anchorId, anchor]) => [
        anchorId,
        { name: anchor.name, callouts: anchor.callouts.filter((callout) => known.has(callout)) },
      ] as const)
      .filter(([, anchor]) => anchor.callouts.length > 0),
  );
}

function renderTsObject(mapName: string): string {
  const defaults = DEFAULT_POSITIONS[mapName];
  return defaults ? `${mapName}: ${JSON.stringify(defaults, null, 2)},` : "";
}

function formatCallout(mapName: string, callout: string): string {
  const cn = calloutCn(mapName, callout);
  return cn ? `${callout} / ${cn}` : callout;
}

function formatCounts(counts: SideCount | undefined): string {
  const t = counts?.t ?? 0;
  const ct = counts?.ct ?? 0;
  const total = t + ct;
  const tPct = total > 0 ? (100 * t / total).toFixed(1) : "0.0";
  let leaning = "均衡";
  if (total > 0) {
    const ratio = t / total;
    if (ratio >= 0.65) leaning = "T";
    else if (ratio <= 0.35) leaning = "CT";
  }
  return `T=${t}, CT=${ct}, T占比=${tPct}%, 倾向=${leaning}`;
}

function countFor(occ: Occ, callout: string, side: Side): number {
  return occ.get(callout)?.[side] ?? 0;
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0.0%";
  return `${(100 * numerator / denominator).toFixed(1)}%`;
}

function phaseCountsFor(evidence: MapEvidence, callout: string, side: Side): string {
  return PHASES.map((phase) => countFor(evidence.phaseOccupancy[phase.id], callout, side)).join("/");
}

function formatDetailedEvidence(mapName: string, callout: string, side: Side, evidence: MapEvidence): string {
  const dwell = evidence.dwell.get(callout)?.[side] ?? emptySideDwellStats();
  return [
    `${formatCallout(mapName, callout)}: ${formatCounts(evidence.occupancy.get(callout))}`,
    `${side.toUpperCase()}分段=${phaseCountsFor(evidence, callout, side)}`,
    `访问=${dwell.playerRounds} PR`,
    `≥5s=${dwell.playerRounds5} PR (${formatPercent(dwell.playerRounds5, evidence.playerRoundCount[side])}), ${dwell.rounds5} R (${formatPercent(dwell.rounds5, evidence.roundCount)})`,
    `≥10s=${dwell.playerRounds10} PR (${formatPercent(dwell.playerRounds10, evidence.playerRoundCount[side])}), ${dwell.rounds10} R (${formatPercent(dwell.rounds10, evidence.roundCount)})`,
    `最长=${dwell.maxContinuousSeconds.toFixed(1)}s`,
  ].join("；");
}

function topOccupancy(mapName: string, occ: Occ, side: Side, limit = 8): string[] {
  return [
    `- ${side.toUpperCase()}:`,
    ...[...occ.entries()]
    .sort((a, b) => b[1][side] - a[1][side])
    .slice(0, limit)
    .map(([callout, counts]) => `  - ${formatCallout(mapName, callout)}: ${formatCounts(counts)}`),
  ];
}

function renderAnchorReview(mapName: string, side: Side, evidence: MapEvidence): string[] {
  const anchors = renderAnchors(mapName, side);
  const lines = [`#### ${side === "t" ? "T 默认位" : "CT 默认位"}`];
  for (const [anchorId, anchor] of Object.entries(anchors)) {
    const callouts = anchor.callouts
      .filter((callout) => {
        const counts = evidence.occupancy.get(callout);
        return (counts?.t ?? 0) + (counts?.ct ?? 0) > 0;
      })
      .map((callout) => formatDetailedEvidence(mapName, callout, side, evidence))
    lines.push(`- ${anchorId} / ${anchor.name}:`);
    if (callouts.length === 0) {
      lines.push("  - 无样本命中");
    } else {
      for (const row of callouts) lines.push(`  - ${row}`);
    }
  }
  return lines;
}

function renderContestedReview(mapName: string, evidence: MapEvidence): string[] {
  const contested = DEFAULT_POSITIONS[mapName]?.contested ?? [];
  const lines = [
    "#### 争夺区属性",
    "以下 callout 可同时属于默认位；contested 表示该区域存在显著控制权争夺，而非排除默认位。",
  ];
  for (const callout of contested) {
    lines.push(`- ${formatCallout(mapName, callout)}: ${formatCounts(evidence.occupancy.get(callout))}`);
  }
  return lines;
}

function topDwell(mapName: string, evidence: MapEvidence, side: Side, limit = 10): string[] {
  const rows = [...evidence.dwell.entries()]
    .filter(([, stats]) => stats[side].playerRounds > 0)
    .sort((a, b) => {
      const aStats = a[1][side];
      const bStats = b[1][side];
      return (
        bStats.playerRounds5 - aStats.playerRounds5 ||
        bStats.playerRounds10 - aStats.playerRounds10 ||
        bStats.totalSeconds - aStats.totalSeconds
      );
    })
    .slice(0, limit);
  return [
    `- ${side.toUpperCase()}:`,
    ...rows.map(([callout, stats]) => {
      const row = stats[side];
      const averageVisit = row.visits > 0 ? row.totalSeconds / row.visits : 0;
      return [
        `  - ${formatCallout(mapName, callout)}:`,
        `≥5s=${row.playerRounds5} PR (${formatPercent(row.playerRounds5, evidence.playerRoundCount[side])})`,
        `≥10s=${row.playerRounds10} PR (${formatPercent(row.playerRounds10, evidence.playerRoundCount[side])})`,
        `涉及回合=${row.rounds5}/${evidence.roundCount}`,
        `平均单段=${averageVisit.toFixed(1)}s`,
        `最长=${row.maxContinuousSeconds.toFixed(1)}s`,
      ].join(" ");
    }),
  ];
}

function renderAdjacency(mapName: string, transitions: Transitions, limit = 16): string[] {
  const rows = [...transitions.entries()]
    .sort((a, b) => b[1].t + b[1].ct - (a[1].t + a[1].ct))
    .slice(0, limit);
  const lines = ["### 相邻证据", "同一玩家在开局窗口内发生 callout 变化时记录一条有向边。"];
  for (const [key, counts] of rows) {
    const [from, to] = key.split("\t");
    lines.push(`- ${formatCallout(mapName, from)} -> ${formatCallout(mapName, to)}: ${formatCounts(counts)}`);
  }
  return lines;
}

function renderMapReview(mapName: string, evidence: MapEvidence): string {
  return [
    `## ${mapName}`,
    "",
    `样本 ZIP：${evidence.zipCount}`,
    "",
    "### 当前推荐（人工修订 v1）",
    ...renderAnchorReview(mapName, "t", evidence),
    "",
    ...renderAnchorReview(mapName, "ct", evidence),
    "",
    ...renderContestedReview(mapName, evidence),
    "",
    "### 数据证据：高频占有",
    ...topOccupancy(mapName, evidence.occupancy, "t"),
    ...topOccupancy(mapName, evidence.occupancy, "ct"),
    "",
    "### 数据证据：持续驻留",
    ...topDwell(mapName, evidence, "t"),
    ...topDwell(mapName, evidence, "ct"),
    "",
    ...renderAdjacency(mapName, evidence.transitions),
    "",
    "### 运行时资产片段",
    "```ts",
    renderTsObject(mapName),
    "```",
  ].join("\n");
}

export function renderReviewReport(byMap: Map<string, MapEvidence>, scannedCount: number): string {
  return [
    "# Default Positions Review",
    "",
    `扫描 ZIP：${scannedCount}`,
    `统计窗口：freezeEnd + ${WINDOW_SEC}s`,
    "",
    ...[...byMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mapName, evidence]) => renderMapReview(mapName, evidence)),
  ].join("\n");
}

async function main(paths: string[]): Promise<void> {
  const roots = paths.length > 0 ? paths : ["fixtures/output"];
  const byMap = new Map<string, MapEvidence>();
  const files = roots.flatMap(zipFiles);
  for (const file of files) {
    const pkg = await loadZip(file);
    const evidence = byMap.get(pkg.match.mapName) ?? {
      occupancy: new Map(),
      phaseOccupancy: emptyPhaseOccupancy(),
      transitions: new Map(),
      dwell: new Map(),
      zipCount: 0,
      roundCount: 0,
      playerRoundCount: emptySideCount(),
    };
    evidence.zipCount += 1;
    accumulate(pkg, evidence);
    byMap.set(pkg.match.mapName, evidence);
  }
  console.log(renderReviewReport(byMap, files.length));
}

if (process.argv[1]?.endsWith("derive-default-positions.ts")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
