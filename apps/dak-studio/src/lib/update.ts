/**
 * 启动时检查是否有新版本。
 *
 * 设计要点（面向国内连通性）：
 * - **manifest 驱动**：先拉一份极小的 `latest.json`（发版时作为 GitHub Release 资产，
 *   挂在稳定地址 `releases/latest/download/latest.json`），不再依赖 `api.github.com`
 *   （国内常被墙/限流）。
 * - **镜像失败转移**：manifest 与二进制都带一串镜像 URL，按顺序尝试，超时即切下一个。
 *   镜像清单写在 manifest 里（二进制），客户端只内置一份 bootstrap 列表（manifest 本身），
 *   这样 ghproxy 类代理域名失效时不必发新版即可轮换。
 * - **降级**：全部失败 / API 限流时静默返回 null，不打扰使用；并保留对 GitHub API 的
 *   最后兜底，老发布（无 manifest）仍能给出“去下载”链接。
 *
 * 桌面壳（pywebview）里 `window.pywebview.api.*` 提供真正的下载+校验+替换；
 * 本模块只负责“检查”，把可下载的资产信息交给上层触发一键更新。
 */

declare const __APP_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;

const OWNER_REPO = "Starfie1d1272/cs2-demo-analysis-kit";
export const RELEASES_PAGE = `https://github.com/${OWNER_REPO}/releases/latest`;
const RELEASES_LATEST_API = `https://api.github.com/repos/${OWNER_REPO}/releases/latest`;

/** manifest 稳定地址（指向最新 Release 的 latest.json 资产）。 */
const MANIFEST_CANONICAL = `https://github.com/${OWNER_REPO}/releases/latest/download/latest.json`;

/**
 * 镜像前缀：拼到 github.com 原始 URL 前形成代理 URL。
 * ⚠️ ghproxy 类公共代理域名经常更替/失效——这是一份兜底 bootstrap，
 * 真正长期可靠的镜像应由你填入自建 CDN/对象存储（见 docs/design/auto-update.md）。
 * 顺序即优先级；空串代表直连 github.com。
 */
export const MANIFEST_MIRRORS: readonly string[] = [
  "", // 直连（海外/能直连的网络）
  "https://ghfast.top/",
  "https://gh-proxy.com/",
  "https://ghproxy.net/"
];

/** 单个镜像 fetch 的超时（ms）。 */
const FETCH_TIMEOUT_MS = 8000;

export interface UpdateAsset {
  /** 文件名，如 dak-studio-windows-0.7.0.zip */
  name: string;
  /** 字节数（用于进度条与完整性粗校验）。 */
  size: number;
  /** 小写 hex sha256，下载后必须校验。 */
  sha256: string;
  /** 按优先级排列的下载 URL（含直连 + 各镜像）。 */
  urls: string[];
}

export interface UpdateManifest {
  /** X.Y.Z */
  version: string;
  notes?: string;
  publishedAt?: string;
  /** 平台 → 资产。当前只发 Windows。 */
  assets: Partial<Record<"windows" | "macos", UpdateAsset>>;
}

export interface UpdateInfo {
  latest: string;
  /** Release 页面（供“查看详情/手动下载”兜底）。 */
  url: string;
  notes?: string;
  /** 可一键更新的资产（manifest 命中且当前平台有资产时存在）。 */
  asset?: UpdateAsset;
}

/** a < b 时返回 true（仅比较 X.Y.Z 数字段，预发布后缀忽略）。 */
export function semverLess(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}

/** 把 github.com 原始 URL 套上镜像前缀。空前缀即直连。 */
export function withMirror(prefix: string, rawUrl: string): string {
  if (!prefix) return rawUrl;
  return prefix.endsWith("/") ? prefix + rawUrl : `${prefix}/${rawUrl}`;
}

/** 解析 + 最小校验 manifest；结构不符返回 null。 */
export function parseManifest(raw: unknown): UpdateManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const version = typeof m.version === "string" ? m.version.replace(/^v/, "") : "";
  if (!/^\d+\.\d+\.\d+/.test(version)) return null;
  const assetsRaw = (m.assets ?? {}) as Record<string, unknown>;
  const assets: UpdateManifest["assets"] = {};
  for (const key of ["windows", "macos"] as const) {
    const a = assetsRaw[key] as Record<string, unknown> | undefined;
    if (
      a &&
      typeof a.name === "string" &&
      typeof a.sha256 === "string" &&
      Array.isArray(a.urls) &&
      a.urls.every((u) => typeof u === "string")
    ) {
      assets[key] = {
        name: a.name,
        size: typeof a.size === "number" ? a.size : 0,
        sha256: a.sha256.toLowerCase(),
        urls: a.urls as string[]
      };
    }
  }
  return {
    version,
    notes: typeof m.notes === "string" ? m.notes : undefined,
    publishedAt: typeof m.publishedAt === "string" ? m.publishedAt : undefined,
    assets
  };
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 依次尝试各镜像拉取并解析 manifest，第一份成功的即返回。 */
async function fetchManifest(): Promise<UpdateManifest | null> {
  for (const prefix of MANIFEST_MIRRORS) {
    const raw = await fetchJson(withMirror(prefix, MANIFEST_CANONICAL));
    const manifest = parseManifest(raw);
    if (manifest) return manifest;
  }
  return null;
}

/** 当前平台对应的资产 key。桌面壳目前只发 Windows。 */
function currentPlatform(): "windows" | "macos" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return null;
}

/** GitHub API 兜底：老发布无 manifest 时仍给出可点的下载链接（无一键更新资产）。 */
async function checkViaGitHubApi(): Promise<UpdateInfo | null> {
  const raw = await fetchJson(RELEASES_LATEST_API);
  if (!raw || typeof raw !== "object") return null;
  const data = raw as { tag_name?: string; html_url?: string; body?: string };
  const latest = (data.tag_name ?? "").replace(/^v/, "");
  if (!latest || !semverLess(APP_VERSION, latest)) return null;
  return { latest, url: data.html_url ?? RELEASES_PAGE, notes: data.body };
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const manifest = await fetchManifest();
  if (manifest) {
    if (!semverLess(APP_VERSION, manifest.version)) return null;
    const platform = currentPlatform();
    const asset = platform ? manifest.assets[platform] : undefined;
    return { latest: manifest.version, url: RELEASES_PAGE, notes: manifest.notes, asset };
  }
  // 所有镜像都失败 → 退回 GitHub API（直连成功的网络仍可用）。
  return checkViaGitHubApi();
}
