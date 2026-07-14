import { X, Download, ExternalLink } from "lucide-react";
import { type UpdateInfo, RELEASES_PAGE } from "../lib/update";
import { applyUpdate, applyWebUpdate, canSelfUpdate, downloadUpdate, type UpdateJobStatus } from "../lib/updater-bridge";
import { useState, useCallback } from "react";
import { Changelog } from "./Changelog";

interface Props {
  update: UpdateInfo;
  onDismiss: () => void;
}

/**
 * 发现新版本弹窗：显示 changelog（markdown 渲染）+ 一键更新/手动跳转。
 * 安装说明仅留在 GitHub Release 页，弹窗只展示变更内容。
 * 弹窗关闭后侧栏仍保留更新入口（UpdateControl）。
 */
export function UpdateModal({ update, onDismiss }: Props) {
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<UpdateJobStatus | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const canAuto = canSelfUpdate(update.asset);
  const asset = update.asset;
  const manualUrl = asset?.kind === "runtime" ? (asset.urls[0] ?? update.url ?? RELEASES_PAGE) : (update.url || RELEASES_PAGE);

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
      const applied = asset.kind === "web"
        ? await applyWebUpdate(result.jobId, update.latest)
        : await applyUpdate(result.jobId);
      if (!applied.ok) {
        setFailed(applied.error ?? "替换失败");
        setBusy(false);
      } else if (asset.kind === "web") {
        window.location.reload();
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
      ? asset?.kind === "web" ? `增量更新到 v${update.latest}` : `更新到 v${update.latest}`
      : job?.state === "verifying"
        ? "校验中…"
        : job?.state === "applying" || job?.state === "ready"
          ? asset?.kind === "web" ? "正在刷新…" : "正在重启…"
          : pct != null
            ? `下载中 ${pct}%`
            : "准备中…";

  return (
    <div className="stu-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="stu-dialog stu-dialog-update" role="dialog" aria-label="发现新版本">
        <div className="stu-modal-header">
          <Download size={18} />
          <span>新版本 v{update.latest} 可用</span>
          <button type="button" className="stu-modal-close" onClick={onDismiss}>
            <X size={16} />
          </button>
        </div>

        <div className="stu-modal-body">
          {update.notes ? (
            <Changelog markdown={update.notes} />
          ) : (
            <p className="stu-text-dim">查看 GitHub Release 了解更新内容</p>
          )}
        </div>

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
              <a className="stu-btn stu-btn-primary" href={manualUrl} target="_blank" rel="noreferrer">
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
