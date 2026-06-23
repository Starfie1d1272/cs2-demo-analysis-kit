import { eventPackageSchema, type EventPackage, type EventStage, type SeriesFormat, type SeriesVeto } from "@cs2dak/contract";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import JSZip from "jszip";

export type EventPreset = "round_robin" | "swiss" | "single_elim" | "double_elim" | "major";

export interface MakerMapResource {
  file: File;
  nativePath?: string | null;
  sha256?: string | null;
  occurredAt?: string | null;
  mapName: string;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
}

export interface MakerSeriesDraft {
  key: string;
  stage: string;
  round: number | null;
  entryRound: string | null;
  bracketNodeId?: string | null;
  status: "scheduled" | "in_progress" | "finished" | "cancelled";
  format: SeriesFormat;
  teamAName: string;
  teamBName: string;
  scheduledAt: string;
  veto: SeriesVeto | null;
  resources: MakerMapResource[];
}

export interface EventMakerDraft {
  slug: string;
  name: string;
  kind: string;
  stages: EventStage[];
  series: MakerSeriesDraft[];
}

interface NativeEventMakerApi {
  event_maker_start(): Promise<{ sessionId: string }>;
  event_maker_cleanup(sessionId: string): Promise<void>;
  event_resource_prepare(sessionId: string, path: string): Promise<{ ok: boolean; error?: string; path?: string; fileName?: string; sha256?: string; occurredAt?: string; mapName?: string; teamAName?: string; teamBName?: string; scoreA?: number; scoreB?: number }>;
  event_package_write(sessionId: string, pkg: EventPackage, resources: Array<{ path: string; name: string }>, suggestedName: string): Promise<{ ok: boolean; cancelled?: boolean; error?: string; path?: string }>;
}

function nativeMakerApi(): NativeEventMakerApi | null {
  const api = (window as unknown as { pywebview?: { api?: Partial<NativeEventMakerApi> } }).pywebview?.api;
  return api?.event_maker_start && api.event_maker_cleanup && api.event_resource_prepare && api.event_package_write ? api as NativeEventMakerApi : null;
}

export async function startNativeMakerSession(): Promise<string | null> {
  const api = nativeMakerApi();
  return api ? (await api.event_maker_start()).sessionId : null;
}

export async function cleanupNativeMakerSession(sessionId: string | null): Promise<void> {
  if (sessionId) await nativeMakerApi()?.event_maker_cleanup(sessionId);
}

export async function resourceFromNativePath(sessionId: string, path: string): Promise<MakerMapResource> {
  const api = nativeMakerApi();
  if (!api) throw new Error("桌面赛事制作桥不可用");
  const result = await api.event_resource_prepare(sessionId, path);
  if (!result.ok || !result.path || !result.fileName || !result.mapName || !result.teamAName || !result.teamBName) throw new Error(result.error ?? `${path} 解析失败`);
  return { file: new File([], result.fileName, { type: "application/zip" }), nativePath: result.path, sha256: result.sha256, occurredAt: result.occurredAt, mapName: result.mapName, teamAName: result.teamAName, teamBName: result.teamBName, scoreA: result.scoreA ?? 0, scoreB: result.scoreB ?? 0 };
}

/** 赛事类型固定枚举（不再手填）。 */
export const KIND_OPTIONS = [
  { value: "major", label: "Major" },
  { value: "tournament", label: "锦标赛" },
  { value: "league", label: "联赛" },
  { value: "qualifier", label: "预选赛" },
  { value: "scrim", label: "训练赛" },
] as const;

/** 阶段赛制类型（与 contract eventStageSchema.type 对齐）。 */
export const STAGE_TYPE_OPTIONS = [
  { value: "round_robin", label: "单循环" },
  { value: "swiss", label: "瑞士轮" },
  { value: "single_elim", label: "单败淘汰" },
  { value: "double_elim", label: "双败淘汰" },
  { value: "gsl_group", label: "GSL 双败小组" },
] as const;

