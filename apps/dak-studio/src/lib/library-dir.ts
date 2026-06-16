/**
 * 桌面壳（pywebview）下「用户数据目录」桥：显示路径 + 在系统文件管理器打开。
 * 数据目录含资料库 SQLite、demo blobs、缓存、日志与 `.tri` overlay，
 * 暴露它让用户能手动备份与排错。浏览器/开发环境无本地目录概念，桥返回 null。
 *
 * 真正的打开动作在 Python 侧（studio.py 的 StudioApi.open_userdata_dir）。
 */

interface LibraryDirApi {
  userdata_dir(): Promise<string>;
  open_userdata_dir(): Promise<{ ok: boolean; error?: string; path?: string }>;
}

function getLibraryDirApi(): LibraryDirApi | null {
  const api =
    typeof window === "undefined"
      ? undefined
      : (window as unknown as { pywebview?: { api?: Partial<LibraryDirApi> } }).pywebview?.api;
  if (!api?.userdata_dir || !api.open_userdata_dir) return null;
  return api as LibraryDirApi;
}

/** 当前是否为桌面壳（能打开本地数据目录）。浏览器返回 false。 */
export function canOpenLibraryDir(): boolean {
  return getLibraryDirApi() != null;
}

/** 在系统文件管理器中打开数据目录。 */
export async function openLibraryDir(): Promise<{ ok: boolean; error?: string }> {
  const api = getLibraryDirApi();
  if (!api) return { ok: false, error: "当前环境不支持打开本地目录" };
  return api.open_userdata_dir();
}

/** 数据目录绝对路径（用于 tooltip 展示）；无桥时 null。 */
export async function getLibraryDir(): Promise<string | null> {
  const api = getLibraryDirApi();
  if (!api) return null;
  try {
    return await api.userdata_dir();
  } catch {
    return null;
  }
}
