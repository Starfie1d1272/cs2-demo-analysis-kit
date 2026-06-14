import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadDemoPackageFromZip } from "../../core/src/index.ts";
import { FLAG_ALIVE, type DemoPackage } from "../../contract/src/index.ts";
import { CALLOUT_NAME_CN } from "../src/callout-names.js";
import { DEFAULT_POSITIONS, type DefaultAnchor } from "../src/default-positions.js";

const WINDOW_SEC = 30;

type Side = "t" | "ct";
type SideCount = Record<Side, number>;
type Occ = Map<string, SideCount>;
type Transitions = Map<string, SideCount>;

export interface MapEvidence {
  occupancy: Occ;
  transitions: Transitions;
  zipCount: number;
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
    const endTick = Math.min(round.endTick, round.freezeEndTick + WINDOW_SEC * tickrate);
    for (const track of replayRound.players) {
      const player = pkg.players[track.playerIndex];
      if (!player) continue;
      const side = player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
      let previousPlace: string | null = null;
      for (let frame = 0; frame < replayRound.frameCount; frame++) {
        const tick = replayRound.startTick + frame * replayRound.tickStep;
        if (tick < round.freezeEndTick || tick > endTick) continue;
        if (((track.flags[frame] ?? 0) & FLAG_ALIVE) === 0) continue;
        const place = placeDict[track.place[frame] ?? -1];
        if (!place) continue;
        add(evidence.occupancy, place, side);
        if (previousPlace && previousPlace !== place) addTransition(evidence.transitions, previousPlace, place, side);
        previousPlace = place;
      }
    }
  }
}

function knownCallouts(mapName: string): Set<string> {
  return new Set(Object.keys((CALLOUT_NAME_CN as Record<string, Record<string, string>>)[mapName] ?? {}));
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
  const cn = (CALLOUT_NAME_CN as Record<string, Record<string, string>>)[mapName]?.[callout] ?? "";
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
      .map((callout) => `${formatCallout(mapName, callout)}: ${formatCounts(evidence.occupancy.get(callout))}`)
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
  const lines = ["#### 争夺区/通道（不作为默认位）"];
  for (const callout of contested) {
    lines.push(`- ${formatCallout(mapName, callout)}: ${formatCounts(evidence.occupancy.get(callout))}`);
  }
  return lines;
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
      transitions: new Map(),
      zipCount: 0,
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
