import type { AnalysisContext, AnalysisEventScope } from "../lib/analysis-context";
import { summarizeAnalysisContextParts } from "../lib/analysis-context";
import type { StudioDemoEntry } from "../lib/library";

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
      <span><small>语料</small>{summary.corpus}</span>
      <span><small>对象</small>{summary.focus}</span>
      {summary.roles && <span><small>关系</small>{summary.roles}</span>}
      <span><small>基线</small>{summary.baseline}</span>
      <span><small>目标</small>{summary.goal}</span>
      {onEdit && <button type="button" className="stu-context-edit" onClick={onEdit}>修改</button>}
    </div>
  );
}