export function newStage(index: number): EventStage {
  return { key: `stage-${index}`, name: `阶段${index}`, type: "swiss", teamCount: 16, advanceCount: 8, matchFormat: "bo3" };
}

/** 事件队伍 = 各系列已附 demo 推出的队伍并集（demo 优先，不手填）。 */
export function deriveEventTeams(series: MakerSeriesDraft[]): string[] {
  const names: string[] = [];
  for (const row of series) {
    for (const name of [row.teamAName, row.teamBName]) {
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** BP 与已附 demo 地图集合是否相符；返回不一致说明（空数组=相符或无法判定）。 */
export function vetoMapMismatch(row: MakerSeriesDraft): string[] {
  if (!row.veto || row.resources.length === 0) return [];
  const demoMaps = new Set(row.resources.map((r) => r.mapName));
  const bpMaps = new Set<string>([
    ...row.veto.maps.picked.map((m) => m.mapName),
    ...(row.veto.maps.decider ? [row.veto.maps.decider] : []),
  ]);
  const issues: string[] = [];
  for (const m of bpMaps) if (!demoMaps.has(m)) issues.push(`BP 选了 ${m} 但无对应 demo`);
  for (const m of demoMaps) if (bpMaps.size > 0 && !bpMaps.has(m)) issues.push(`demo ${m} 不在 BP 的 pick/decider 里`);
  return issues;
}

export function stagesForPreset(preset: EventPreset): EventStage[] {
  if (preset === "major") return [
    { key: "stage1", name: "阶段一", type: "swiss", teamCount: 16, advanceCount: 8, matchFormat: "bo1" },
    { key: "stage2", name: "阶段二", type: "swiss", teamCount: 16, advanceCount: 8, matchFormat: "bo1" },
    { key: "stage3", name: "阶段三", type: "swiss", teamCount: 16, advanceCount: 8, matchFormat: "bo3" },
    { key: "playoff", name: "淘汰赛", type: "single_elim", teamCount: 8, advanceCount: 1, matchFormat: "bo3", finalFormat: "bo5", bracketNodes: singleEliminationNodes(8) },
  ];
  const labels: Record<Exclude<EventPreset, "major">, string> = {
    round_robin: "单循环",
    swiss: "瑞士轮",
    single_elim: "单败淘汰",
    double_elim: "双败淘汰",
  };
  const bracketNodes = preset === "single_elim" ? singleEliminationNodes(8) : preset === "double_elim" ? doubleEliminationNodes() : undefined;
  return [{ key: "main", name: labels[preset], type: preset, teamCount: preset === "swiss" ? 16 : 8, advanceCount: preset === "round_robin" ? 4 : 1, matchFormat: "bo3", bracketNodes }];
}

function doubleEliminationNodes(): NonNullable<EventStage["bracketNodes"]> {
  return [
    ...[1, 2, 3, 4].map((index) => ({ id: `w1-m${index}`, label: `胜者组首轮 ${index}`, round: 1, lane: "winner" as const, nextWinNodeId: `w2-m${Math.ceil(index / 2)}`, nextLossNodeId: `l1-m${Math.ceil(index / 2)}` })),
    { id: "l1-m1", label: "败者组首轮 1", round: 2, lane: "loser", nextWinNodeId: "l2-m1", nextLossNodeId: null },
    { id: "l1-m2", label: "败者组首轮 2", round: 2, lane: "loser", nextWinNodeId: "l2-m2", nextLossNodeId: null },
    { id: "w2-m1", label: "胜者组半决赛 1", round: 2, lane: "winner", nextWinNodeId: "w3-m1", nextLossNodeId: "l2-m2" },
    { id: "w2-m2", label: "胜者组半决赛 2", round: 2, lane: "winner", nextWinNodeId: "w3-m1", nextLossNodeId: "l2-m1" },
    { id: "l2-m1", label: "败者组第二轮 1", round: 3, lane: "loser", nextWinNodeId: "l3-m1", nextLossNodeId: null },
    { id: "l2-m2", label: "败者组第二轮 2", round: 3, lane: "loser", nextWinNodeId: "l3-m1", nextLossNodeId: null },
    { id: "l3-m1", label: "败者组半决赛", round: 4, lane: "loser", nextWinNodeId: "l4-m1", nextLossNodeId: null },
    { id: "w3-m1", label: "胜者组决赛", round: 3, lane: "winner", nextWinNodeId: "g1", nextLossNodeId: "l4-m1" },
    { id: "l4-m1", label: "败者组决赛", round: 5, lane: "loser", nextWinNodeId: "g1", nextLossNodeId: null },
    { id: "g1", label: "总决赛", round: 6, lane: "grand", nextWinNodeId: null, nextLossNodeId: null },
  ];
}

function singleEliminationNodes(teamCount: number): NonNullable<EventStage["bracketNodes"]> {
  const rounds = Math.ceil(Math.log2(teamCount));
  const nodes: NonNullable<EventStage["bracketNodes"]> = [];
  for (let round = 1; round <= rounds; round += 1) {
    const count = 2 ** (rounds - round);
    for (let index = 1; index <= count; index += 1) {
      const id = `r${round}-m${index}`;
      nodes.push({ id, label: round === rounds ? "决赛" : round === rounds - 1 ? `半决赛 ${index}` : `第 ${round} 轮 ${index}`, round, lane: "single", nextWinNodeId: round < rounds ? `r${round + 1}-m${Math.ceil(index / 2)}` : null, nextLossNodeId: null });
    }
  }
  return nodes;
}

/**
 * GSL 小组（4 队双败）：双开局 → 胜者组决胜（2-0 直接晋级）/ 败者组淘汰（0-2 直接出局）
 * → 小组决胜（胜者组败方 vs 败者组胜方，胜者 2-1 晋级、负者 1-2 出局）。
 */
function gslGroupNodes(): NonNullable<EventStage["bracketNodes"]> {
  return [
    { id: "om1", label: "首轮 1", round: 1, lane: "winner", nextWinNodeId: "wm", nextLossNodeId: "em" },
    { id: "om2", label: "首轮 2", round: 1, lane: "winner", nextWinNodeId: "wm", nextLossNodeId: "em" },
    { id: "wm", label: "胜者组决胜", round: 2, lane: "winner", nextWinNodeId: null, nextLossNodeId: "dm" },
    { id: "em", label: "败者组淘汰", round: 2, lane: "loser", nextWinNodeId: "dm", nextLossNodeId: null },
    { id: "dm", label: "小组决胜", round: 3, lane: "grand", nextWinNodeId: null, nextLossNodeId: null },
  ];
}

/**
 * 按阶段赛制取默认 bracketNodes；非淘汰类（单循环 / 瑞士轮）返回 undefined。
 *
 * NOTE: `teamCount` 仅 single_elim 使用——单败节点数随队伍数变化；
 * double_elim 固定 16 队节点（可容纳 ≤16 队），gsl_group 固定 4 队（GSL 定义如此）。
 */
export function bracketNodesForType(type: EventStage["type"], teamCount: number): EventStage["bracketNodes"] | undefined {
  if (type === "single_elim") return singleEliminationNodes(Math.max(2, teamCount));
  if (type === "double_elim") return doubleEliminationNodes();
  if (type === "gsl_group") return gslGroupNodes();
  return undefined;
}

/**
 * 框架槽位：把一个阶段的赛制展开成可点击的二维布局。
 * - 淘汰赛（bracketNodes）：每个节点是一个定额槽（恰好一场，带晋级去向）。
 * - 瑞士轮：按战绩组（w-l）展开（如 Major 3 胜进 / 3 负汰），每组可加多场。
 * - 循环赛/其它：单池，可加多场。
 */
export interface FrameworkSlot {
  id: string;
  label: string;
  round: number;
  lane: "single" | "winner" | "loser" | "grand";
  /** node：恰好一场（淘汰赛节点）；bucket：可加多场（瑞士轮战绩组 / 循环赛池）。 */
  kind: "node" | "bucket";
  nextWinNodeId?: string | null;
  nextLossNodeId?: string | null;
}

/** 瑞士轮战绩组网格：w<wins、l<losses，round = w+l+1（默认 Major 制 3 胜进 / 3 负汰）。 */
export function swissBuckets(wins = 3, losses = 3): FrameworkSlot[] {
  const slots: FrameworkSlot[] = [];
  for (let w = 0; w < wins; w += 1)
    for (let l = 0; l < losses; l += 1)
      slots.push({ id: `b-${w}-${l}`, label: `${w}-${l}`, round: w + l + 1, lane: "single", kind: "bucket" });
  return slots.sort((a, b) => a.round - b.round || a.label.localeCompare(b.label));
}

export function frameworkSlots(stage: EventStage): FrameworkSlot[] {
  if (stage.bracketNodes?.length)
    return stage.bracketNodes.map((node) => ({ id: node.id, label: node.label, round: node.round, lane: node.lane, kind: "node", nextWinNodeId: node.nextWinNodeId, nextLossNodeId: node.nextLossNodeId }));
  if (stage.type === "swiss") return swissBuckets();
  return [{ id: "pool", label: stage.name, round: 1, lane: "single", kind: "bucket" }];
}

/** 新建一场绑定到某槽位的系列：淘汰赛槽沿用节点 key（定额），bucket 槽用序号区分。 */
export function seriesForSlot(stage: EventStage, slot: FrameworkSlot, ordinal: number): MakerSeriesDraft {
  const key = slot.kind === "node" ? `${stage.key}-${slot.id}` : `${stage.key}-${slot.id}-${ordinal}`;
  return emptySeries(key, stage, slot.round, slot.label, slot.kind === "node" ? slot.id : null);
}

export function seriesSkeletonForPreset(preset: EventPreset, stages = stagesForPreset(preset)): MakerSeriesDraft[] {
  const rows: MakerSeriesDraft[] = [];
  for (const stage of stages) {
    // 淘汰赛框架确定 → 每节点预建一场定额系列；瑞士轮/循环赛由框架板按战绩组/池逐场添加。
    if (stage.bracketNodes?.length)
      for (const node of stage.bracketNodes) rows.push(emptySeries(`${stage.key}-${node.id}`, stage, node.round, node.label, node.id));
  }
  return rows;
}

function emptySeries(key: string, stage: EventStage, round: number, entryRound: string, bracketNodeId: string | null): MakerSeriesDraft {
  return { key, stage: stage.key, round, entryRound, bracketNodeId, status: "finished", format: round === stage.bracketNodes?.at(-1)?.round ? (stage.finalFormat ?? stage.matchFormat ?? "bo3") : (stage.matchFormat ?? "bo3"), teamAName: "", teamBName: "", scheduledAt: "", veto: null, resources: [] };
}

export async function resourceFromFile(file: File): Promise<MakerMapResource> {
  const pkg = await loadDemoPackageFromZip(await file.arrayBuffer());
  if (!pkg.match.teamA.name || !pkg.match.teamB.name) throw new Error(`${file.name} 缺少队伍名称，不能自动归入系列赛`);
  return {
    file,
    occurredAt: file.lastModified > 0 ? new Date(file.lastModified).toISOString() : null,
    mapName: pkg.match.mapName,
    teamAName: pkg.match.teamA.name,
    teamBName: pkg.match.teamB.name,
    scoreA: pkg.match.teamA.score,
    scoreB: pkg.match.teamB.score,
  };
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assetName(seriesKey: string, order: number, fileName: string): string {
  const safe = `${seriesKey}-${order}-${fileName}`.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return safe.toLowerCase().endsWith(".zip") ? safe : `${safe}.zip`;
}

async function compileEventPackage(draft: EventMakerDraft): Promise<EventPackage> {
  const activeSeries = draft.series.filter((row) => row.resources.length > 0);
  const teams = deriveEventTeams(activeSeries);
  const teamKeyByName = new Map(teams.map((name, index) => [name, `team-${index + 1}`]));
  const series = await Promise.all(activeSeries.map(async (row) => {
    if (row.resources.length > 5) throw new Error(`${row.key} 超过 5 张地图`);
    const maps = await Promise.all(row.resources.map(async (resource, index) => {
      const direct = resource.teamAName === row.teamAName && resource.teamBName === row.teamBName;
      const reversed = resource.teamAName === row.teamBName && resource.teamBName === row.teamAName;
      if (!direct && !reversed) throw new Error(`${row.key} 的 ${resource.file.name} 对阵与系列赛队伍不一致`);
      const name = assetName(row.key, index + 1, resource.file.name);
      return {
        order: index + 1,
        mapName: resource.mapName,
        pickedBy: row.veto?.maps.picked.find((map) => map.mapName === resource.mapName)?.teamKey ?? null,
        scoreA: direct ? resource.scoreA : resource.scoreB,
        scoreB: direct ? resource.scoreB : resource.scoreA,
        demoHint: { fileName: name, sha256: resource.sha256 ?? await sha256(resource.file) },
      };
    }));
    return {
      key: row.key,
      stage: row.stage || null,
      round: row.round,
      entryRound: row.entryRound,
      bracketNodeId: row.bracketNodeId,
      status: row.status,
      format: row.format,
      teamAKey: teamKeyByName.get(row.teamAName) ?? "",
      teamBKey: teamKeyByName.get(row.teamBName) ?? "",
      scoreA: row.status === "finished" ? maps.filter((map) => map.scoreA > map.scoreB).length : null,
      scoreB: row.status === "finished" ? maps.filter((map) => map.scoreB > map.scoreA).length : null,
      scheduledAt: row.scheduledAt ? new Date(row.scheduledAt).toISOString() : null,
      completedAt: row.resources.map((resource) => resource.occurredAt).find(Boolean) ?? null,
      veto: row.veto,
      maps,
    };
  }));
  return eventPackageSchema.parse({
    version: "cs2-demo-analysis-kit/event-package-1.0",
    source: "manual",
    exportedAt: new Date().toISOString(),
    event: { slug: draft.slug, name: draft.name, kind: draft.kind, stages: draft.stages },
    teams: teams.map((name) => ({ key: teamKeyByName.get(name), name, players: [] })),
    series,
  });
}

export async function buildEventPackage(draft: EventMakerDraft): Promise<{ eventPackage: EventPackage; blob: Blob }> {
  const eventPackage = await compileEventPackage(draft);
  const archive = new JSZip();
  archive.file("event-package.json", `${JSON.stringify(eventPackage, null, 2)}\n`);
  for (const row of draft.series) {
    for (const [index, resource] of row.resources.entries()) {
      archive.file(`maps/${assetName(row.key, index + 1, resource.file.name)}`, await resource.file.arrayBuffer());
    }
  }
  return { eventPackage, blob: await archive.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } }) };
}

export async function buildEventPackageNative(draft: EventMakerDraft, sessionId: string | null): Promise<{ path: string } | null> {
  const api = nativeMakerApi();
  if (!api || !sessionId || draft.series.some((row) => row.resources.some((resource) => !resource.nativePath))) return null;
  const eventPackage = await compileEventPackage(draft);
  const resources = draft.series.flatMap((row) => row.resources.map((resource, index) => ({ path: resource.nativePath!, name: assetName(row.key, index + 1, resource.file.name) })));
  const result = await api.event_package_write(sessionId, eventPackage, resources, `${draft.slug}.zip`);
  if (result.cancelled) return { path: "" };
  if (!result.ok) throw new Error(result.error ?? "原生赛事包写入失败");
  return { path: result.path ?? `${draft.slug}.zip` };
}
