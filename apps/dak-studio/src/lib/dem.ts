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
}

declare global {
  interface Window {
    pywebview?: { api: PywebviewStudioApi };
  }
}

export type DemBackend = "pywebview" | "dev" | null;

let devProbe: Promise<boolean> | null = null;

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

/** pywebview 模式：拖入的 File 带 pywebviewFullPath，按路径走本机导出。 */
async function exportViaPywebview(file: File): Promise<File> {
  const path = (file as File & { pywebviewFullPath?: string }).pywebviewFullPath;
  if (!path) {
    throw new Error(`${file.name}: 桌面版请通过「导入」按钮选择 .dem 文件`);
  }
  return exportPathViaPywebview(path, file.name);
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

/** pywebview 原生文件对话框：选多个 .dem 并逐个导出。 */
export async function pickAndExportDems(onProgress: (message: string) => void): Promise<{ files: File[]; errors: string[] }> {
  const api = window.pywebview?.api;
  if (!api) return { files: [], errors: ["桌面壳不可用"] };
  const paths = await api.pick_dems();
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
  return { files, errors };
}
