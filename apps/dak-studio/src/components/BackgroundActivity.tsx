import type { ReactNode } from "react";
import type { useStudioActivity } from "../app/use-studio-activity";
import type { RivalHubBatchSession } from "../lib/rivalhub-import";

export function BackgroundActivity({ activity, batch, children }: { activity: ReturnType<typeof useStudioActivity>; batch: RivalHubBatchSession | null; children: ReactNode }) {
  const { importing, notice, setNotice, exportQueries, recheckExport } = activity;
  if (!importing && !notice && !exportQueries.length && !batch) return null;
  const summary = importing ? notice ?? "正在处理导入或重建" : exportQueries.some(row => row.uncertain) ? "仍在确认后台任务状态" : batch ? "RivalHub 批处理" : notice ?? "后台任务";
  return <details className="stu-notice" role="status"><summary>{summary} · 详情</summary>
    {exportQueries.map(query => <div key={query.jobId}>
      <p>{query.uncertain ? "仍在确认后台任务状态" : query.message}</p>
      <p>解析任务 {query.jobId} · 阶段 {query.stage} · 最后进度 {query.progress === null ? "未知" : `${Math.round(query.progress * 100)}%`}</p>
      {query.diagnostic?.cause && <p>{query.diagnostic.cause}</p>}
      {query.uncertain && <button type="button" onClick={() => recheckExport(query.jobId)}>重查此任务状态</button>}
    </div>)}
    {notice && <div><span>{notice}</span><button type="button" aria-label="关闭通知" onClick={() => setNotice(null)}>✕</button></div>}
    {children}
  </details>;
}
