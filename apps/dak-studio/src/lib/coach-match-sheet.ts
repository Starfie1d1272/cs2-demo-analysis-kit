import { getStorage, type RecordStore } from './storage';
import type { SheetMaterialRef } from './material-ref';

export interface CoachMatchSheet { schemaVersion: 1; id: string; title: string; mapName: string | null; opponentLabel: string; sections: Array<{ id: string; heading: string; notes: string; refs: SheetMaterialRef[] }>; createdAt: number; updatedAt: number }
export type CoachMatchSheetDraft = Pick<CoachMatchSheet, 'title' | 'mapName' | 'opponentLabel' | 'sections'>;
export const emptyMatchSheet = (): CoachMatchSheetDraft => ({ title: '', mapName: null, opponentLabel: '', sections: [{ id: crypto.randomUUID(), heading: '重点', notes: '', refs: [] }] });
const kinds = ['study-note', 'training-focus', 'prep-item', 'practice-lineup', 'playbook', 'assignment-set'];
const object = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object';
function valid(x: unknown): x is CoachMatchSheet { return object(x) && x.schemaVersion === 1 && typeof x.id === 'string' && typeof x.title === 'string' && !!x.title.trim() && (x.mapName === null || typeof x.mapName === 'string') && typeof x.opponentLabel === 'string' && Array.isArray(x.sections) && x.sections.every((s: unknown) => object(s) && typeof s.id === 'string' && typeof s.heading === 'string' && typeof s.notes === 'string' && Array.isArray(s.refs) && s.refs.every((r: unknown) => object(r) && kinds.includes(r.kind) && typeof r.id === 'string') && new Set(s.refs.map((r: SheetMaterialRef) => `${r.kind}:${r.id}`)).size === s.refs.length) && Number.isFinite(x.createdAt) && Number.isFinite(x.updatedAt); }
export function createCoachMatchSheetStore(records: RecordStore) { return {
  async list() { const all = await records.getAll<unknown>(); return { items: all.filter(valid), unreadable: all.filter(x => !valid(x)).length }; },
  async get(id: string) { const item = await records.get<unknown>(id); if (item === undefined) return null; if (!valid(item)) throw new Error('比赛单无法读取'); return item; },
  async create(draft: CoachMatchSheetDraft) { const now = Date.now(); const item = { ...structuredClone(draft), title: draft.title.trim(), schemaVersion: 1 as const, id: crypto.randomUUID(), createdAt: now, updatedAt: now }; if (!valid(item)) throw new Error('请填写标题并检查引用'); await records.put(item.id, item); return item; },
  async update(id: string, draft: CoachMatchSheetDraft) { const old = await records.get<unknown>(id); if (!valid(old)) return null; const item = { ...old, ...structuredClone(draft), title: draft.title.trim(), updatedAt: Date.now() }; if (!valid(item)) throw new Error('请填写标题并检查引用'); await records.put(id, item); return item; },
  async remove(id: string) { await records.delete(id); },
}; }
const store = createCoachMatchSheetStore(getStorage().records('coach-match-sheets'));
export const listCoachMatchSheets = store.list; export const getCoachMatchSheet = store.get; export const createCoachMatchSheet = store.create; export const updateCoachMatchSheet = store.update; export const removeCoachMatchSheet = store.remove;
