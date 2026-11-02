import { useCallback, useEffect, useRef, useState } from "react";
import { type ExportPollSnapshot } from "@cs2dak/rivalhub-upload";
import { exportPolling } from "../lib/dem";

export function useStudioActivity() {
  const [exportQueries, setExportQueries] = useState<ExportPollSnapshot[]>(() => exportPolling.snapshots());
  const [importing, setImporting] = useState(false);
  const owner = useRef<symbol | null>(null);
  const tryBegin = useCallback(() => {
    if (owner.current) return null;
    const token = Symbol();
    owner.current = token;
    setImporting(true);
    return () => { if (owner.current === token) { owner.current = null; setImporting(false); } };
  }, []);
  useEffect(() => {
    const reported = new Map<string, string>();
    return exportPolling.subscribe(() => {
      const rows = exportPolling.snapshots();
      setExportQueries(rows);
      for (const row of rows) if (row.diagnostic && reported.get(row.jobId) !== JSON.stringify(row.diagnostic)) {
        reported.set(row.jobId, JSON.stringify(row.diagnostic));
        void window.pywebview?.api.report_diagnostic?.(row.diagnostic).catch(() => {});
      }
      for (const row of rows) if (!row.uncertain) reported.delete(row.jobId);
      for (const id of reported.keys()) if (!rows.some(row => row.jobId === id)) reported.delete(id);
    });
  }, []);
  const [notice, setNotice] = useState<string | null>(null);
  return { importing, tryBegin, notice, setNotice, exportQueries, recheckExport: exportPolling.recheck };
}
