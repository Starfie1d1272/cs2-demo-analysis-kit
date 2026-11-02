import { downloadAnalysisResult } from "../lib/analysis-export-download";
import type { AnalysisResultSnapshotV1 } from "../lib/analysis-export";

/** Capture at click time, so the saved file cannot follow later page changes. */
export function AnalysisExportButtons({
  capture,
  disabled = false,
  note,
}: {
  capture: () => AnalysisResultSnapshotV1;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <details className="stu-export-menu">
      <summary className="stu-button-sm" aria-disabled={disabled}>导出结果</summary>
      <div className="stu-export-options">
        {note && <span className="stu-export-note">{note}</span>}
        <button type="button" className="stu-button-sm" disabled={disabled} onClick={() => downloadAnalysisResult(capture(), "markdown")}>Markdown</button>
        <button type="button" className="stu-button-sm" disabled={disabled} onClick={() => downloadAnalysisResult(capture(), "json")}>JSON</button>
      </div>
    </details>
  );
}
