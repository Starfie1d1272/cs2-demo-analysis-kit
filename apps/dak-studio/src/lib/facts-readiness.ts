import { isAnalysisStale } from "./analysis-manifest";
import type { StudioDemoEntry } from "./demo-entry";
export class FactsNotReadyError extends Error {
  constructor(public readonly entryIds: string[]) { super(`${entryIds.length} 场比赛需要更新分析数据`); this.name = "FactsNotReadyError"; }
}
export function assertCurrentFacts(entries: readonly StudioDemoEntry[]): void {
  const ids = entries.filter(entry => isAnalysisStale(entry.builtWith)).map(entry => entry.id);
  if (ids.length) throw new FactsNotReadyError(ids);
}
