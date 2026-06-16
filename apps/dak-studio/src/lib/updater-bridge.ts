/**
 * 桌面壳（pywebview）的应用内更新桥。
 * 仅在 `window.pywebview.api` 暴露更新方法时可用；浏览器/开发环境返回 null，
 * 上层退回"打开 Release 页面手动下载"。
 *
 * - 检查更新（check_update）：Python 端用 urllib 拉取 manifest（无 CORS），
 *   返回 {version, notes, assets}。所有桌面端（包括 macOS）都可用，用于弹窗。
 * - 下载/校验/替换：真正的下载（镜像失败转移）、sha256 校验与 Windows
 *   side-by-side 替换+重启都在 Python 侧（cs2dak/updater.py + studio.py）。
 *   本模块只转发调用。
 */

import type { UpdateAsset, UpdateInfo } from "./update";
import { APP_VERSION, semverLess, RELEASES_PAGE } from "./update";

export type UpdateJobState = "downloading" | "verifying" | "ready" | "applying" | "error";

export interface UpdateJobStatus {
  jobId: string;
  state: UpdateJobState;
  /** 人类可读阶段，如"下载中（镜像 2）"。 */
  stage: string;
  /** 0..1，下载阶段有效。 */
  progress: number;
  error: string | null;
  /** 已下载字节（用于显示）。 */
  receivedBytes: number;
}

/**
 * pywebview JS Bridge 的类型定义。字段可能部分缺失（macOS 无 apply、dev 无桥）。
 */
interface PywebviewApi {
  /** Python 端 urllib 拉取 manifest（无 CORS），返回 {version, notes, assets} 或 None。 */
  check_update?(): Promise<Record<string, unknown> | null>;
  update_start?(urls: string[], sha256: string, size: number, name: string): Promise<{ jobId: string }>;
  update_status?(jobId: string): Promise<UpdateJobStatus>;
  update_apply?(jobId: string): Promise<{ ok: boolean; error?: string }>;
}

/** 获取 pywebview API 对象（无桥时返回 null）。 */
function getPywebviewApi(): PywebviewApi | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { pywebview?: { api?: Partial<PywebviewApi> } }).pywebview?.api;
  if (!api) return null;
  return api as PywebviewApi;
}

/** 获取支持一键更新（下载+替换）的 API 句柄（仅 Windows 桌面壳）。 */
export function getUpdaterApi(): Required<PywebviewApi> | null {
  const api = getPywebviewApi();
  if (!api?.update_start || !api.update_status || !api.update_apply) return null;
  return api as Required<PywebviewApi>;
}

/** 当前环境是否支持应用内一键更新（桌面壳 + 有当前平台资产）。 */
export function canSelfUpdate(asset: UpdateAsset | undefined): asset is UpdateAsset {
  return asset != null && getUpdaterApi() != null;
}

/**
 * 通过 Python 桥检查更新（排除 CORS 问题）。
 * 仅在 pywebview 桌面壳可用；浏览器/dev 返回 null。
 *
 * 返回的 UpdateInfo 带 asset（manifest 命中时），前端据此显示一键更新按钮。
 */
export async function checkForUpdateViaBridge(): Promise<UpdateInfo | null> {
  const api = getPywebviewApi();
  if (!api?.check_update) return null;
  try {
    const raw = await api.check_update();
    if (!raw || typeof raw.version !== "string") return null;
    const version = raw.version.replace(/^v/, "");
    if (!semverLess(APP_VERSION, version)) return null;
    const notes = typeof raw.notes === "string" ? raw.notes : undefined;
    // 解析资产：检查 assets.windows（桌面端只发 Windows）
    const assets = raw.assets as Record<string, unknown> | undefined;
    const winAsset = assets?.windows as Record<string, unknown> | undefined;
    const asset: UpdateAsset | undefined =
      winAsset && typeof winAsset.name === "string" && Array.isArray(winAsset.urls)
        ? {
            name: winAsset.name as string,
            size: typeof winAsset.size === "number" ? (winAsset.size as number) : 0,
            sha256: (typeof winAsset.sha256 === "string" ? (winAsset.sha256 as string) : "").toLowerCase(),
            urls: winAsset.urls as string[],
          }
        : undefined;
    return { latest: version, url: RELEASES_PAGE, notes, asset };
  } catch {
    return null;
  }
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
