import type { QaReport } from "@cs2dak/contract";

export interface QaReportPanelProps {
  report: QaReport;
}

export function QaReportPanel({ report }: QaReportPanelProps) {
  return (
    <div className="dak-qa">
      <div className="dak-qa-summary">
        <span className={report.ok ? "dak-qa-ok" : "dak-qa-warn"}>
          {report.ok ? "QA passed" : "QA has issues"}
        </span>
        <span>{report.summary.issueCount} issue(s)</span>
        <span>{report.summary.errorCount} error(s)</span>
        <span>{report.summary.warningCount} warning(s)</span>
      </div>
      {report.issues.length > 0 && (
        <div className="dak-qa-list">
          {report.issues.map((issue) => (
            <div className="dak-qa-row" key={`${issue.code}-${issue.message}`}>
              <span className="dak-badge">{issue.severity}</span>
              <span className="dak-mono dak-muted">{issue.code}</span>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
