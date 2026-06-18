import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip } from "../../core/src/index.ts";
import { FLAG_ALIVE, type DemoPackage } from "../../contract/src/index.ts";
import { calloutCn } from "../src/callout-names.js";

type Side = "t" | "ct";

interface Visit {
  place: string;
  frames: number;
}

export interface TransitionRecord {
  from: string;
  to: string;
  tCount: number;
  ctCount: number;
  roundKeys: Set<string>;
}

export type TransitionEvidence = Map<string, TransitionRecord>;

export interface ObservedEdge {
  from: string;
  to: string;
  tCount: number;
  ctCount: number;
  total: number;
  roundCount: number;
}

export interface RouteCandidate {
  callouts: string[];
  bottleneckCount: number;
  totalCount: number;
  minTShare: number;
  score: number;
}

export interface RouteSearchOptions {
  source: string;
  target: string;
  maxHops: number;
  minEdgeCount: number;
  minTShare: number;
  topK: number;
}

interface MapEvidence {
  transitions: TransitionEvidence;
  zipCount: number;
  roundCount: number;
}

interface CliOptions {
  roots: string[];
  maxHops: number;
  minEdgeCount: number;
  minTShare: number;
  topK: number;
  edgeLimit: number;
}

interface ManualRoute {
  id: string;
  name: string;
  bombsite: "a" | "b";
  zones: Array<{ id: string }>;
}

interface ManualRouteAsset {
  mapName: string;
  routes: ManualRoute[];
}

export function repoRootFromScriptUrl(scriptUrl: string): string {
  return resolve(dirname(fileURLToPath(scriptUrl)), "../../..");
}

const REPO_ROOT = repoRootFromScriptUrl(import.meta.url);
const DEFAULT_MIN_DWELL_FRAMES = 2;

function collapseVisits(visits: Visit[]): Visit[] {
  const out: Visit[] = [];
  for (const visit of visits) {
    const previous = out.at(-1);
    if (previous?.place === visit.place) previous.frames += visit.frames;
    else out.push({ ...visit });
  }
  return out;
}

/** Compress frame-level callouts while preserving null sequence boundaries. */
export function compressCalloutVisits(
  frames: Array<string | null>,
  minDwellFrames = DEFAULT_MIN_DWELL_FRAMES,
): Array<string | null> {
  const result: Array<string | null> = [];
  let block: Visit[] = [];
  const flush = (): void => {
    const stable = collapseVisits(block.filter((visit) => visit.frames >= minDwellFrames));
    result.push(...stable.map((visit) => visit.place));
    block = [];
  };

  for (const place of frames) {
    if (!place) {
      flush();
      if (result.length > 0 && result.at(-1) !== null) result.push(null);
      continue;
    }
    const previous = block.at(-1);
    if (previous?.place === place) previous.frames += 1;
    else block.push({ place, frames: 1 });
  }
  flush();
  while (result.at(-1) === null) result.pop();
  return result;
}

function transitionKey(from: string, to: string): string {
  return `${from}\t${to}`;
}

export function addSequenceTransitions(
  transitions: TransitionEvidence,
  sequence: Array<string | null>,
  side: Side,
  roundKey: string,
): void {
  let previous: string | null = null;
  for (const place of sequence) {
    if (!place) {
      previous = null;
      continue;
    }
    if (previous && previous !== place) {
      const key = transitionKey(previous, place);
      const record = transitions.get(key) ?? {
        from: previous,
        to: place,
        tCount: 0,
        ctCount: 0,
        roundKeys: new Set<string>(),
      };
      if (side === "t") record.tCount += 1;
      else record.ctCount += 1;
      record.roundKeys.add(roundKey);
      transitions.set(key, record);
    }
    previous = place;
  }
}

export function observedEdges(transitions: TransitionEvidence): ObservedEdge[] {
  return [...transitions.values()].map((record) => ({
    from: record.from,
    to: record.to,
    tCount: record.tCount,
    ctCount: record.ctCount,
    total: record.tCount + record.ctCount,
    roundCount: record.roundKeys.size,
  }));
}

function edgeTShare(edge: ObservedEdge): number {
  return edge.total > 0 ? edge.tCount / edge.total : 0;
}

