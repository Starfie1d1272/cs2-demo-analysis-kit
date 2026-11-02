import type { AtomicStorageAdapter } from "./storage/types";
import { commitMaterialRevision, materialBaseline } from "./material-revision";
import { getStorage } from "./storage";

export interface CoachAssignmentSet {
  schemaVersion: 1; id: string; title: string; teamLabel: string; mapName: string; side: "t" | "ct";
  observedTeamKey: string | null; observedEntryIds: string[];
  rows: Array<{ id: string; playerLabel: string; playerKey: string | null; positionLabel: string; responsibility: string; notes: string }>;
  createdAt: number; updatedAt: number;
}
export type CoachAssignmentSetDraft = Pick<CoachAssignmentSet, "title" | "teamLabel" | "mapName" | "side" | "observedTeamKey" | "observedEntryIds" | "rows">;
const object = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object";
const str = (x: unknown): x is string => typeof x === "string";
const nullable = (x: unknown) => x === null || str(x);
function valid(x: unknown): x is CoachAssignmentSet {
  return object(x) && x.schemaVersion === 1 && str(x.id) && str(x.title) && !!x.title.trim() && str(x.teamLabel) && str(x.mapName) && !!x.mapName.trim() && (x.side === "t" || x.side === "ct") && nullable(x.observedTeamKey) && Array.isArray(x.observedEntryIds) && x.observedEntryIds.every(str) && Array.isArray(x.rows) && x.rows.every(r => object(r) && str(r.id) && str(r.playerLabel) && nullable(r.playerKey) && str(r.positionLabel) && str(r.responsibility) && str(r.notes)) && typeof x.createdAt === "number" && Number.isFinite(x.createdAt) && typeof x.updatedAt === "number" && Number.isFinite(x.updatedAt);
}
function normalize(draft: CoachAssignmentSetDraft) {
  const d = structuredClone(draft);
  d.title = d.title.trim();
  d.rows = d.rows.filter(r => r.playerLabel.trim() || r.playerKey || r.positionLabel.trim() || r.responsibility.trim() || r.notes.trim());
  if (!d.observedTeamKey) d.observedEntryIds = [];
  return d;
}
export function createCoachAssignmentStore(storage: AtomicStorageAdapter) {
  const namespace = "coach-assignments";
  const records = storage.records(namespace);
  return {
    async list() { const all = await records.getAll<unknown>(); const items = all.filter(valid); return { items, unreadable: all.length - items.length }; },
    async get(id: string) { const value = await records.get<unknown>(id); if (value === undefined) return null; if (!valid(value)) throw new Error("人员安排无法读取"); return value; },
    async create(draft: CoachAssignmentSetDraft) { const now = Date.now(); const item = { ...normalize(draft), schemaVersion: 1 as const, id: crypto.randomUUID(), createdAt: now, updatedAt: now }; if (!valid(item)) throw new Error("请填写标题并选择地图和阵营"); await records.put(item.id, item); return item; },
    async update(id: string, draft: CoachAssignmentSetDraft, revision: string) { const old = materialBaseline(revision, id, valid); const item = { ...old, ...normalize(draft), updatedAt: Date.now() }; if (!valid(item)) throw new Error("请填写标题并选择地图和阵营"); await commitMaterialRevision(storage, namespace, id, old, { namespace, key: id, kind: "put", value: item }); return item; },
    async remove(id: string, revision: string) { const old = materialBaseline(revision, id, valid); await commitMaterialRevision(storage, namespace, id, old, { namespace, key: id, kind: "delete" }); },
  };
}
const store = createCoachAssignmentStore(getStorage());
export const listCoachAssignments = store.list; export const getCoachAssignment = store.get; export const createCoachAssignment = store.create; export const updateCoachAssignment = store.update; export const removeCoachAssignment = store.remove;
