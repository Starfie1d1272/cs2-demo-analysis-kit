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
  playerRoundSupport: number;
  score: number;
}

export interface DerivedRouteCorridor {
  id: string;
  target: "a" | "b";
  sharedCallouts: string[];
  representativeCallouts: string[];
  totalPlayerRoundSupport: number;
  variants: RouteCandidate[];
}

export interface RouteSearchOptions {
  source: string;
  target: string;
  maxHops: number;
  minEdgeCount: number;
  minRouteSupport: number;
}

interface MapEvidence {
  transitions: TransitionEvidence;
  tSequences: string[][];
  zipCount: number;
  roundCount: number;
}

interface CliOptions {
  roots: string[];
  maxHops: number;
  minEdgeCount: number;
  minRouteSupport: number;
  clusterSimilarity: number;
  edgeLimit: number;
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
    b.playerRoundSupport - a.playerRoundSupport ||
    b.bottleneckCount - a.bottleneckCount ||
    b.minTShare - a.minTShare ||
    b.score - a.score ||
    a.callouts.length - b.callouts.length ||
    a.callouts.join("\t").localeCompare(b.callouts.join("\t"))
  );
}

function longestCommonSubsequenceLength(a: string[], b: string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (const left of a) {
    let diagonal = 0;
    for (let index = 1; index <= b.length; index += 1) {
      const above = row[index]!;
      row[index] = left === b[index - 1]
        ? diagonal + 1
        : Math.max(row[index]!, row[index - 1]!);
      diagonal = above;
    }
  }
  return row[b.length]!;
}

function routeSimilarity(a: string[], b: string[]): number {
  const left = a.slice(1, -1);
  const right = b.slice(1, -1);
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((callout) => rightSet.has(callout)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  const orderedCoverage = longestCommonSubsequenceLength(left, right) / Math.min(left.length, right.length);
  const terminalCompatible = left.at(-1) === right.at(-1) ||
    left.includes(right.at(-1)!) ||
    right.includes(left.at(-1)!);
  if (!terminalCompatible) return 0;
  return Math.max(jaccard, orderedCoverage >= 0.75 ? orderedCoverage : 0);
}

function sharedCallouts(variants: RouteCandidate[]): string[] {
  const [representative, ...rest] = variants;
  if (!representative) return [];
  return representative.callouts.filter((callout) =>
    rest.every((variant) => variant.callouts.includes(callout)),
  );
}

export function clusterRouteCandidates(
  target: "a" | "b",
  candidates: RouteCandidate[],
  similarityThreshold = 0.6,
): DerivedRouteCorridor[] {
  const groups: RouteCandidate[][] = [];
  for (const candidate of [...candidates].sort(compareCandidates)) {
    const group = groups.find(([representative]) =>
      representative && routeSimilarity(representative.callouts, candidate.callouts) >= similarityThreshold,
    );
    if (group) group.push(candidate);
    else groups.push([candidate]);
  }

  return groups
    .map((variants) => ({
      id: "",
      target,
      sharedCallouts: sharedCallouts(variants),
      representativeCallouts: variants[0]!.callouts,
      totalPlayerRoundSupport: variants.reduce(
        (sum, variant) => sum + variant.playerRoundSupport,
        0,
      ),
      variants,
    }))
    .sort((a, b) =>
      b.totalPlayerRoundSupport - a.totalPlayerRoundSupport ||
      a.representativeCallouts.join("\t").localeCompare(b.representativeCallouts.join("\t")),
    )
    .map((corridor, index) => ({
      ...corridor,
      id: `${target}_corridor_${String(index + 1).padStart(2, "0")}`,
    }));
}

export function findRouteCandidates(
  edges: ObservedEdge[],
  sequences: string[][],
  options: RouteSearchOptions,
): RouteCandidate[] {
  const edgeByKey = new Map(edges.map((edge) => [transitionKey(edge.from, edge.to), edge]));
  const routeCounts = new Map<string, { callouts: string[]; count: number }>();

  for (const sequence of sequences) {
    const siteIndex = sequence.findIndex((callout) => callout.startsWith("Bombsite"));
    if (siteIndex < 0 || sequence[siteIndex] !== options.target) continue;
    let sourceIndex = -1;
    for (let index = 0; index < siteIndex; index += 1) {
      if (sequence[index] === options.source) sourceIndex = index;
    }
    if (sourceIndex < 0) continue;
    const callouts: string[] = [];
    for (const callout of sequence.slice(sourceIndex, siteIndex + 1)) {
      const repeatedAt = callouts.indexOf(callout);
      if (repeatedAt >= 0) callouts.splice(repeatedAt + 1);
      else callouts.push(callout);
    }
    if (callouts.length - 1 > options.maxHops) continue;
    const key = callouts.join("\t");
    const current = routeCounts.get(key) ?? { callouts, count: 0 };
    current.count += 1;
    routeCounts.set(key, current);
  }

  const candidates: RouteCandidate[] = [];
  for (const route of routeCounts.values()) {
    if (route.count < options.minRouteSupport) continue;
    const pathEdges = route.callouts.slice(1).map((to, index) =>
      edgeByKey.get(transitionKey(route.callouts[index]!, to)),
    );
    if (pathEdges.some((edge) => !edge || edge.tCount < options.minEdgeCount)) continue;
    const resolved = pathEdges as ObservedEdge[];
    candidates.push({
      callouts: route.callouts,
      bottleneckCount: Math.min(...resolved.map((edge) => edge.tCount)),
      totalCount: resolved.reduce((sum, edge) => sum + edge.tCount, 0),
      minTShare: Math.min(...resolved.map(edgeTShare)),
      playerRoundSupport: route.count,
      score: candidateScore(resolved),
    });
  }
  return candidates.sort(compareCandidates);
}

function zipFiles(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) return path.endsWith(".zip") ? [path] : [];
  const out: string[] = [];
  for (const name of readdirSync(path)) out.push(...zipFiles(join(path, name)));
  return out.sort((a, b) => a.localeCompare(b));
}

