import type { AnalysisContext, AnalysisEventScope } from "../lib/analysis-context";
import { summarizeAnalysisContextParts } from "../lib/analysis-context";
import type { StudioDemoEntry } from "../lib/demo-entry";

export function AnalysisContextSummary({
  context,
  entries,
  events,
  onEdit,
}: {
  context: AnalysisContext;
  entries: readonly StudioDemoEntry[];
  events: readonly AnalysisEventScope[];
  onEdit?: () => void;
}) {
  const summary = summarizeAnalysisContextParts(context, entries, events);
  return (
    <div className="stu-analysis-context" aria-label="当前分析上下文">
      <span><small>对象</small>{summary.focus}</span>
      <span><small>范围与样本</small>{summary.corpus}</span>
      {onEdit && <button type="button" className="stu-context-edit" onClick={onEdit}>修改范围</button>}
    </div>
  );
}
