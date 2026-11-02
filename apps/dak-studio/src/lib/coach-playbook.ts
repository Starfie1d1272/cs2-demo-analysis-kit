import { getStorage, type RecordStore } from "./storage";
import { validEvidence } from "./study-notes";
import type { SavedEvidenceRef } from "./saved-evidence";
export interface CoachMarker { id: string; kind: "position" | "smoke" | "flash" | "fire" | "note"; label: string; u: number; v: number; level: "upper" | "lower" }
export interface CoachPhase { id: string; title: string; body: string; tasks: Array<{ id: string; playerLabel: string; instruction: string }>; markers: CoachMarker[] }
export interface CoachPlaybookItem { schemaVersion: 1; id: string; kind: "default" | "protocol" | "play"; title: string; mapName: string; side: "t" | "ct"; purpose: string; trigger: string; body: string; tags: string[]; phases: CoachPhase[]; evidence: SavedEvidenceRef[]; createdAt: number; updatedAt: number }
export type CoachPlaybookDraft = Pick<CoachPlaybookItem, "kind" | "title" | "mapName" | "side" | "purpose" | "trigger" | "body" | "tags" | "phases" | "evidence">;
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object";
const str = (x: unknown): x is string => typeof x === "string";
function validPhase(x: unknown): x is CoachPhase { return obj(x) && str(x.id) && str(x.title) && str(x.body) && Array.isArray(x.tasks) && x.tasks.every(t => obj(t) && str(t.id) && str(t.playerLabel) && str(t.instruction)) && Array.isArray(x.markers) && x.markers.every(m => obj(m) && str(m.id) && ["position", "smoke", "flash", "fire", "note"].includes(String(m.kind)) && str(m.label) && typeof m.u === "number" && m.u >= 0 && m.u <= 1 && typeof m.v === "number" && m.v >= 0 && m.v <= 1 && (m.level === "upper" || m.level === "lower")); }
function valid(x: unknown): x is CoachPlaybookItem { return obj(x) && x.schemaVersion === 1 && str(x.id) && ["default", "protocol", "play"].includes(String(x.kind)) && str(x.title) && !!x.title.trim() && str(x.mapName) && !!x.mapName && (x.side === "t" || x.side === "ct") && str(x.purpose) && str(x.trigger) && str(x.body) && Array.isArray(x.tags) && x.tags.every(str) && Array.isArray(x.phases) && x.phases.every(validPhase) && Array.isArray(x.evidence) && x.evidence.every(validEvidence) && typeof x.createdAt === "number" && Number.isFinite(x.createdAt) && typeof x.updatedAt === "number" && Number.isFinite(x.updatedAt); }
export function createCoachPlaybookStore(records: RecordStore) {
  return {
    async list() { const all = await records.getAll<unknown>(); const items = all.filter(valid); return { items, unreadable: all.length - items.length }; },
    async get(id: string) { const value = await records.get<unknown>(id); if (value === undefined) return null; if (!valid(value)) throw new Error("战术记录无法读取"); return value; },
    async create(draft: CoachPlaybookDraft) { const now = Date.now(); const item = { ...structuredClone(draft), title: draft.title.trim(), schemaVersion: 1 as const, id: crypto.randomUUID(), createdAt: now, updatedAt: now }; if (!valid(item)) throw new Error("请填写标题并选择地图、阵营和种类"); await records.put(item.id, item); return item; },
    async update(id: string, draft: CoachPlaybookDraft) { const old = await records.get<unknown>(id); if (!valid(old)) return null; const item = { ...old, ...structuredClone(draft), title: draft.title.trim(), updatedAt: Date.now() }; if (!valid(item)) throw new Error("请填写标题并选择地图、阵营和种类"); await records.put(id, item); return item; },
    async remove(id: string) { const old = await records.get<unknown>(id); if (!valid(old)) throw new Error("战术记录不存在或无法读取"); await records.delete(id); },
    async copy(id: string) { const old = await records.get<unknown>(id); if (!valid(old)) throw new Error("战术记录不存在或无法读取"); const now = Date.now(); const item = { ...structuredClone(old), id: crypto.randomUUID(), createdAt: now, updatedAt: now, phases: old.phases.map(p => ({ ...structuredClone(p), id: crypto.randomUUID(), tasks: p.tasks.map(t => ({ ...t, id: crypto.randomUUID() })), markers: p.markers.map(m => ({ ...m, id: crypto.randomUUID() })) })) }; await records.put(item.id, item); return item; },
  };
}
const store = createCoachPlaybookStore(getStorage().records("coach-playbook"));
export const listCoachPlaybook = store.list; export const getCoachPlaybook = store.get; export const createCoachPlaybook = store.create; export const updateCoachPlaybook = store.update; export const removeCoachPlaybook = store.remove; export const copyCoachPlaybook = store.copy;
