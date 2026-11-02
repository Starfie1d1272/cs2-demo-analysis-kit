import { isAnalysisStale } from "./analysis-manifest";
import type { StudioDemoEntry } from "./demo-entry";
import { getStorage } from "./storage";
export class FactsNotReadyError extends Error {
  constructor(public readonly entryIds: string[]) { super(`${entryIds.length} 场比赛需要更新分析数据`); this.name = "FactsNotReadyError"; }
}
export function assertCurrentFacts(entries: readonly StudioDemoEntry[]): void {
  const ids = entries.filter(entry => isAnalysisStale(entry.builtWith)).map(entry => entry.id);
  if (ids.length) throw new FactsNotReadyError(ids);
}

/** Recheck persistent entries; another window may be committing or have replaced them. */
export async function assertStoredFacts(entries: readonly StudioDemoEntry[], allowStale = false): Promise<void> {
  const snapshots = await getStorage().readRecords(entries.map(entry => ({ namespace: "demos", key: entry.id })));
  const ids = entries.filter((entry, i) => {
    const snapshot = snapshots[i];
    const current = snapshot?.exists ? snapshot.value as StudioDemoEntry : null;
    return !current || !!current.pendingCommit || (!allowStale && isAnalysisStale(current.builtWith)) ||
      current.sourceRevision !== entry.sourceRevision || JSON.stringify(current.builtWith) !== JSON.stringify(entry.builtWith);
  }).map(entry => entry.id);
  if (ids.length) throw new FactsNotReadyError(ids);
}
