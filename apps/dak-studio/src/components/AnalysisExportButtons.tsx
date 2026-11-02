import { downloadAnalysisResult } from "../lib/analysis-export-download";
import type { AnalysisResultSnapshotV1 } from "../lib/analysis-export";

/** Capture at click time, so the saved file cannot follow later page changes. */
export function AnalysisExportButtons({ capture, disabled = false }: { capture: () => AnalysisResultSnapshotV1; disabled?: boolean }) {
  return <span className="stu-header-actions">
    <button type="button" className="stu-button-sm" disabled={disabled} onClick={() => downloadAnalysisResult(capture(), "markdown")}>导出本次结果 · Markdown</button>
    <button type="button" className="stu-button-sm" disabled={disabled} onClick={() => downloadAnalysisResult(capture(), "json")}>导出本次结果 · JSON</button>
  </span>;
}