function candidateScore(edges: ObservedEdge[]): number {
  if (edges.length === 0) return 0;
  return edges.reduce(
    (sum, edge) => sum + Math.log1p(edge.tCount) * (0.5 + edgeTShare(edge)),
    0,
  ) / edges.length;
}

function compareCandidates(a: RouteCandidate, b: RouteCandidate): number {
  return (
    b.bottleneckCount - a.bottleneckCount ||
    b.minTShare - a.minTShare ||
    b.score - a.score ||
    a.callouts.length - b.callouts.length ||
    a.callouts.join("\t").localeCompare(b.callouts.join("\t"))
  );
}

export function findRouteCandidates(
  edges: ObservedEdge[],
  options: RouteSearchOptions,
): RouteCandidate[] {
  const outgoing = new Map<string, ObservedEdge[]>();
  for (const edge of edges) {
    if (edge.tCount < options.minEdgeCount || edgeTShare(edge) < options.minTShare) continue;
    const rows = outgoing.get(edge.from) ?? [];
    rows.push(edge);
    outgoing.set(edge.from, rows);
  }
  for (const rows of outgoing.values()) {
    rows.sort((a, b) => b.tCount - a.tCount || a.to.localeCompare(b.to));
  }

  const candidates: RouteCandidate[] = [];
  const walk = (callouts: string[], pathEdges: ObservedEdge[]): void => {
    const current = callouts.at(-1)!;
    if (current === options.target) {
      candidates.push({
        callouts: [...callouts],
        bottleneckCount: Math.min(...pathEdges.map((edge) => edge.tCount)),
        totalCount: pathEdges.reduce((sum, edge) => sum + edge.tCount, 0),
        minTShare: Math.min(...pathEdges.map(edgeTShare)),
        score: candidateScore(pathEdges),
      });
      return;
    }
    if (pathEdges.length >= options.maxHops) return;
    for (const edge of outgoing.get(current) ?? []) {
      if (edge.to.startsWith("Bombsite") && edge.to !== options.target) continue;
      if (callouts.includes(edge.to)) continue;
      walk([...callouts, edge.to], [...pathEdges, edge]);
    }
  };

  walk([options.source], []);
  return candidates.sort(compareCandidates).slice(0, options.topK);
}

function zipFiles(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) return path.endsWith(".zip") ? [path] : [];
  const out: string[] = [];
  for (const name of readdirSync(path)) out.push(...zipFiles(join(path, name)));
  return out.sort((a, b) => a.localeCompare(b));
}

function emptyEvidence(): MapEvidence {
  return { transitions: new Map(), zipCount: 0, roundCount: 0 };
}

function accumulate(pkg: DemoPackage, demoKey: string, evidence: MapEvidence): void {
  const replay = pkg.replay;
  if (!replay) return;
  const roundByNumber = new Map(pkg.rounds.map((round) => [round.roundNumber, round]));
  const placeDict = replay.placeDict ?? [];

  for (const replayRound of replay.rounds) {
    const round = roundByNumber.get(replayRound.roundNumber);
    if (!round) continue;
    evidence.roundCount += 1;
    const firstFrame = Math.max(
      0,
      Math.ceil((round.freezeEndTick - replayRound.startTick) / replayRound.tickStep),
    );
    const lastFrame = Math.min(
      replayRound.frameCount - 1,
      Math.floor((round.endTick - replayRound.startTick) / replayRound.tickStep),
    );
    for (const track of replayRound.players) {
      const player = pkg.players[track.playerIndex];
      if (!player) continue;
      const side = player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
      const frames: Array<string | null> = [];
      for (let frame = firstFrame; frame <= lastFrame; frame += 1) {
        const alive = ((track.flags[frame] ?? 0) & FLAG_ALIVE) !== 0;
        const place = alive ? placeDict[track.place[frame] ?? -1] : undefined;
        frames.push(place || null);
      }
      addSequenceTransitions(
        evidence.transitions,
        compressCalloutVisits(frames),
        side,
        `${demoKey}:${round.roundNumber}`,
      );
    }
  }
}

