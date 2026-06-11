/**
 * .dem 直接导入：把原始 demo 交给 Python exporter 转成 v2 ZIP，
 * Studio 数据库里只存 ZIP（不落地 .dem，省空间）。
 *
 * 两种后端，自动探测：
 * - "pywebview"：打包版桌面壳（cs2dak-studio），经 JS bridge 调本机 exporter；
 * - "dev"：pnpm dev:studio 时的 Vite 中间件（POST /api/export-dem → uv run cs2dak export）。
 */

interface ExportJobStatus {
  id: string;
  state: "running" | "done" | "error";
  stage: string;
  progress: number;
  elapsedSeconds: number;
  error: string | null;
  fileName: string | null;
  resultSize: number;
}

interface PywebviewStudioApi {
  pick_dems: () => Promise<string[]>;
  path_exists?: (path: string) => Promise<boolean>;
  export_dem_path: (path: string) => Promise<
    { ok: true; fileName: string; dataBase64: string } | { ok: false; error: string }
  >;
  export_dem_bytes: (name: string, data_b64: string) => Promise<
    { ok: true; fileName: string; dataBase64: string } | { ok: false; error: string }
  >;
  /** 拖拽后按文件名解析本机路径（macOS WKWebView 下标准 drop 事件不走 pywebview DOM 系统） */
  get_drop_path?: (filename: string) => Promise<string | null>;
  /** 0.3.0+：异步导出任务（后台线程解析 + 小负载状态轮询 + 分块取回 ZIP），
   *  避免单条 bridge 调用长时间阻塞或回传超大 payload 导致 promise 永不 resolve。 */
  start_export_job?: (path: string) => Promise<{ jobId: string }>;
  get_export_status?: (jobId: string) => Promise<ExportJobStatus>;
  get_export_result_chunk?: (jobId: string, offset: number, size: number) => Promise<
    { ok: true; data: string; done: boolean } | { ok: false; error: string }
  >;
}

declare global {
  interface Window {
    pywebview?: { api: PywebviewStudioApi };
  }
}

export type DemBackend = "pywebview" | "dev" | null;

export interface ExportedDemoFile {
  file: File;
  sourceDemPath?: string | null;
}

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
async function exportViaPywebview(file: File, onProgress?: (message: string) => void): Promise<ExportedDemoFile> {
  const path = (file as File & { pywebviewFullPath?: string }).pywebviewFullPath;
  if (path) return { file: await exportPathViaPywebview(path, file.name, onProgress), sourceDemPath: path };

  // 拖拽时 pywebviewFullPath 可能缺失（标准浏览器 drop 事件，非 pywebview DOM 系统），
  // 尝试通过 Python 端 _dnd_state 解析本机路径。
  const api = window.pywebview!.api;
  const resolvedPath = await api.get_drop_path?.(file.name);
  if (resolvedPath) return { file: await exportPathViaPywebview(resolvedPath, file.name, onProgress), sourceDemPath: resolvedPath };

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
  return {
    file: new File([base64ToBytes(result.dataBase64) as BlobPart], result.fileName, { type: "application/zip" }),
    sourceDemPath: null
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 每条 bridge 消息的 base64 上限（~512KB），保证回传不随 ZIP 大小膨胀。 */
const RESULT_CHUNK_SIZE = 512 * 1024;

function formatEta(status: ExportJobStatus): string {
  if (status.progress < 0.03) return "";
  const remain = (status.elapsedSeconds / status.progress) * (1 - status.progress);
  return remain > 1 ? `，预计还需 ${Math.ceil(remain)}s` : "";
}

/** 异步任务后端：启动 → 轮询状态（驱动进度提示）→ 分块取回 ZIP。 */
async function exportPathViaJob(
  path: string,
  displayName: string,
  onProgress?: (message: string) => void
): Promise<File> {
  const api = window.pywebview!.api;
  const { jobId } = await api.start_export_job!(path);
  for (;;) {
    const status = await api.get_export_status!(jobId);
    if (status.state === "error") throw new Error(`${displayName}: ${status.error ?? "导出失败"}`);
    if (status.state === "done") break;
    onProgress?.(
      `${displayName}：${status.stage} ${Math.round(status.progress * 100)}%（已用 ${Math.round(status.elapsedSeconds)}s${formatEta(status)}）`
    );
    await sleep(500);
  }
  const final = await api.get_export_status!(jobId);
  onProgress?.(`${displayName}：传输结果…`);
  let b64 = "";
  for (let offset = 0; ; offset += RESULT_CHUNK_SIZE) {
    const chunk = await api.get_export_result_chunk!(jobId, offset, RESULT_CHUNK_SIZE);
    if (!chunk.ok) throw new Error(`${displayName}: ${chunk.error}`);
    b64 += chunk.data;
    if (chunk.done) break;
  }
  return new File([base64ToBytes(b64) as BlobPart], final.fileName ?? displayName.replace(/\.dem$/i, ".zip"), {
    type: "application/zip"
  });
}

async function exportPathViaPywebview(
  path: string,
  displayName: string,
  onProgress?: (message: string) => void
): Promise<File> {
  const api = window.pywebview!.api;
  // 0.3.0+ 桌面壳：异步任务 + 进度轮询；旧壳回退同步调用
  if (typeof api.start_export_job === "function") {
    return exportPathViaJob(path, displayName, onProgress);
  }
  const result = await api.export_dem_path(path);
  if (!result.ok) {
    throw new Error(`${displayName}: ${result.error}`);
  }
  return new File([base64ToBytes(result.dataBase64) as BlobPart], result.fileName, { type: "application/zip" });
}

/** 把单个 .dem 转成 v2 ZIP File；onProgress 用于界面提示。 */
export async function exportDemToZip(
  file: File,
  backend: DemBackend,
  onProgress?: (message: string) => void
): Promise<ExportedDemoFile> {
  if (backend === "dev") return { file: await exportViaDev(file), sourceDemPath: null };
  if (backend === "pywebview") return exportViaPywebview(file, onProgress);
  throw new Error(`${file.name}: 当前环境不支持 .dem 直接导入（开发模式跑 pnpm dev:studio，或使用打包版桌面应用）`);
}

/** pywebview 原生文件对话框：选多个 .dem/.zip 并逐个导出。paths 为空时 cancelled 为 true。 */
export async function pickAndExportDems(onProgress: (message: string) => void): Promise<{ files: ExportedDemoFile[]; errors: string[]; cancelled: boolean }> {
  const api = window.pywebview?.api;
  if (!api) return { files: [], errors: ["桌面壳不可用"], cancelled: false };
  const paths = await api.pick_dems();
  if (paths.length === 0) return { files: [], errors: [], cancelled: true };
  const files: ExportedDemoFile[] = [];
  const errors: string[] = [];
  for (const path of paths) {
    const name = path.split(/[\\/]/).pop() ?? path;
    const prefix = `（${files.length + errors.length + 1}/${paths.length}）`;
    onProgress(`正在导出 ${name}…${prefix}`);
    try {
      files.push({ file: await exportPathViaPywebview(path, name, (msg) => onProgress(`${prefix}${msg}`)), sourceDemPath: path });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { files, errors, cancelled: false };
}
