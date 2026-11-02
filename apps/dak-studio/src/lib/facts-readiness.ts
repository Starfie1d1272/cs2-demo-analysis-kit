import { isAnalysisStale } from "./analysis-manifest";
import type { StudioDemoEntry } from "./demo-entry";
export class FactsNotReadyError extends Error {
  constructor(public readonly entryIds: string[]) { super(`来源 facts 需要重建：${entryIds.join("、")}`); this.name = "FactsNotReadyError"; }
}
export function assertCurrentFacts(entries: readonly StudioDemoEntry[]): void {
  const ids = entries.filter(entry => isAnalysisStale(entry.builtWith)).map(entry => entry.id);
  if (ids.length) throw new FactsNotReadyError(ids);
}
