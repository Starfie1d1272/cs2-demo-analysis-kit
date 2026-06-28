import { useState } from "react";
import type { UpdateInfo } from "../lib/update";
import { RELEASES_PAGE } from "../lib/update";
import { applyUpdate, applyWebUpdate, canSelfUpdate, downloadUpdate, type UpdateJobStatus } from "../lib/updater-bridge";

/**
 * 侧栏更新入口。
 * - 桌面壳 + 当前平台有资产：一键下载（镜像失败转移 + sha256 校验）→ 重启替换。
 * - 否则（浏览器/无资产/老发布）：退回 Release 页面手动下载链接。
 */
export function UpdateControl({ update }: { update: UpdateInfo }) {
  const [job, setJob] = useState<UpdateJobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  if (!canSelfUpdate(update.asset)) {
    return (
      <a className="stu-update-link" href={update.url || RELEASES_PAGE} target="_blank" rel="noreferrer">
        新版本 v{update.latest} 可下载
      </a>
    );
  }
  const asset = update.asset;

  async function run() {
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
  }

  const pct = job && job.state === "downloading" ? Math.round(job.progress * 100) : null;
  const label = !busy
    ? `更新到 v${update.latest}`
    : job?.state === "verifying"
      ? "校验中…"
      : job?.state === "applying" || job?.state === "ready"
        ? asset.kind === "web" ? "正在刷新…" : "正在重启…"
        : pct != null
          ? `下载中 ${pct}%`
          : "准备中…";

  return (
    <div className="stu-update-control">
      <button type="button" className="stu-update-link" onClick={run} disabled={busy}>
        {asset.kind === "web" && !busy ? `增量更新到 v${update.latest}` : label}
      </button>
      {job?.stage && busy && <small className="stu-dim">{job.stage}</small>}
      {failed && (
        <small className="stu-update-failed">
          {failed} ·{" "}
          <a href={update.url || RELEASES_PAGE} target="_blank" rel="noreferrer">手动下载</a>
        </small>
      )}
    </div>
  );
}
