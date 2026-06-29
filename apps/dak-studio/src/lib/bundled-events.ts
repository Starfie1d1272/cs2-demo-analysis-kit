/**
 * bundled-events 发现层。
 *
 * 0.7.0 起，Stage3/Playoff 等大赛事包不再打进 Vite bundle（Vite ?url import），
 * 改由 installer 预装到 assets/bundled-events/，Python 静态服务通过
 * /bundled-events/ overlay 提供。前端通过本模块发现并加载本地预装赛事。
 *
 * CORS-proof：JS 一律走相对路径 `./bundled-events/<slug>.zip`（同源），绝不直连 R2。
 * - 桌面（pywebview）：Python 桥 `bundled_events_manifest()` 返回已安装赛事清单；
 *   zip 由静态服务 overlay 提供。
 * - dev（pnpm dev:studio）：不存在 bundled-events overlay（返回 null），
 *   赛事仅来自 BUILTIN_EVENTS（sample）+ R2 在线清单。
 */

import type { EventsManifest } from "@cs2dak/contract";

interface NativeBundledEventsApi {
  bundled_events_manifest(): Promise<Record<string, unknown> | null>;
  bundled_events_list(): Promise<Array<{ slug: string; name: string; size: number }>>;
}

function nativeApi(): NativeBundledEventsApi | null {
  const api =
    typeof window === "undefined"
      ? undefined
      : (window as unknown as { pywebview?: { api?: Partial<NativeBundledEventsApi> } }).pywebview?.api;
  return api?.bundled_events_manifest ? (api as NativeBundledEventsApi) : null;
}

/** 桌面 pywebview 环境是否支持 bundled events 发现。 */
export function supportsBundledEvents(): boolean {
  return nativeApi() != null;
}

/**
 * 加载本地预装赛事清单。
 * 桌面：走 bridge `bundled_events_manifest()`；
 * dev/浏览器：fetch `./bundled-events/manifest.json`（同源，通常 404 → null）。
 * 返回 null 表示无预装赛事（不是错误）。
 */
export async function loadBundledEventsManifest(): Promise<EventsManifest | null> {
  const api = nativeApi();
  if (api) {
    try {
      const raw = await api.bundled_events_manifest();
      if (raw && typeof raw === "object" && Array.isArray(raw.events)) {
        return raw as unknown as EventsManifest;
      }
      return null;
    } catch {
      // 桥失败时退回 fetch
    }
  }
  try {
    const response = await fetch("./bundled-events/manifest.json", { cache: "no-cache" });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) return null;
    return (await response.json()) as EventsManifest;
  } catch {
    return null;
  }
}

/**
 * 返回已安装的 bundled event slug 列表（轻量，不拉完整 manifest）。
 * 桌面走 bridge；dev/浏览器返回空数组。
 */
export async function listBundledEventSlugs(): Promise<string[]> {
  const api = nativeApi();
  if (api) {
    try {
      const items = await api.bundled_events_list();
      return items.map((e) => e.slug);
    } catch {
      return [];
    }
  }
  return [];
}
