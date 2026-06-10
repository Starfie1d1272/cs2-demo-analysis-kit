/**
 * .dem 直接导入：把原始 demo 交给 Python exporter 转成 v2 ZIP，
 * Studio 数据库里只存 ZIP（不落地 .dem，省空间）。
 *
 * 两种后端，自动探测：
 * - "pywebview"：打包版桌面壳（cs2dak-studio），经 JS bridge 调本机 exporter；
 * - "dev"：pnpm dev:studio 时的 Vite 中间件（POST /api/export-dem → uv run cs2dak export）。
 */

interface PywebviewStudioApi {
  pick_dems: () => Promise<string[]>;
  export_dem_path: (path: string) => Promise<
    { ok: true; fileName: string; dataBase64: string } | { ok: false; error: string }
  >;
  export_dem_bytes: (name: string, data_b64: string) => Promise<
    { ok: true; fileName: string; dataBase64: string } | { ok: false; error: string }
  >;
  /** 拖拽后按文件名解析本机路径（macOS WKWebView 下标准 drop 事件不走 pywebview DOM 系统） */
  get_drop_path?: (filename: string) => Promise<string | null>;
}

declare global {
  interface Window {
    pywebview?: { api: PywebviewStudioApi };
  }
}

export type DemBackend = "pywebview" | "dev" | null;

let devProbe: Promise<boolean> | null = null;

/**
 * Windows EdgeChromium：drop 事件使用标准浏览器 API（React onDrop），
 * 不经过 pywebview DOM 事件系统，因此 `_jsApiCallback` 的
 * `postMessageWithAdditionalObjects` 文件路径捕获不会触发。
 *
 * 在 drop 时调用此函数把 File 引用发送给 Python 的
 * `on_script_notify` → `_dnd_state['paths']`，
 * 后续 `get_drop_path` 即可按文件名解析本机路径。
 */
export function triggerWindowsDropCapture(files: FileList | File[]): void {
  try {
    if (
      typeof (window as any).chrome?.webview?.postMessageWithAdditionalObjects === "function"
    ) {
      (window as any).chrome.webview.postMessageWithAdditionalObjects("FilesDropped", files);
    }
  } catch {
    // best-effort: 路径捕获失败时回退到字节传输
  }
}

export async function detectDemBackend(): Promise<DemBackend> {
  if (typeof window.pywebview?.api?.export_dem_path === "function") return "pywebview";
  devProbe ??= fetch("/api/export-dem", { method: "GET" })
    .then((res) => res.ok)
    .catch(() => false);
  return (await devProbe) ? "dev" : null;
}

export function isDemFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".dem");
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** dev 模式：把 .dem 字节流交给 Vite 中间件，拿回导出的 ZIP。 */
async function exportViaDev(file: File): Promise<File> {
  // lastModified 透传给中间件：exporter 用 .dem 的 mtime 生成比赛日期前缀，
  // 字节流落盘会丢失原始时间，必须在服务端 utimes 还原。
  const res = await fetch(`/api/export-dem?name=${encodeURIComponent(file.name)}&mtime=${file.lastModified}`, {
    method: "POST",
    body: file
  });
  if (!res.ok) {
    throw new Error(`${file.name}: ${await res.text()}`);
  }
  const zipName = decodeURIComponent(res.headers.get("X-Zip-Name") ?? "") || file.name.replace(/\.dem$/i, ".zip");
  return new File([await res.blob()], zipName, { type: "application/zip" });
}

/** pywebview 模式：优先按路径导出；无路径时（如 Windows/macOS 拖入）调用 get_drop_path
 *  解析本机路径；再不行才走字节回退。前两级覆盖了绝大多数场景，
 *  字节回退仅当桌面壳版本过旧且不提供 get_drop_path 时触发。 */
async function exportViaPywebview(file: File): Promise<File> {
  const path = (file as File & { pywebviewFullPath?: string }).pywebviewFullPath;
  if (path) return exportPathViaPywebview(path, file.name);

  // 拖拽时 pywebviewFullPath 可能缺失（标准浏览器 drop 事件，非 pywebview DOM 系统），
  // 尝试通过 Python 端 _dnd_state 解析本机路径。
  const api = window.pywebview!.api;
  const resolvedPath = await api.get_drop_path?.(file.name);
  if (resolvedPath) return exportPathViaPywebview(resolvedPath, file.name);

  // 无文件系统路径：仅剩字节传输。走到这里说明桌面壳版本过旧
  // （不提供 get_drop_path），或文件来自浏览器 <input type="file">
  // 而非拖拽/原生对话框——此时建议用户使用「导入 .dem」按钮。
  if (typeof api.export_dem_bytes !== "function") {
    throw new Error(
      `${file.name}: 桌面壳版本过旧，不支持字节导入，请点右上角「导入 .dem」使用对话框`
    );
  }
  const buf = await file.arrayBuffer();
  const dataB64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const result = await api.export_dem_bytes(file.name, dataB64);
  if (!result.ok) throw new Error(`${file.name}: ${result.error}`);
  return new File([base64ToBytes(result.dataBase64) as BlobPart], result.fileName, { type: "application/zip" });
}

async function exportPathViaPywebview(path: string, displayName: string): Promise<File> {
  const result = await window.pywebview!.api.export_dem_path(path);
  if (!result.ok) {
    throw new Error(`${displayName}: ${result.error}`);
  }
  return new File([base64ToBytes(result.dataBase64) as BlobPart], result.fileName, { type: "application/zip" });
}

/** 把单个 .dem 转成 v2 ZIP File；onProgress 用于界面提示。 */
export async function exportDemToZip(file: File, backend: DemBackend): Promise<File> {
  if (backend === "dev") return exportViaDev(file);
  if (backend === "pywebview") return exportViaPywebview(file);
  throw new Error(`${file.name}: 当前环境不支持 .dem 直接导入（开发模式跑 pnpm dev:studio，或使用打包版桌面应用）`);
}

/** pywebview 原生文件对话框：选多个 .dem/.zip 并逐个导出。paths 为空时 cancelled 为 true。 */
export async function pickAndExportDems(onProgress: (message: string) => void): Promise<{ files: File[]; errors: string[]; cancelled: boolean }> {
  const api = window.pywebview?.api;
  if (!api) return { files: [], errors: ["桌面壳不可用"], cancelled: false };
  const paths = await api.pick_dems();
  if (paths.length === 0) return { files: [], errors: [], cancelled: true };
  const files: File[] = [];
  const errors: string[] = [];
  for (const path of paths) {
    const name = path.split(/[\\/]/).pop() ?? path;
    onProgress(`正在导出 ${name}…（${files.length + errors.length + 1}/${paths.length}）`);
    try {
      files.push(await exportPathViaPywebview(path, name));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { files, errors, cancelled: false };
}
