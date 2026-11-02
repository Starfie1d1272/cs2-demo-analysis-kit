import { getCoachMatchSheet, listCoachMatchSheets } from "./coach-match-sheet";
import { listCoachAssignments } from "./coach-assignments";
import { listCoachPlaybook, getCoachPlaybook, type CoachPlaybookItem } from "./coach-playbook";
import type { MaterialRef } from "./material-ref";
import { getStudyNote, listStudyNotes } from "./study-notes";
import { listTrainingFocus } from "./training-focus";
import { listPrepItems } from "./prep-items";
import { listPracticeLineups } from "./practice-lineups";
import { resolveSavedEvidence, type SavedEvidenceRef } from "./saved-evidence";
import type { StudioDemoEntry } from "./demo-entry";
import { matchIdForEntry } from "./demo-entry";
import { FACTS_REVISION } from "./analysis-manifest";

export type MaterialSourceStatus = "no-evidence" | "exact" | "version-changed" | "missing" | "conflict" | "unverified";
export interface MaterialSummary { ref: MaterialRef; title: string; kindLabel: string; mapName: string | null; summary: string; updatedAt: number | null; sourceStatus: MaterialSourceStatus; side?: CoachPlaybookItem["side"]; playKind?: CoachPlaybookItem["kind"] }
export type MaterialKind = "assignment-set" | "playbook" | "study-note" | "training-focus" | "prep-item" | "practice-lineup" | "match-sheet";
export const materialKey = (ref: MaterialRef): string => `${ref.kind}:${ref.id}`;
export const sortMaterials = (rows: MaterialSummary[]) => rows.sort((a,b) => (b.updatedAt ?? -Infinity) - (a.updatedAt ?? -Infinity) || materialKey(a.ref).localeCompare(materialKey(b.ref)));
function noteStatus(evidence: SavedEvidenceRef[], entries: StudioDemoEntry[]): MaterialSourceStatus {
  if (!evidence.length) return "no-evidence";
  const statuses = evidence.map(item => resolveSavedEvidence(item, entries).status);
  return (["conflict", "missing", "version-changed", "unverified", "exact"] as const).find(status => statuses.includes(status)) ?? "unverified";
}
export async function listStudyMaterialsKind(kind: MaterialKind, entries: StudioDemoEntry[]): Promise<{ rows: MaterialSummary[]; unreadable: number }> {
  let rows: MaterialSummary[];
  switch (kind) {
    case "match-sheet": { const result = await listCoachMatchSheets(); return { rows: result.items.map(n => ({ ref: { kind, id: n.id }, title: n.title, kindLabel: "比赛单", mapName: n.mapName, summary: n.opponentLabel, updatedAt: n.updatedAt, sourceStatus: "no-evidence" as const })), unreadable: result.unreadable }; }
    case "assignment-set": { const result = await listCoachAssignments(); rows = result.items.map(n => ({ ref: { kind, id: n.id }, title: n.title, kindLabel: `人员安排 · ${n.side.toUpperCase()}`, mapName: n.mapName, summary: n.teamLabel, updatedAt: n.updatedAt, sourceStatus: !n.observedTeamKey || !n.observedEntryIds.length ? "no-evidence" : n.observedEntryIds.some(id => !entries.some(e => e.id === id)) ? "missing" : "unverified" })); return { rows: sortMaterials(rows), unreadable: result.unreadable }; }
    case "playbook": { const result = await listCoachPlaybook(); rows = result.items.map(n => ({ ref: { kind, id: n.id }, title: n.title, kindLabel: `战术 · ${n.side.toUpperCase()} · ${n.kind}`, side: n.side, playKind: n.kind, mapName: n.mapName, summary: n.body, updatedAt: n.updatedAt, sourceStatus: noteStatus(n.evidence, entries) })); return { rows: sortMaterials(rows), unreadable: result.unreadable }; }
    case "study-note": { const result = await listStudyNotes(); rows = result.notes.map(n => ({ ref: { kind, id: n.id }, title: n.title, kindLabel: "笔记", mapName: n.evidence[0]?.source.mapName ?? null, summary: n.body, updatedAt: n.updatedAt, sourceStatus: noteStatus(n.evidence, entries) })); return { rows: sortMaterials(rows), unreadable: result.unreadable }; }
    case "training-focus": rows = (await listTrainingFocus()).map(n => ({ ref: { kind, id: n.id }, title: n.finding.title, kindLabel: "训练重点", mapName: null, summary: n.note || n.finding.statement, updatedAt: n.updatedAt, sourceStatus: !n.evidence.length ? "no-evidence" : n.evidence.some(e => !entries.some(entry => matchIdForEntry(entry) === e.matchId)) ? "missing" : "unverified" })); break;
    case "prep-item": rows = (await listPrepItems()).map(n => ({ ref: { kind, id: n.id }, title: n.group, kindLabel: "备战条目", mapName: n.mapName ?? null, summary: n.note, updatedAt: n.addedAt ?? null, sourceStatus: entries.some(entry => matchIdForEntry(entry) === n.matchId) ? "unverified" : "missing" })); break;
    case "practice-lineup": rows = (await listPracticeLineups()).map(n => ({ ref: { kind, id: n.id }, title: n.label, kindLabel: "练习点位", mapName: n.mapName, summary: n.practiceCommand ?? "", updatedAt: n.updatedAt, sourceStatus: !n.evidence ? "no-evidence" : !entries.some(e => e.id === n.evidence?.entryId) ? "missing" : !n.sourceFactsRevision ? "unverified" : n.sourceFactsRevision !== FACTS_REVISION ? "version-changed" : "unverified" })); break;
  }
  return { rows: sortMaterials(rows), unreadable: 0 };
}
export async function listStudyMaterials(entries: StudioDemoEntry[], includePrep = true) {
  const kinds: MaterialKind[] = ["match-sheet", "assignment-set", "playbook", "study-note", "training-focus", ...(includePrep ? ["prep-item" as const] : []), "practice-lineup"];
  const results = await Promise.allSettled(kinds.map(kind => listStudyMaterialsKind(kind, entries)));
  const rows: MaterialSummary[] = []; const errors: Partial<Record<MaterialKind, string>> = {}; const unreadableByKind: Partial<Record<MaterialKind, number>> = {}; let unreadable = 0;
  results.forEach((result, index) => { if (result.status === "fulfilled") { rows.push(...result.value.rows); unreadable += result.value.unreadable; unreadableByKind[kinds[index]] = result.value.unreadable; } else errors[kinds[index]] = String(result.reason); });
  return { rows: sortMaterials(rows), errors, unreadable, unreadableByKind };
}

