/**
 * Asset health bridge — 与 Python StudioApi.check_assets / repair_assets 对应的前端薄层。
 *
 * 模式参考 tri-assets.ts：仅封装 bridge 发现 + 调用，不包含 UI 状态。
 * AssetHealthBanner（自动提醒）和 AssetsPanel（手动管理）共用。
 */

import { useEffect, useState } from "react";

export interface AssetStatus {
  status: "ok" | "not_installed" | "incomplete" | "corrupt";
  noManifest?: boolean;
  /** 清单来源："local"（已写入本地）| "remote"（R2 拉取）| "none"（不可用） */
  manifestSource?: string;
  checkedAt?: string;
  assetSet?: string;
  /** 官方资产集定义的完整 bundled event slug 列表（非仅缺失项） */
  bundledEventSlugs?: string[];
  /** 官方资产集定义的完整 required tri map 列表（非仅缺失项） */
  requiredTriMaps?: string[];
  missingEvents?: Array<{ slug: string; name: string; reason: string }>;
  missingTris?: Array<{ mapName: string; requiredBy: string[]; reason: string }>;
  canRepair?: boolean;
}

export type RepairJob = {
  state: string;
  progress: number;
  current: number;
  total: number;
  errors: string[];
};

export interface NativeAssetApi {
  check_assets(deep?: boolean): Promise<AssetStatus>;
  repair_assets(items: Array<{ type: string; slug?: string; mapName?: string }>): Promise<string>;
  asset_repair_status(jobId: string): Promise<RepairJob | null>;
}

/** 仅 pywebview 桌面环境可用（同步检查，可能 bridge 尚未 ready）。 */
export function supportsAssetHealth(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = typeof window === "undefined" ? undefined : (window as any).pywebview?.api;
  return typeof api?.check_assets === "function";
}

/**
 * 轮询等待 pywebview bridge 就绪。
 * 首次 render 时 supportsAssetHealth() 可能返回 false（bridge 尚未注入），
 * 直接同步检查会导致 AssetHealthBanner 和 AssetsPanel 永远不加载官方资产 UI。
 * 此 hook 在不可用时每 250ms 重试，最多 40 次（10s），就绪后返回 true。
 */
export function useAssetHealthAvailable(): boolean {
  const [available, setAvailable] = useState(() => supportsAssetHealth());
  useEffect(() => {
    if (available) return;
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      if (supportsAssetHealth()) {
        setAvailable(true);
        return;
      }
      tries += 1;
      if (tries < 40) setTimeout(tick, 250);
    };
    tick();
    return () => { cancelled = true; };
  }, [available]);
  return available;
}

function getApi(): NativeAssetApi | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = typeof window === "undefined" ? undefined : (window as any).pywebview?.api;
  return api?.check_assets ? (api as NativeAssetApi) : null;
}

/** 轻检查（存在 + size，不 hash）。 */
export async function checkAssets(deep = false): Promise<AssetStatus | null> {
  const api = getApi();
  if (!api) return null;
  try {
    return await api.check_assets(deep);
  } catch {
    return null;
  }
}

/** 批量修复 + 自动轮询。返回最终 job 或 null。onTick 每 800ms 回调进度。 */
export async function repairAssets(
  items: Array<{ type: "event" | "tri"; slug?: string; mapName?: string }>,
  onTick?: (job: RepairJob) => void,
): Promise<RepairJob | null> {
  const api = getApi();
  if (!api || items.length === 0) return null;
  const jobId = await api.repair_assets(items);
  return new Promise((resolve) => {
    const poll = setInterval(async () => {
      try {
        const job = await api.asset_repair_status(jobId);
        if (!job) { clearInterval(poll); resolve(null); return; }
        onTick?.(job);
        if (job.state === "done" || job.state === "error") {
          clearInterval(poll);
          resolve(job);
        }
      } catch {
        clearInterval(poll);
        resolve(null);
      }
    }, 800);
  });
}
