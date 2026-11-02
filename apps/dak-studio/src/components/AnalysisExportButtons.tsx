import { downloadAnalysisResult } from "../lib/analysis-export-download";
import type { AnalysisResultSnapshotV1 } from "../lib/analysis-export";
import { useState, useSyncExternalStore } from "react";
import { assertExportReady, getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation } from "../lib/queries/query-cache";
import { FactsNotReadyError } from "../lib/facts-readiness";

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
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const [error, setError] = useState<string | null>(null);
  const download = async (format: "markdown" | "json") => {
    try {
      const result = capture();
      await assertExportReady(result.sources.map(source => source.entryId), analysis.generation);
      downloadAnalysisResult(result, format);
      setError(null);
    } catch (reason) {
      setError(reason instanceof FactsNotReadyError || (reason instanceof Error && reason.name === "AbortError")
        ? "分析数据正在更新，请刷新后重试。"
        : `导出失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };
  return (
    <details className="stu-export-menu">
      <summary className="stu-button-sm" aria-disabled={disabled}>导出结果</summary>
      <div className="stu-export-options">
        {note && <span className="stu-export-note">{note}</span>}
        <button type="button" className="stu-button-sm" disabled={disabled || analysis.status !== "ready"} onClick={() => void download("markdown")}>Markdown</button>
        <button type="button" className="stu-button-sm" disabled={disabled || analysis.status !== "ready"} onClick={() => void download("json")}>JSON</button>
        {error && <span className="stu-export-note" role="status">{error}</span>}
      </div>
    </details>
  );
}
