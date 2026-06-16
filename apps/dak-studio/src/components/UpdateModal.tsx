import { X, Download, ExternalLink } from "lucide-react";
import { type UpdateInfo, RELEASES_PAGE } from "../lib/update";
import { applyUpdate, canSelfUpdate, downloadUpdate, type UpdateJobStatus } from "../lib/updater-bridge";
import { useState, useCallback } from "react";

interface Props {
  update: UpdateInfo;
  onDismiss: () => void;
}

/**
 * 发现新版本弹窗：显示版本号与更新日志（notes），提供一键更新或跳转 Release。
 * 弹窗关闭后侧栏仍保留更新入口（UpdateControl）。
 */
export function UpdateModal({ update, onDismiss }: Props) {
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<UpdateJobStatus | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const canAuto = canSelfUpdate(update.asset);
  const asset = update.asset;

  const runUpdate = useCallback(async () => {
    if (!asset) return;
    setBusy(true);
    setFailed(null);
    try {
      const result = await downloadUpdate(asset, setJob);
      if (result.state !== "ready") {
        setFailed(result.error ?? "下载失败");
        setBusy(false);
        return;
      }
      const applied = await applyUpdate(result.jobId);
      if (!applied.ok) {
        setFailed(applied.error ?? "替换失败");
        setBusy(false);
      }
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }, [asset]);

  const pct = job && job.state === "downloading" ? Math.round(job.progress * 100) : null;
  const actionLabel = !canAuto
    ? "手动下载"
    : !busy
      ? `更新到 v${update.latest}`
      : job?.state === "verifying"
        ? "校验中…"
        : job?.state === "applying" || job?.state === "ready"
          ? "正在重启…"
          : pct != null
            ? `下载中 ${pct}%`
            : "准备中…";

  return (
    <div className="stu-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="stu-modal" role="dialog" aria-label="发现新版本">
        <div className="stu-modal-header">
          <Download size={18} />
          <span>新版本 v{update.latest} 可用</span>
          <button type="button" className="stu-modal-close" onClick={onDismiss}>
            <X size={16} />
          </button>
        </div>

        {update.notes && (
          <div className="stu-modal-body">
            <pre className="stu-update-changelog">{update.notes}</pre>
          </div>
        )}

        <div className="stu-modal-footer">
          {failed && (
            <small className="stu-update-failed">{failed}</small>
          )}
          <div className="stu-modal-actions">
            {canAuto ? (
              <button type="button" className="stu-btn stu-btn-primary" onClick={runUpdate} disabled={busy}>
                {actionLabel}
              </button>
            ) : (
              <a className="stu-btn stu-btn-primary" href={update.url || RELEASES_PAGE} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> 手动下载
              </a>
            )}
            <button type="button" className="stu-btn stu-btn-ghost" onClick={onDismiss}>
              稍后提醒
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
