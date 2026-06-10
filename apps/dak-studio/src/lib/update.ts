/**
 * 启动时检查 GitHub Release 是否有新版本。
 * 桌面应用版本随 vX.Y.Z tag；网络失败 / API 限流时静默返回 null，不打扰使用。
 */

declare const __APP_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;

const RELEASES_LATEST_API = "https://api.github.com/repos/Starfie1d1272/cs2-demo-analysis-kit/releases/latest";
export const RELEASES_PAGE = "https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/latest";

export interface UpdateInfo {
  latest: string;
  url: string;
}

/** a < b 时返回 true（仅比较 X.Y.Z 数字段，预发布后缀忽略） */
function semverLess(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(RELEASES_LATEST_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latest = (data.tag_name ?? "").replace(/^v/, "");
    if (!latest || !semverLess(APP_VERSION, latest)) return null;
    return { latest, url: data.html_url ?? RELEASES_PAGE };
  } catch {
    return null;
  }
}
