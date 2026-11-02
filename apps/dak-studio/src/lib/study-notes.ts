import { getStorage, type RecordStore } from "./storage";
import type { SavedEvidenceRef } from "./saved-evidence";

export interface StudyNote { schemaVersion: 1; id: string; title: string; body: string; purpose: "review" | "practice"; playerKey: string | null; evidence: SavedEvidenceRef[]; createdAt: number; updatedAt: number }
export type StudyNoteDraft = Pick<StudyNote, "title" | "body" | "purpose" | "playerKey" | "evidence">;
export type CreateStudyNoteInput = Omit<StudyNoteDraft, "purpose"> & { purpose?: StudyNoteDraft["purpose"] };
export function validEvidence(value: unknown): value is SavedEvidenceRef {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<SavedEvidenceRef>;
  return typeof v.id === "string" && typeof v.capturedAt === "number" && Number.isFinite(v.capturedAt) && !!v.source && typeof v.source.entryId === "string" && typeof v.source.matchId === "string" && typeof v.source.fileName === "string" && typeof v.source.mapName === "string" && (v.source.demoSha256 === null || typeof v.source.demoSha256 === "string") && (v.source.builtWith === null || typeof v.source.builtWith === "object") && !!v.evidence && typeof v.evidence.matchId === "string" && Number.isInteger(v.evidence.roundNumber) && v.evidence.roundNumber > 0 && typeof v.evidence.reason === "string";
}
function valid(value: unknown): value is StudyNote {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<StudyNote>;
  return v.schemaVersion === 1 && typeof v.id === "string" && typeof v.title === "string" && !!v.title.trim() && typeof v.body === "string" && (v.purpose === "review" || v.purpose === "practice") && (v.playerKey === null || typeof v.playerKey === "string") && Array.isArray(v.evidence) && v.evidence.every(validEvidence) && typeof v.createdAt === "number" && Number.isFinite(v.createdAt) && typeof v.updatedAt === "number" && Number.isFinite(v.updatedAt);
}
export function createStudyNotesStore(records: RecordStore) {
  return {
    async list(): Promise<{ notes: StudyNote[]; unreadable: number }> { const all = await records.getAll<unknown>(); const notes = all.filter(valid); return { notes, unreadable: all.length - notes.length }; },
    async get(id: string): Promise<StudyNote | null> { const value = await records.get<unknown>(id); if (value === undefined) return null; if (!valid(value)) throw new Error("笔记记录无法读取"); return value; },
    async create(draft: CreateStudyNoteInput): Promise<StudyNote> { const title = draft.title.trim(); if (!title) throw new Error("标题不能为空"); const now = Date.now(); const note: StudyNote = { ...structuredClone(draft), title, purpose: draft.purpose ?? "review", schemaVersion: 1, id: crypto.randomUUID(), createdAt: now, updatedAt: now }; await records.put(note.id, note); return note; },
    async update(id: string, draft: StudyNoteDraft): Promise<StudyNote | null> { const old = await records.get<unknown>(id); if (!valid(old)) return null; const title = draft.title.trim(); if (!title) throw new Error("标题不能为空"); const note: StudyNote = { ...old, ...structuredClone(draft), title, updatedAt: Date.now() }; await records.put(id, note); return note; },
    async remove(id: string): Promise<void> { await records.delete(id); },
  };
}
const store = createStudyNotesStore(getStorage().records("study-notes"));
export const listStudyNotes = store.list;
export const getStudyNote = store.get;
export const createStudyNote = store.create;
export const updateStudyNote = store.update;
export const removeStudyNote = store.remove;