function emptyEvidence(): MapEvidence {
  return { transitions: new Map(), tSequences: [], zipCount: 0, roundCount: 0 };
}

function splitSequence(sequence: Array<string | null>): string[][] {
  const blocks: string[][] = [];
  let active: string[] = [];
  for (const callout of sequence) {
    if (callout) active.push(callout);
    else if (active.length > 0) {
      blocks.push(active);
      active = [];
    }
  }
  if (active.length > 0) blocks.push(active);
  return blocks;
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
      const sequence = compressCalloutVisits(frames);
      addSequenceTransitions(
        evidence.transitions,
        sequence,
        side,
        `${demoKey}:${round.roundNumber}`,
      );
      if (side === "t") evidence.tSequences.push(...splitSequence(sequence));
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

function renderCorridors(
  mapName: string,
  site: "a" | "b",
  corridors: DerivedRouteCorridor[],
): string[] {
  const title = `### ${site.toUpperCase()} 包 Route Corridors`;
  if (corridors.length === 0) return [title, "", "- 当前整路径支持阈值下没有 corridor。"];
  const lines = [
    title,
    "",
    "| corridor | 共同骨架 | variants | 累计 player-round 支持 | 主 variant 支持 |",
    "|---|---|---:|---:|---:|",
    ...corridors.map((corridor) =>
      `| ${corridor.id} | ${corridor.sharedCallouts.map((callout) => formatCallout(mapName, callout)).join(" → ")} | ${corridor.variants.length} | ${corridor.totalPlayerRoundSupport} | ${corridor.variants[0]!.playerRoundSupport} |`,
    ),
  ];
  for (const corridor of corridors) {
    lines.push(
      "",
      `#### ${corridor.id}`,
      "",
      `共同骨架：${corridor.sharedCallouts.map((callout) => formatCallout(mapName, callout)).join(" → ")}`,
      "",
      "| variant | 完整走向 | player-round 支持 | 瓶颈 T 次数 | 最低 T 占比 |",
      "|---:|---|---:|---:|---:|",
      ...corridor.variants.map((variant, index) =>
        `| ${index + 1} | ${variant.callouts.map((callout) => formatCallout(mapName, callout)).join(" → ")} | ${variant.playerRoundSupport} | ${variant.bottleneckCount} | ${formatPercent(variant.minTShare)} |`,
      ),
    );
  }
  return lines;
}

function renderCorridorJson(corridors: DerivedRouteCorridor[]): string[] {
  const compact = corridors.map((corridor) => ({
    id: corridor.id,
    target: corridor.target,
    sharedCallouts: corridor.sharedCallouts,
    representativeCallouts: corridor.representativeCallouts,
    totalPlayerRoundSupport: corridor.totalPlayerRoundSupport,
    variants: corridor.variants.map((variant) => ({
      callouts: variant.callouts,
      playerRoundSupport: variant.playerRoundSupport,
    })),
    confidence: "observed-complete-path-cluster",
  }));
  return ["```json", JSON.stringify(compact, null, 2), "```"];
}

export function renderRouteGraphReport(
  byMap: Map<string, MapEvidence>,
  scannedCount: number,
  options: Pick<CliOptions, "maxHops" | "minEdgeCount" | "minRouteSupport" | "clusterSimilarity" | "edgeLimit">,
): string {
  const lines = [
    "# Observed Route Graph Review",
    "",
    `扫描 ZIP：${scannedCount}`,
    `候选限制：maxHops=${options.maxHops}，minEdgeCount=${options.minEdgeCount}，minRouteSupport=${options.minRouteSupport} player-round；不限制候选条数。`,
    `聚类口径：去掉起点/包点后，callout Jaccard ≥ ${options.clusterSimilarity.toFixed(2)}，或较短路径的有序覆盖 ≥ 0.75。`,
    "统计窗口：每回合 freezeEndTick 至 endTick；只统计存活玩家的 replay place。",
    "去抖口径：连续 callout 合并为 visit；少于 2 帧的 visit 丢弃；死亡或缺失 callout 截断序列。",
    "",
    "> 本报告只证明 demo 中出现过的相邻转换。未出现的边不代表不可达；本版不使用 nav/tri/callout-grid 补边。",
    "> 候选完全由 demo 的单个 T 方 player-round 完整序列生成；人工 `map-routes` 不参与生成、聚类或排序。",
    "",
    "## 人工审查顺序",
    "",
    "1. 先检查高频边是否符合地图方向，特别留意跨层 callout 或死亡附近的假转换。",
    "2. 检查 corridor 的共同骨架是否表达同一地图控制方向，而不是只看入口 callout 是否相同。",
    "3. 检查 variants 是否保留不同入口、转点和夹击走向；不应为了合并而删除真实路径。",
    "4. JSON 块包含全部 corridor 与 variants，人工确认前不要写入 runtime 资产。",
  ];

  for (const [mapName, evidence] of [...byMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const edges = observedEdges(evidence.transitions);
    const searchBase = {
      source: "TSpawn",
      maxHops: options.maxHops,
      minEdgeCount: options.minEdgeCount,
      minRouteSupport: options.minRouteSupport,
    };
    const a = findRouteCandidates(edges, evidence.tSequences, { ...searchBase, target: "BombsiteA" });
    const b = findRouteCandidates(edges, evidence.tSequences, { ...searchBase, target: "BombsiteB" });
    const aCorridors = clusterRouteCandidates("a", a, options.clusterSimilarity);
    const bCorridors = clusterRouteCandidates("b", b, options.clusterSimilarity);
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
      ...renderCorridors(mapName, "a", aCorridors),
      "",
      ...renderCorridors(mapName, "b", bCorridors),
      "",
      "### Corridor 候选 JSON",
      "",
      ...renderCorridorJson([...aCorridors, ...bCorridors]),
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
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${name} must be greater than 0 and at most 1`);
  }
  return value;
}

function parseCli(args: string[]): CliOptions {
  const valueIndexes = new Set<number>();
  for (const name of ["--max-hops", "--min-edge-count", "--min-route-support", "--cluster-similarity", "--edge-limit"]) {
    const index = args.indexOf(name);
    if (index >= 0) {
      valueIndexes.add(index);
      valueIndexes.add(index + 1);
    }
  }
  const roots = args.filter((arg, index) => !valueIndexes.has(index) && !arg.startsWith("--"));
  return {
    roots: roots.length > 0 ? roots : [join(REPO_ROOT, "fixtures/output")],
    maxHops: numberFlag(args, "--max-hops", 12),
    minEdgeCount: numberFlag(args, "--min-edge-count", 3),
    minRouteSupport: numberFlag(args, "--min-route-support", 3),
    clusterSimilarity: ratioFlag(args, "--cluster-similarity", 0.6),
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
