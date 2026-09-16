import { useMemo } from "react";
import type { RivalHubBatchItem, RivalHubBatchSession } from "../lib/rivalhub-import";
import { rivalHubStatusPresentation } from "../lib/rivalhub-status";

const ACTIVE_BATCH_PHASES = new Set(["checking", "exporting", "importing", "matching", "building_evidence", "submitting"]);

export function currentRivalHubBatchItem(session: RivalHubBatchSession | null): RivalHubBatchItem | null {
  if (!session) return null;
  if (session.awaitingTargetItemId) return session.items.find((item) => item.id === session.awaitingTargetItemId) ?? null;
  const item = session.items[session.currentIndex];
  return item && ACTIVE_BATCH_PHASES.has(item.phase) ? item : null;
}

function ItemRow({ item, onSelectTarget }: { item: RivalHubBatchItem; onSelectTarget?: (itemId: string, matchMapId: string) => void }) {
  const status = rivalHubStatusPresentation(item.phase);
  return (
    <details className="stu-rivalhub-batch-item" open={item.phase === "needs_target" || Boolean(item.detail)}>
      <summary>
        <span className="stu-rivalhub-batch-file">{item.fileName}</span>
        <span className={status.className}><i />{status.label}</span>
        {item.matchedSeriesLabel && <span className="stu-muted">{item.matchedSeriesLabel}</span>}
      </summary>
      {(item.detail || item.targetCandidates?.length) && (
        <div className="stu-rivalhub-batch-detail">
          {item.detail && <p className="stu-muted">{item.detail}</p>}
          {item.targetCandidates && item.targetCandidates.length > 0 && (
            <div className="stu-rivalhub-target-picker" aria-label={`${item.fileName} 目标地图`}>
              <b>请选择官方目标</b>
              {item.targetCandidates.map((candidate) => (
                <button
                  key={candidate.matchMapId}
                  type="button"
                  className="stu-button-sm"
                  onClick={() => onSelectTarget?.(item.id, candidate.matchMapId)}
                >
                  {candidate.stageName} · {candidate.mapName} · {candidate.teamAName} {candidate.scoreA ?? "—"}:{candidate.scoreB ?? "—"} {candidate.teamBName}
                </button>
              ))}
              <button type="button" className="stu-button-sm stu-button-danger" onClick={() => onSelectTarget?.(item.id, "")}>跳过此项</button>
            </div>
          )}
          {item.serverIssues && item.serverIssues.length > 0 && (
            <ul className="stu-rivalhub-batch-issues">
              {item.serverIssues.map((issue) => <li key={`${issue.code}:${issue.path ?? ""}`}>{issue.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}
export function RivalHubBatchImportPanel({
  session,
  onStop,
  onSelectTarget,
  onDismiss,
}: {
  session: RivalHubBatchSession | null;
  onStop?: () => void;
  onSelectTarget?: (itemId: string, matchMapId: string) => void;
  onDismiss?: () => void;
}) {
  const current = useMemo(() => currentRivalHubBatchItem(session), [session]);
  if (!session) return null;
  const finished = session.total === 0 ? 0 : session.items.filter((item) => ["synced", "needs_attention", "already_synced", "skipped", "failed"].includes(item.phase)).length;
  const currentStatus = current ? rivalHubStatusPresentation(current.phase) : null;
  return (
    <section className="stu-card stu-rivalhub-batch-panel" aria-live="polite" aria-label="RivalHub Demo 批处理进度">
      <header className="stu-rivalhub-batch-head">
        <div>
          <b>RivalHub Demo 批处理</b>
          <span className="stu-muted">{session.status === "completed" ? `已完成 · ${finished}/${session.total} 文件` : `${finished}/${session.total} 文件已完成`}</span>
        </div>
        {session.status === "completed" ? (
          <button type="button" className="stu-button stu-button-ghost" onClick={onDismiss}>关闭结果</button>
        ) : (
          <button type="button" className="stu-button stu-button-ghost" onClick={onStop} disabled={session.status === "stopping"}>
            {session.status === "stopping" ? "当前文件完成后停止…" : "当前文件完成后停止"}
          </button>
        )}
      </header>
      {current && currentStatus && (
        <div className="stu-rivalhub-batch-current">
          <span className="stu-muted">当前</span>
          <b>{current.fileName}</b>
          <span className={currentStatus.className}><i />{currentStatus.label}</span>
          {current.detail && <span className="stu-muted">{current.detail}</span>}
        </div>
      )}
      <div className="stu-chip-row stu-rivalhub-batch-counts">
        <span className="stu-chip stu-chip-active">已同步 {session.counts.synced}</span>
        <span className="stu-chip">已存在 {session.counts.alreadySynced}</span>
        <span className="stu-chip">需处理 {session.counts.needsAttention}</span>
        <span className="stu-chip">待目标 {session.counts.needsTarget}</span>
        <span className="stu-chip">已跳过 {session.counts.skipped}</span>
        <span className="stu-chip">失败 {session.counts.failed}</span>
        {session.counts.reusedLocal > 0 && <span className="stu-chip">复用本地 {session.counts.reusedLocal}</span>}
      </div>
      <div className="stu-rivalhub-batch-list">
        {session.items.map((item) => <ItemRow key={item.id} item={item} onSelectTarget={onSelectTarget} />)}
      </div>
    </section>
  );
}
