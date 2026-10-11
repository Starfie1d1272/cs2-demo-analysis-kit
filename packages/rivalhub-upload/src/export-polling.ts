import { normalizeDiagnostic, sanitizeDiagnosticText, type SafeDiagnostic } from "./diagnostics";

export interface ExportPollSnapshot {
  jobId: string;
  stage: string;
  progress: number | null;
  uncertain: boolean;
  message: string;
  diagnostic?: SafeDiagnostic;
}
interface Status { state: "running" | "done" | "error"; stage?: string; progress?: number; error?: string; diagnostic?: unknown; code?: string }
type Reply = { value: unknown } | { error: unknown } | { recheck: true };

/** Query deadlines describe the bridge, never the parser's lifetime. No start/cancel/cleanup operation here. */
export class ExportPolling {
  private rows = new Map<string, ExportPollSnapshot>();
  private listeners = new Set<() => void>();
  private wake = new Map<string, () => void>();
  private active = new Map<string, Promise<unknown>>();
  constructor(private options = { intervalMs: 500, queryMs: 30_000, unchangedMs: 120_000 }) {}
  snapshots = (): ExportPollSnapshot[] => [...this.rows.values()];
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  recheck = (jobId: string): void => { this.wake.get(jobId)?.(); };
  private publish(row: ExportPollSnapshot): void {
    if (JSON.stringify(this.rows.get(row.jobId)) === JSON.stringify(row)) return;
    this.rows.set(row.jobId, row);
    for (const listener of this.listeners) { try { listener(); } catch { /* UI/logging never changes job outcome. */ } }
  }
  wait<T>(jobId: string, read: () => Promise<T>, progress: (status: T) => void): Promise<T> {
    const existing = this.active.get(jobId);
    if (existing) return existing as Promise<T>;
    const task = this.poll(jobId, read, progress).finally(() => {
      this.active.delete(jobId); this.wake.delete(jobId); this.rows.delete(jobId);
      for (const listener of this.listeners) { try { listener(); } catch { /* best effort */ } }
    });
    this.active.set(jobId, task);
    return task;
  }
  private async poll<T>(jobId: string, read: () => Promise<T>, progress: (status: T) => void): Promise<T> {
    let stage = "尚未获取阶段", lastProgress: number | null = null, changedAt = Date.now();
    const publish = (message: string, code?: string, error?: unknown) => {
      const detail = error === undefined ? undefined : normalizeDiagnostic(error);
      const diagnostic = code ? normalizeDiagnostic({ code, message: `${message}（阶段：${stage}；最后进度：${lastProgress === null ? "未知" : Math.round(lastProgress * 100) + "%"}）`, cause: detail ? { message: detail.message, cause: detail.cause } : undefined, status: detail?.status, requestId: detail?.requestId }, { stage: "export.poll", fileId: jobId }) : undefined;
      this.publish({ jobId: sanitizeDiagnosticText(jobId), stage, progress: lastProgress, uncertain: !!code, message, diagnostic });
    };
    publish("正在查询已有解析任务的状态。大型 Demo 可能较慢。");
    // A late query can recover until explicit recheck. Recheck reads the same job, never starts it.
    const waitReply = async (pending: Promise<Reply>): Promise<Reply> => {
      for (;;) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timed = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), this.options.queryMs); });
        const reply = await Promise.race([pending, timed]);
        clearTimeout(timer);
        if (reply) return reply;
        publish("状态查询尚未返回，无法确认解析结果；任务可能仍在运行。可重查同一任务。", "EXPORT_QUERY_UNCONFIRMED");
        const signal = new Promise<null>(resolve => { this.wake.set(jobId, () => resolve(null)); });
        const eventual = await Promise.race([pending, signal]);
        this.wake.delete(jobId);
        if (eventual) return eventual;
        return { recheck: true };
      }
    };
    const pause = () => new Promise<void>(resolve => { this.wake.set(jobId, resolve); });
    for (;;) {
      const reply = await waitReply(Promise.resolve().then(read).then(value => ({ value }), error => ({ error })));
      if ("recheck" in reply) continue;
      if ("error" in reply) {
        publish("查询任务状态失败，无法确认解析结果；请重查同一任务或导出日志。", "EXPORT_QUERY_FAILED", reply.error);
        await pause(); this.wake.delete(jobId); continue;
      }
      const status = reply.value as Partial<Status> | null;
      if (!status || typeof status !== "object" || !["running", "done", "error"].includes(status.state ?? "") || status.code === "EXPORT_JOB_NOT_FOUND") {
        publish("服务未返回可识别的任务状态，无法确认解析结果；请重查同一任务或导出日志。", "EXPORT_STATE_UNKNOWN");
        await pause(); this.wake.delete(jobId); continue;
      }
      if (status.state === "error") throw status.diagnostic ?? new Error(status.error ?? "PARSE_FAILED：解析失败");
      if (status.state === "done") return reply.value as T;
      if (typeof status.progress !== "number" || !Number.isFinite(status.progress) || status.progress < 0 || status.progress > 1 || typeof status.stage !== "string") {
        publish("服务返回的阶段或进度无效，无法确认解析进展；请重查同一任务。", "EXPORT_STATUS_INVALID");
        await pause(); this.wake.delete(jobId); continue;
      }
      const nextStage = sanitizeDiagnosticText(status.stage);
      if (stage !== nextStage || lastProgress !== status.progress) changedAt = Date.now();
      stage = nextStage; lastProgress = status.progress;
      if (Date.now() - changedAt >= this.options.unchangedMs) {
        publish("状态查询正常，但阶段和进度长时间未变化。协议没有心跳，无法确认解析仍有进展；大型 Demo 也可能较慢，可继续等待或重查。", "EXPORT_PROGRESS_UNCONFIRMED");
      } else publish("正在解析；大型 Demo 可能较慢。");
      progress(reply.value as T);
      let timer: ReturnType<typeof setTimeout> | undefined;
      await new Promise<void>(resolve => {
        this.wake.set(jobId, resolve);
        timer = setTimeout(resolve, this.options.intervalMs);
      });
      clearTimeout(timer); this.wake.delete(jobId);
    }
  }
}
