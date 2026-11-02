import { downloadAnalysisResult } from "../lib/analysis-export-download";
import type { AnalysisResultSnapshotV1 } from "../lib/analysis-export";

/** Capture at click time, so the saved file cannot follow later page changes. */
export function AnalysisExportButtons({
  capture,
  disabled = false,
  label = "导出本次结果",
}: {
  capture: () => AnalysisResultSnapshotV1;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <span className="stu-header-actions">
      <button
        type="button"
        className="stu-button-sm"
        disabled={disabled}
        onClick={() => downloadAnalysisResult(capture(), "markdown")}
      >
        {label} · Markdown
      </button>
      <button
        type="button"
        className="stu-button-sm"
        disabled={disabled}
        onClick={() => downloadAnalysisResult(capture(), "json")}
      >
        {label} · JSON
      </button>
    </span>
  );
}
