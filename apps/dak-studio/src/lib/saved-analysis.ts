import { getStorage, type RecordStore } from "./storage";
import { isCalendarDate, type AnalysisContext } from "./analysis-context";
import type { AnalysisPageId } from "./studio-navigation";
import type { StudioPageStateMap } from "./studio-page-state";

export type SavedAnalysis = { [P in AnalysisPageId]: { schemaVersion: 1; id: string; title: string; page: P; context: AnalysisContext; ui: StudioPageStateMap[P]; workbenchShortcut: boolean; createdAt: number; updatedAt: number } }[AnalysisPageId];
export type SavedAnalysisInput = { [P in AnalysisPageId]: Pick<Extract<SavedAnalysis, {page: P}>, "page" | "context" | "ui" | "title" | "workbenchShortcut"> }[AnalysisPageId];
const pages: AnalysisPageId[] = ["analysis", "player", "team", "event-analysis", "duel", "economy", "utility", "lineups", "opening", "control", "patterns", "roles"];
const object = (v: unknown): v is Record<string, any> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, any>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === "string");
const str = (v: unknown) => typeof v === "string" && v.length > 0;
const role = (v: any) => object(v) && keys(v,["kind","id","label"]) && ["self", "player", "team"].includes(v.kind) && str(v.id) && str(v.label);
function validContext(v: any): boolean {
  if (!object(v) || !["explore", "personal-review", "player-analysis", "team-analysis", "event-analysis", "match-review", "own-review", "opponent-prep"].includes(v.goal) || !object(v.corpus) || !object(v.focus) || !object(v.roles) || !object(v.baseline)) return false;
  const c = v.corpus, f = v.focus, b = v.baseline;
  if (!keys(v,["goal","corpus","focus","roles","baseline"]) || !keys(c,["eventIds","entryIds","entrySelectionActive","matchIds","maps","tags","excludedEntryIds","dateRange"]) || !keys(v.roles,["beneficiary","opponent","comparison"])) return false;
  if (![c.eventIds,c.entryIds,c.matchIds,c.maps,c.tags,c.excludedEntryIds].every(strings) || (c.entrySelectionActive !== undefined && typeof c.entrySelectionActive !== "boolean")) return false;
  if (c.dateRange !== undefined && (!object(c.dateRange) || !keys(c.dateRange,["from","to","includeUnknown"]) || ![c.dateRange.from,c.dateRange.to].every(x => x === null || typeof x === "string" && isCalendarDate(x)) || typeof c.dateRange.includeUnknown !== "boolean" || c.dateRange.from && c.dateRange.to && c.dateRange.from > c.dateRange.to)) return false;
  if (!keys(f, f.kind === "aggregate" ? ["kind"] : f.kind === "team" ? ["kind","teamName"] : f.kind === "event" ? ["kind","eventId","label"] : f.kind === "match" ? ["kind","entryId","label"] : ["kind","playerKey","label"])) return false;
  if (!keys(b, b.kind === "event-peers" ? ["kind","eventId","label"] : b.kind === "personal-history" ? ["kind","playerKey","label"] : b.kind === "specified" ? ["kind","subject","label"] : ["kind","label"])) return false;
  if (!(f.kind === "aggregate" || f.kind === "team" && str(f.teamName) || ["self","player"].includes(f.kind) && str(f.playerKey) && str(f.label) || f.kind === "event" && str(f.eventId) && str(f.label) || f.kind === "match" && str(f.entryId) && str(f.label))) return false;
  if (!Object.values(v.roles).every(role)) return false;
  return (b.label === undefined || typeof b.label === "string") && (b.kind === "corpus" || b.kind === "descriptive" || b.kind === "event-peers" && str(b.eventId) || b.kind === "personal-history" && str(b.playerKey) || b.kind === "specified" && role(b.subject));
}
// Reject unexpected or malformed state rather than silently restoring an altered query.
const table = (v: any) => object(v) && keys(v,["sort","page"]) && object(v.sort) && keys(v.sort,["key","direction"]) && (v.sort.key === null || typeof v.sort.key === "string") && ["asc","desc"].includes(v.sort.direction) && Number.isInteger(v.page) && v.page >= 0;
const tables = (v: any, keys: string[]) => object(v) && Object.entries(v).every(([k,x]) => keys.includes(k) && table(x));
const nullableString = (v: unknown) => v === null || typeof v === "string";
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
function validUI(page: AnalysisPageId, v: any): boolean {
 if (!object(v)) return false;
 const allowed: Record<AnalysisPageId, string[]> = { analysis:["comparePair","leaderboardView","tables"], "event-analysis":["comparePair","leaderboardView","tables"], player:["profileTab","comparePlayerKey","flashMode"], team:["compareTeamName","tables"], roles:["player","team"], duel:["tab","evidenceFilter","weaponCategory","recordPage","openingMapName","openingPage","mechanicsPage","selectedRowId"], economy:["teamDetails","economyMatrix","smallBuyUpsets"], utility:["tables","selectedEvidenceKey"], lineups:["mode","mapName","grenade","side","selectedClusterId","radarTopN","table"], opening:["mapName","side","recentMatchCount","hiddenRoundKeys","timeSeconds","speed","trailOpacity","showTrails","showGrenades"], control:["mapName","economy","mode","second","level"], patterns:["section","explorer"] };
 if (!keys(v,allowed[page])) return false;
 switch(page) {
 case "analysis": case "event-analysis": return (v.comparePair === null || Array.isArray(v.comparePair) && v.comparePair.length === 2 && strings(v.comparePair)) && ["core","impact","advanced"].includes(v.leaderboardView) && tables(v.tables,["maps","weapons","leaderboard"]);
 case "player": return ["overview","aim","utility","trend"].includes(v.profileTab) && nullableString(v.comparePlayerKey) && ["net","enemy"].includes(v.flashMode);
 case "team": return nullableString(v.compareTeamName) && tables(v.tables,["maps","roster"]);
 case "roles": return object(v.player) && keys(v.player,["tables"]) && tables(v.player.tables,["roles","mapPool"]) && object(v.team) && keys(v.team,["matrixMapName","matrixSide","tables"]) && nullableString(v.team.matrixMapName) && ["t","ct"].includes(v.team.matrixSide) && tables(v.team.tables,["roles"]);
 case "duel": return ["records","opening","mechanics"].includes(v.tab) && ["contested_duel","suppressed_kill","caught_off_guard","low_hp","third_party","all"].includes(v.evidenceFilter) && ["步枪","狙击","手枪","冲锋枪","霰弹机枪","其他","全部"].includes(v.weaponCategory) && [v.recordPage,v.openingPage,v.mechanicsPage].every(x => Number.isInteger(x) && x >= 0) && nullableString(v.openingMapName) && nullableString(v.selectedRowId);
 case "economy": return table(v.teamDetails) && table(v.economyMatrix) && table(v.smallBuyUpsets);
 case "utility": return tables(v.tables,["hePlayers","heTeams","firePlayers","fireTeams","flashPlayers","flashTeams","smokePlayers","smokeTeams"]) && nullableString(v.selectedEvidenceKey);
 case "lineups": return ["strict","loose"].includes(v.mode) && nullableString(v.mapName) && nullableString(v.grenade) && [null,"t","ct"].includes(v.side) && nullableString(v.selectedClusterId) && [20,40,60].includes(v.radarTopN) && table(v.table);
 case "opening": return nullableString(v.mapName) && ["t","ct"].includes(v.side) && [0,3,5,10].includes(v.recentMatchCount) && strings(v.hiddenRoundKeys) && [v.timeSeconds,v.speed,v.trailOpacity].every(finite) && typeof v.showTrails === "boolean" && typeof v.showGrenades === "boolean";
 case "control": return nullableString(v.mapName) && ["gun","all"].includes(v.economy) && ["ctVis","tVis","ctAim","tAim","ctPres","tPres","ctSound","tSound","info-diff","contested"].includes(v.mode) && finite(v.second) && ["upper","lower"].includes(v.level);
 case "patterns": { const e = v.explorer; return ["patterns","anti"].includes(v.section) && object(e) && keys(e,["mapName","side","economyEntry","clusterId","selectedFactKey","replaySource","replay","evidenceTable","namesTable"]) && nullableString(e.mapName) && ["t","ct"].includes(e.side) && ["all","pistol","gun","anti_eco","force","semi","eco"].includes(e.economyEntry) && [e.clusterId,e.selectedFactKey,e.replaySource].every(nullableString) && (e.replay === null || object(e.replay) && keys(e.replay,["roundNumber","tick","playing","speed","layers","level"]) && finite(e.replay.roundNumber) && finite(e.replay.tick) && typeof e.replay.playing === "boolean" && [0.5,1,2,4].includes(e.replay.speed) && object(e.replay.layers) && keys(e.replay.layers,["trace","killLines","grenades"]) && [e.replay.layers.trace,e.replay.layers.killLines,e.replay.layers.grenades].every(x => typeof x === "boolean") && ["upper","lower"].includes(e.replay.level)) && table(e.evidenceTable) && table(e.namesTable); }
 }
}
function validate(value: unknown, key?: string): SavedAnalysis {
 const v = value as any;
 if (!object(v) || !keys(v,["schemaVersion","id","title","page","context","ui","workbenchShortcut","createdAt","updatedAt"]) || v.schemaVersion !== 1 || !str(v.id) || (key !== undefined && v.id !== key) || !str(v.title) || v.title.trim() !== v.title || !pages.includes(v.page) || !validContext(v.context) || !validUI(v.page,v.ui) || typeof v.workbenchShortcut !== "boolean" || !finite(v.createdAt) || !finite(v.updatedAt) || !Number.isFinite(new Date(v.createdAt).getTime()) || !Number.isFinite(new Date(v.updatedAt).getTime())) throw new Error("保存分析的版本或参数无效");
 const result = structuredClone(v) as SavedAnalysis;
 if (result.page === "patterns" && result.ui.explorer.replay) result.ui.explorer.replay.playing = false;
 return result;
}
export function createSavedAnalysisStore(records: RecordStore) {
 return {
  async get(id: string) { const value = await records.get<unknown>(id); return value === undefined ? undefined : validate(value,id); },
  async list() { const rows: SavedAnalysis[] = [], invalid: string[] = []; for (const [key,value] of await records.entries<unknown>()) { try { rows.push(validate(value,key)); } catch { invalid.push(key); } } return { rows: rows.sort((a,b) => b.updatedAt-a.updatedAt), invalid }; },
  async create(input: SavedAnalysisInput) { const now = Date.now(); const value = validate({ page: input.page, context: structuredClone(input.context), ui: structuredClone(input.ui), workbenchShortcut: input.workbenchShortcut, title: input.title.trim(), schemaVersion: 1, id: crypto.randomUUID(), createdAt: now, updatedAt: now }); await records.put(value.id,value); return structuredClone(value); },
  async update(id: string, input: SavedAnalysisInput) { const old = await this.get(id); if (!old) throw new Error("原保存项已删除，可另存"); const value = validate({ page: input.page, context: structuredClone(input.context), ui: structuredClone(input.ui), workbenchShortcut: input.workbenchShortcut, title: input.title.trim(), schemaVersion: 1, id, createdAt: old.createdAt, updatedAt: Date.now() }); await records.put(id,value); return structuredClone(value); },
  async remove(id: string) { await records.delete(id); },
  async copy(id: string) { const old = await this.get(id); if (!old) throw new Error("原保存项已删除"); return this.create({ ...old, title: `${old.title}（副本）` }); },
 };
}
export const savedAnalyses = createSavedAnalysisStore(getStorage().records("saved-analyses"));

/** Human-readable restrictions distinguish a team focus from its corpus. */
export function savedScopeSummary(context: AnalysisContext): string {
 const c = context.corpus;
 const parts = [c.eventIds.length ? `赛事 ${c.eventIds.join("、")}` : null, c.entrySelectionActive || c.entryIds.length ? `指定比赛 ${c.entryIds.length} 项` : null, c.matchIds.length ? `指定 match ${c.matchIds.length} 项` : null, c.maps.length ? `地图 ${c.maps.join("、")}` : null, c.tags.length ? `标签 ${c.tags.join("、")}` : null, c.excludedEntryIds.length ? `排除 ${c.excludedEntryIds.length} 场` : null];
 return parts.filter(Boolean).join(" · ") || "全部比赛";
}