/** Resolve one reference against its owning store without loading match data. */
export async function resolveStudyMaterial(ref: MaterialRef, entries: StudioDemoEntry[]): Promise<MaterialSummary | null> {
  switch (ref.kind) {
    case "match-sheet": { const n = await getCoachMatchSheet(ref.id); return n ? { ref: { ...ref }, title: n.title, kindLabel: "比赛单", mapName: n.mapName, summary: n.opponentLabel, updatedAt: n.updatedAt, sourceStatus: "no-evidence" } : null; }
    case "playbook": { const n = await getCoachPlaybook(ref.id); return n ? { ref: { ...ref }, title: n.title, kindLabel: `战术 · ${n.side.toUpperCase()} · ${n.kind}`, side: n.side, playKind: n.kind, mapName: n.mapName, summary: n.body, updatedAt: n.updatedAt, sourceStatus: noteStatus(n.evidence, entries) } : null; }
    case "study-note": {
      const n = await getStudyNote(ref.id);
      return n ? { ref: { ...ref }, title: n.title, kindLabel: "笔记", mapName: n.evidence[0]?.source.mapName ?? null, summary: n.body, updatedAt: n.updatedAt, sourceStatus: noteStatus(n.evidence, entries) } : null;
    }
    case "assignment-set": case "training-focus": case "prep-item": case "practice-lineup":
      return (await listStudyMaterialsKind(ref.kind, entries)).rows.find(row => row.ref.id === ref.id) ?? null;
    default: return null;
  }
}
