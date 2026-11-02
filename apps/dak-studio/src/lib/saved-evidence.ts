import type { EvidenceRef } from "@cs2dak/presentation";
import type { BuiltWith } from "./analysis-manifest";
import { matchIdForEntry, type StudioDemoEntry } from "./demo-entry";

export interface StudioSourceRef { entryId: string; matchId: string; fileName: string; mapName: string; demoSha256: string | null; builtWith: BuiltWith | null }
export interface SavedEvidenceRef { id: string; source: StudioSourceRef; evidence: EvidenceRef; capturedAt: number }
export interface SavedEvidenceResolution { status: "exact" | "version-changed" | "missing" | "conflict" | "unverified"; currentEntryId: string | null; canOpenCurrent: boolean; reason: string; uniqueRelinkCandidate: StudioSourceRef | null }

export function sourceRefForEntry(entry: StudioDemoEntry): StudioSourceRef {
  return { entryId: entry.id, matchId: matchIdForEntry(entry), fileName: entry.fileName, mapName: entry.meta.mapName, demoSha256: entry.demoSha256?.toLowerCase() ?? null, builtWith: entry.builtWith ? { ...entry.builtWith } : null };
}
export function captureSavedEvidence(entry: StudioDemoEntry, evidence: EvidenceRef): SavedEvidenceRef {
  return { id: crypto.randomUUID(), source: sourceRefForEntry(entry), evidence: structuredClone(evidence), capturedAt: Date.now() };
}
export function resolveSavedEvidence(ref: SavedEvidenceRef, entries: StudioDemoEntry[]): SavedEvidenceResolution {
  const source = ref.source;
  const entry = entries.find(item => item.id === source.entryId);
  const result = (status: SavedEvidenceResolution["status"], reason: string, currentEntryId: string | null = null, uniqueRelinkCandidate: StudioSourceRef | null = null): SavedEvidenceResolution => ({ status, reason, currentEntryId, canOpenCurrent: status === "exact" || status === "version-changed" || status === "unverified", uniqueRelinkCandidate });
  if (!entry) {
    const candidates = source.demoSha256 ? entries.filter(item => item.demoSha256?.toLowerCase() === source.demoSha256!.toLowerCase()) : [];
    return result("missing", "原比赛已不存在", null, candidates.length === 1 ? sourceRefForEntry(candidates[0]) : null);
  }
  const current = sourceRefForEntry(entry);
  if (current.matchId !== source.matchId || ref.evidence.matchId !== source.matchId || (current.demoSha256 && source.demoSha256 && current.demoSha256 !== source.demoSha256.toLowerCase())) return result("conflict", "来源身份冲突，不能自动打开");
  if (!current.demoSha256 || !source.demoSha256 || !current.builtWith?.formatVersion || !current.builtWith.factsRevision || !source.builtWith?.formatVersion || !source.builtWith.factsRevision) return result("unverified", "来源版本未知；可查看当前数据", entry.id);
  if (current.builtWith.formatVersion !== source.builtWith.formatVersion || current.builtWith.factsRevision !== source.builtWith.factsRevision) return result("version-changed", "分析版本已变化；可查看当前数据", entry.id);
  return result("exact", "来源和已知版本一致", entry.id);
}

/** Rebind one explicitly selected reference only if it is still the unique verified candidate. */
export function relinkSavedEvidence(ref: SavedEvidenceRef, candidate: StudioSourceRef, entries: StudioDemoEntry[]): SavedEvidenceRef | null {
  const current = resolveSavedEvidence(ref, entries).uniqueRelinkCandidate;
  if (!current || current.entryId !== candidate.entryId || current.matchId !== candidate.matchId) return null;
  return { ...ref, source: current, evidence: { ...ref.evidence, matchId: current.matchId } };
}
