import type { AtomicStorageAdapter } from './storage/types';
import { commitMaterialRevision, materialBaseline } from './material-revision';
import { getStorage } from './storage';
import type { SheetMaterialRef } from './material-ref';

export interface CoachMatchSheet {
  schemaVersion: 1;
  id: string;
  title: string;
  mapName: string | null;
  opponentLabel: string;
  sections: Array<{
    id: string;
    heading: string;
    notes: string;
    refs: SheetMaterialRef[];
  }>;
  createdAt: number;
  updatedAt: number;
}
export type CoachMatchSheetDraft = Pick<
  CoachMatchSheet,
  'title' | 'mapName' | 'opponentLabel' | 'sections'
>;
export const emptyMatchSheet = (): CoachMatchSheetDraft => ({
  title: '',
  mapName: null,
  opponentLabel: '',
  sections: [{ id: crypto.randomUUID(), heading: '重点', notes: '', refs: [] }],
});

const kinds = ['study-note', 'training-focus', 'practice-lineup', 'playbook', 'assignment-set'];
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';
const string = (x: unknown): x is string => typeof x === 'string';
function validRef(x: unknown): x is SheetMaterialRef {
  return object(x) && string(x.kind) && kinds.includes(x.kind) && string(x.id) && !!x.id;
}
function validSection(x: unknown): x is CoachMatchSheet['sections'][number] {
  if (
    !object(x) ||
    !string(x.id) ||
    !x.id ||
    !string(x.heading) ||
    !string(x.notes) ||
    !Array.isArray(x.refs) ||
    !x.refs.every(validRef)
  )
    return false;
  return new Set(x.refs.map((ref) => JSON.stringify([ref.kind, ref.id]))).size === x.refs.length;
}
function valid(x: unknown, key: string): x is CoachMatchSheet {
  if (
    !object(x) ||
    x.schemaVersion !== 1 ||
    !string(x.id) ||
    x.id !== key ||
    !string(x.title) ||
    !x.title.trim() ||
    !(x.mapName === null || string(x.mapName)) ||
    !string(x.opponentLabel) ||
    !Array.isArray(x.sections) ||
    !x.sections.every(validSection) ||
    typeof x.createdAt !== 'number' ||
    !Number.isFinite(x.createdAt) ||
    typeof x.updatedAt !== 'number' ||
    !Number.isFinite(x.updatedAt)
  )
    return false;
  return new Set(x.sections.map((section) => section.id)).size === x.sections.length;
}
export function createCoachMatchSheetStore(storage: AtomicStorageAdapter) {
  const namespace = 'coach-match-sheets';
  const records = storage.records(namespace);
  return {
    async list() {
      const all = await records.entries<unknown>();
      const items: CoachMatchSheet[] = [];
      let unreadable = 0;
      for (const [key, value] of all) {
        if (valid(value, key)) items.push(value);
        else unreadable++;
      }
      return { items, unreadable };
    },
    async get(id: string) {
      const item = await records.get<unknown>(id);
      if (item === undefined) return null;
      if (!valid(item, id)) throw new Error('比赛单无法读取');
      return item;
    },
    async create(draft: CoachMatchSheetDraft) {
      const now = Date.now();
      const item = {
        ...structuredClone(draft),
        title: draft.title.trim(),
        schemaVersion: 1 as const,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      if (!valid(item, item.id)) throw new Error('请填写标题并检查引用');
      await records.put(item.id, item);
      return item;
    },
    async update(id: string, draft: CoachMatchSheetDraft, revision: string) {
      const old = materialBaseline(revision, id, (value): value is CoachMatchSheet =>
        valid(value, id),
      );
      const item = {
        ...old,
        ...structuredClone(draft),
        title: draft.title.trim(),
        updatedAt: Date.now(),
      };
      if (!valid(item, id)) throw new Error('请填写标题并检查引用');
      await commitMaterialRevision(storage, namespace, id, old, {
        namespace,
        key: id,
        kind: 'put',
        value: item,
      });
      return item;
    },
    async remove(id: string, revision: string) {
      const old = materialBaseline(revision, id, (value): value is CoachMatchSheet =>
        valid(value, id),
      );
      await commitMaterialRevision(storage, namespace, id, old, {
        namespace,
        key: id,
        kind: 'delete',
      });
    },
  };
}
const store = createCoachMatchSheetStore(getStorage());
export const listCoachMatchSheets = store.list;
export const getCoachMatchSheet = store.get;
export const createCoachMatchSheet = store.create;
export const updateCoachMatchSheet = store.update;
export const removeCoachMatchSheet = store.remove;
