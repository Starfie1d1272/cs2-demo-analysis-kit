import type { UpdateAsset } from "./update";

/**
 * 桌面壳（pywebview）的应用内更新桥。
 * 仅在 `window.pywebview.api` 暴露更新方法时可用；浏览器/开发环境返回 null，
 * 上层退回“打开 Release 页面手动下载”。
 *
 * 真正的下载（镜像失败转移）、sha256 校验与 Windows side-by-side 替换+重启
 * 都在 Python 侧（cs2dak/updater.py + studio.py 的 StudioApi）。本模块只转发调用。
 */

export type UpdateJobState = "downloading" | "verifying" | "ready" | "applying" | "error";

export interface UpdateJobStatus {
  jobId: string;
  state: UpdateJobState;
  /** 人类可读阶段，如“下载中（镜像 2）”。 */
  stage: string;
  /** 0..1，下载阶段有效。 */
  progress: number;
  error: string | null;
  /** 已下载字节（用于显示）。 */
  receivedBytes: number;
}

interface UpdaterApi {
  update_start(urls: string[], sha256: string, size: number, name: string): Promise<{ jobId: string }>;
  update_status(jobId: string): Promise<UpdateJobStatus>;
  /** 解压 + 启动接力替换脚本 + 退出当前进程；成功不会返回（应用即将重启）。 */
  update_apply(jobId: string): Promise<{ ok: boolean; error?: string }>;
}

export function getUpdaterApi(): UpdaterApi | null {
  const api = typeof window === "undefined"
    ? undefined
    : ((window as unknown as { pywebview?: { api?: Partial<UpdaterApi> } }).pywebview?.api);
  if (!api?.update_start || !api.update_status || !api.update_apply) return null;
  return api as UpdaterApi;
}

/** 当前环境是否支持应用内一键更新（桌面壳 + 有当前平台资产）。 */
export function canSelfUpdate(asset: UpdateAsset | undefined): asset is UpdateAsset {
  return asset != null && getUpdaterApi() != null;
}

const POLL_INTERVAL_MS = 600;

/**
 * 启动下载并轮询到 ready/error。期间通过 onProgress 回传状态。
 * 返回最终状态；ready 后由调用方触发 applyUpdate。
 */
export async function downloadUpdate(
  asset: UpdateAsset,
  onProgress: (status: UpdateJobStatus) => void
): Promise<UpdateJobStatus> {
  const api = getUpdaterApi();
  if (!api) throw new Error("当前环境不支持应用内更新");
  const { jobId } = await api.update_start(asset.urls, asset.sha256, asset.size, asset.name);
  for (;;) {
    const status = await api.update_status(jobId);
    onProgress(status);
    if (status.state === "ready" || status.state === "error") return status;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

export async function applyUpdate(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const api = getUpdaterApi();
  if (!api) return { ok: false, error: "当前环境不支持应用内更新" };
  return api.update_apply(jobId);
}
