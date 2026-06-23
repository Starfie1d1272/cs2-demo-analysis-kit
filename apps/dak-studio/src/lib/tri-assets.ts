import { installTriBuffer, listInstalledTris } from "./tri";

/**
 * .tri 资产的清单与按需补全。
 *
 * CORS-proof：JS 一律走相对路径 `./tris/<map>.tri`（同源），绝不直连 R2——
 * 该域未配 `Access-Control-Allow-Origin`，浏览器直连会被拦截。两端各自把相对路径落到能下载的地方：
 * - 桌面（pywebview）：Python 静态服务拦截 `/tris/<map>.tri`，缺失时按 tris-manifest 下到
 *   userdata/tris overlay 再回传；已装检测走 `tri_present`（overlay + 内置，权威）。
 * - dev（pnpm dev:studio）：Vite 中间件 `trisProxyPlugin` 服务端代理 R2；已装检测走 IDB。
 * 取回的字节同时写入 IndexedDB（installTriBuffer），作为浏览器端的持久缓存。
 */

export interface TriManifestEntry {
  name: string;
  size: number;
  sha256: string;
  urls: string[];
}

export interface TrisManifest {
  generatedAt?: string;
  maps: Record<string, TriManifestEntry>;
}

interface NativeTriApi {
  tri_present(): Promise<string[]>;
}

function nativeTriApi(): NativeTriApi | null {
  const api = typeof window === "undefined"
    ? undefined
    : (window as unknown as { pywebview?: { api?: Partial<NativeTriApi> } }).pywebview?.api;
  return api?.tri_present ? (api as NativeTriApi) : null;
}

export function supportsNativeTri(): boolean {
  return nativeTriApi() != null;
}

/** 已装的 .tri 地图名：桌面读 overlay+内置（权威），否则读 IDB blob。 */
export async function listAvailableTris(): Promise<string[]> {
  const api = nativeTriApi();
  if (api) {
    try {
      return (await api.tri_present()).sort();
    } catch {
      // 桥失败时退回 IDB
    }
  }
  return listInstalledTris();
}

/** 清单仅用于显示尺寸（best-effort）：dev 经 Vite 代理可达；桌面/静态托管不一定有，失败返回 null。 */
export async function loadTrisManifest(): Promise<TrisManifest | null> {
  try {
    const response = await fetch("./tris/manifest.json", { cache: "no-cache" });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) return null; // dev 缺失时可能回退 index.html
    return (await response.json()) as TrisManifest;
  } catch {
    return null;
  }
}

/**
 * 按需补全单张 .tri（CORS-proof，相对路径）。
 * 桌面端 fetch 触发 Python 按需下载到 overlay；dev 经 Vite 代理 R2。
 * 浏览器/dev 把取回字节写入 IDB，使下次分析与已装检测命中。
 */
export async function downloadTri(mapName: string): Promise<void> {
  const response = await fetch(`./tris/${mapName}.tri`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) throw new Error("资源不可达（无在线源或离线）");
  const buffer = await response.arrayBuffer();
  // 桌面端已落 overlay（tri_present 可见），IDB 写入对其只是冗余缓存；浏览器/dev 必须写 IDB。
  if (!supportsNativeTri() && !(await installTriBuffer(mapName, buffer))) {
    throw new Error(".tri 字节非法");
  }
}