async function collectEvidence(files: string[]): Promise<Map<string, MapEvidence>> {
  const byMap = new Map<string, MapEvidence>();
  for (const [index, file] of files.entries()) {
    process.stderr.write(`\r[${index + 1}/${files.length}] ${file.slice(-60).padEnd(60)}`);
    const pkg = await loadDemoPackageFromZip(readFileSync(file));
    const evidence = byMap.get(pkg.match.mapName) ?? emptyEvidence();
    evidence.zipCount += 1;
    accumulate(pkg, file, evidence);
    byMap.set(pkg.match.mapName, evidence);
  }
  if (files.length > 0) process.stderr.write("\n");
  return byMap;
}

function loadManualRoutes(mapName: string): ManualRouteAsset | null {
  try {
    const path = join(REPO_ROOT, "packages/maps/map-routes", `${mapName}.json`);
    return JSON.parse(readFileSync(path, "utf8")) as ManualRouteAsset;
  } catch {
    return null;
  }
}

function formatCallout(mapName: string, callout: string): string {
  const cn = calloutCn(mapName, callout);
  return cn ? `${callout} / ${cn}` : callout;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderEdges(mapName: string, edges: ObservedEdge[], limit: number): string[] {
  const rows = [...edges]
    .sort((a, b) => b.total - a.total || b.tCount - a.tCount || a.from.localeCompare(b.from))
    .slice(0, limit);
  if (rows.length === 0) return ["- 无相邻转换证据"];
  return [
    "| from | to | T | CT | T占比 | 涉及回合 |",
    "|---|---|---:|---:|---:|---:|",
    ...rows.map((edge) =>
      `| ${formatCallout(mapName, edge.from)} | ${formatCallout(mapName, edge.to)} | ${edge.tCount} | ${edge.ctCount} | ${formatPercent(edgeTShare(edge))} | ${edge.roundCount} |`,
    ),
  ];
}

function renderCandidates(
  mapName: string,
  site: "a" | "b",
  candidates: RouteCandidate[],
): string[] {
  const title = `### ${site.toUpperCase()} 包候选路径`;
  if (candidates.length === 0) return [title, "", "- 当前阈值下没有从 TSpawn 连到包点的 observed simple path。"];
  return [
    title,
    "",
    "| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |",
    "|---:|---|---:|---:|---:|---:|",
    ...candidates.map((candidate, index) =>
      `| ${index + 1} | ${candidate.callouts.map((callout) => formatCallout(mapName, callout)).join(" → ")} | ${candidate.bottleneckCount} | ${candidate.totalCount} | ${formatPercent(candidate.minTShare)} | ${candidate.score.toFixed(3)} |`,
    ),
  ];
}

function renderManualComparison(asset: ManualRouteAsset | null, edges: ObservedEdge[]): string[] {
  if (!asset || asset.routes.length === 0) return ["- 没有现有人工 `map-routes` 资产可对照。"];
  const observed = new Set(edges.filter((edge) => edge.tCount > 0).map((edge) => transitionKey(edge.from, edge.to)));
  return [
    "| 人工路线 | observed 边覆盖 | 缺失边 |",
    "|---|---:|---|",
    ...asset.routes.map((route) => {
      const pairs = route.zones.slice(1).map((zone, index) => [route.zones[index]!.id, zone.id] as const);
      const missing = pairs.filter(([from, to]) => !observed.has(transitionKey(from, to)));
      return `| ${route.id} / ${route.name} | ${pairs.length - missing.length}/${pairs.length} | ${missing.length > 0 ? missing.map(([from, to]) => `${from} → ${to}`).join("；") : "—"} |`;
    }),
  ];
}

function renderCandidateJson(a: RouteCandidate[], b: RouteCandidate[]): string[] {
  const compact = ([
    ...a.slice(0, 5).map((route, index) => ({ target: "a", index, ...route })),
    ...b.slice(0, 5).map((route, index) => ({ target: "b", index, ...route })),
  ] as const).map((route) => ({
    id: `candidate_${route.target}_${String(route.index + 1).padStart(2, "0")}`,
    target: route.target,
    callouts: route.callouts,
    confidence: "observed",
    bottleneckCount: route.bottleneckCount,
  }));
  return ["```json", JSON.stringify(compact, null, 2), "```"];
}

export function renderRouteGraphReport(
  byMap: Map<string, MapEvidence>,
  scannedCount: number,
  options: Pick<CliOptions, "maxHops" | "minEdgeCount" | "minTShare" | "topK" | "edgeLimit">,
): string {
  const lines = [
    "# Observed Route Graph Review",
    "",
    `扫描 ZIP：${scannedCount}`,
    `路径限制：maxHops=${options.maxHops}，minEdgeCount=${options.minEdgeCount}，minTShare=${formatPercent(options.minTShare)}，topK=${options.topK}`,
    "统计窗口：每回合 freezeEndTick 至 endTick；只统计存活玩家的 replay place。",
    "去抖口径：连续 callout 合并为 visit；少于 2 帧的 visit 丢弃；死亡或缺失 callout 截断序列。",
    "",
    "> 本报告只证明 demo 中出现过的相邻转换。未出现的边不代表不可达；本版不使用 nav/tri/callout-grid 补边。",
    "",
    "## 人工审查顺序",
    "",
    "1. 先检查高频边是否符合地图方向，特别留意跨层 callout 或死亡附近的假转换。",
    "2. 再检查 A/B 候选是否构成有意义的 corridor，而非回防、转点或刻意绕路。",
    "3. 对照人工路线的缺失边；缺失可能来自样本不足、callout 跨区跳跃或旧资产错误。",
    "4. JSON 块只是候选摘录，人工确认前不要写入 runtime 资产。",
  ];

  for (const [mapName, evidence] of [...byMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const edges = observedEdges(evidence.transitions);
    const searchBase = {
      source: "TSpawn",
      maxHops: options.maxHops,
      minEdgeCount: options.minEdgeCount,
      minTShare: options.minTShare,
      topK: options.topK,
    };
    const a = findRouteCandidates(edges, { ...searchBase, target: "BombsiteA" });
    const b = findRouteCandidates(edges, { ...searchBase, target: "BombsiteB" });
    lines.push(
      "",
      `## ${mapName}`,
      "",
      `样本 ZIP：${evidence.zipCount}；回合：${evidence.roundCount}；observed 有向边：${edges.length}`,
      "",
      "### 高频有向边",
      "",
      ...renderEdges(mapName, edges, options.edgeLimit),
      "",
      ...renderCandidates(mapName, "a", a),
      "",
      ...renderCandidates(mapName, "b", b),
      "",
      "### 与现有人工路线对照",
      "",
      ...renderManualComparison(loadManualRoutes(mapName), edges),
      "",
      "### Corridor 候选 JSON",
      "",
      ...renderCandidateJson(a, b),
    );
  }
  return lines.join("\n");
}

function numberFlag(args: string[], name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function ratioFlag(args: string[], name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`);
  return value;
}

function parseCli(args: string[]): CliOptions {
  const valueIndexes = new Set<number>();
  for (const name of ["--max-hops", "--min-edge-count", "--min-t-share", "--top-k", "--edge-limit"]) {
    const index = args.indexOf(name);
    if (index >= 0) {
      valueIndexes.add(index);
      valueIndexes.add(index + 1);
    }
  }
  const roots = args.filter((arg, index) => !valueIndexes.has(index) && !arg.startsWith("--"));
  return {
    roots: roots.length > 0 ? roots : [join(REPO_ROOT, "fixtures/output")],
    maxHops: numberFlag(args, "--max-hops", 8),
    minEdgeCount: numberFlag(args, "--min-edge-count", 3),
    minTShare: ratioFlag(args, "--min-t-share", 0.2),
    topK: numberFlag(args, "--top-k", 20),
    edgeLimit: numberFlag(args, "--edge-limit", 40),
  };
}

async function main(args: string[]): Promise<void> {
  const options = parseCli(args);
  const files = options.roots.flatMap(zipFiles);
  if (files.length === 0) throw new Error(`No .zip files found under: ${options.roots.join(", ")}`);
  const byMap = await collectEvidence(files);
  console.log(renderRouteGraphReport(byMap, files.length, options));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
