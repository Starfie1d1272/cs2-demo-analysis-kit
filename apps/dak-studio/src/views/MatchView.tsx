import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { buildMatchWorkspaceModel } from "@cs2dak/presentation";
import type { MatchWorkspaceModel } from "@cs2dak/contract";
import { MatchWorkspace, QaReportPanel } from "@cs2dak/react";
import { getDemoPackage, type StudioDemoEntry } from "../lib/library";

export interface MatchViewProps {
  entries: StudioDemoEntry[];
  demoId: string | null;
  onSelectDemo: (id: string) => void;
  onGoLibrary: () => void;
}

const modelCache = new Map<string, MatchWorkspaceModel>();

export function MatchView({ entries, demoId, onSelectDemo, onGoLibrary }: MatchViewProps) {
  const activeId = demoId ?? entries[0]?.id ?? null;
  const [model, setModel] = useState<MatchWorkspaceModel | null>(activeId ? modelCache.get(activeId) ?? null : null);
  const [error, setError] = useState<string | null>(null);
  const [showQa, setShowQa] = useState(false);

  useEffect(() => {
    if (!activeId) return;
    setShowQa(false);
    const cached = modelCache.get(activeId);
    if (cached) {
      setModel(cached);
      setError(null);
      return;
    }
    let cancelled = false;
    setModel(null);
    setError(null);
    getDemoPackage(activeId)
      .then((pkg) => {
        const built = buildMatchWorkspaceModel(pkg);
        modelCache.set(activeId, built);
        if (!cancelled) setModel(built);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  if (entries.length === 0) {
    return (
      <div className="stu-view">
        <div className="stu-empty">
          <div className="stu-empty-mark">⌖</div>
          <h2>还没有可分析的比赛</h2>
          <p>先在资料库导入 v2 ZIP。</p>
          <button type="button" className="stu-button" onClick={onGoLibrary}>
            去资料库
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stu-view stu-view-flush">
      <div className="stu-context-bar">
        <span className="stu-context-label">当前比赛</span>
        <select className="stu-select" value={activeId ?? ""} onChange={(e) => onSelectDemo(e.target.value)}>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.meta.mapName} · {entry.meta.teamAName} {entry.meta.teamAScore}:{entry.meta.teamBScore} {entry.meta.teamBName}
            </option>
          ))}
        </select>
        {model && (
          <button
            type="button"
            className={model.adminQa.ok ? "stu-qa-badge stu-qa-badge-ok" : "stu-qa-badge stu-qa-badge-warn"}
            title="导出包数据质量（strict validator + 分析 QA）"
            onClick={() => setShowQa((v) => !v)}
          >
            {model.adminQa.ok ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
            {model.adminQa.ok ? "QA 通过" : `QA ${model.adminQa.summary.issueCount} 项`}
          </button>
        )}
      </div>
      {model && showQa && (
        <div className="stu-embed stu-qa-panel">
          <QaReportPanel report={model.adminQa} />
        </div>
      )}
      {error ? (
        <div className="stu-empty">
          <h2>加载失败</h2>
          <p>{error}</p>
        </div>
      ) : !model ? (
        <div className="stu-loading">解析 demo 包并构建工作台…</div>
      ) : (
        <div className="stu-embed">
          <MatchWorkspace model={model} />
        </div>
      )}
    </div>
  );
}
