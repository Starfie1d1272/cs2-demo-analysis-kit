import { ExportPolling, sanitizeDiagnosticText, createRivalHubClient, httpErrorFromResponse, normalizeDiagnostic, type SafeDiagnostic } from "@cs2dak/rivalhub-upload";
export interface DemoFile { id: string; name: string }
export interface Connection { baseUrl: string; connected: boolean; pairingId?: string }
export interface NativeApi {
  connection(): Promise<Connection>;
  configure(baseUrl: string, cancelPairingId?: string): Promise<boolean>;
  save_connection(pairingId: string, token: string, baseUrl?: string): Promise<boolean>;
  open_website(url?: string): Promise<boolean>;
  request(path: string, method: string, body?: unknown, key?: string): Promise<{ status: number; body: unknown; requestId?: string; diagnostic?: SafeDiagnostic }>;
  select_demos(): Promise<DemoFile[]>;
  hash_demo(id: string): Promise<string>;
  start_export(id: string): Promise<boolean>;
  export_status(id: string): Promise<{ state: string; progress: number; stage: string; size?: number; error?: string; diagnostic?: SafeDiagnostic }>;
  read_chunk(id: string, offset: number): Promise<string>;
  cleanup(id: string): Promise<boolean>;
  record(id: string, phase: string, code?: string, diagnostic?: SafeDiagnostic): Promise<boolean>;
  export_logs(): Promise<boolean>;
  report_ui_error(message: string, stack?: string, diagnostic?: SafeDiagnostic): Promise<boolean>;
}
declare global { interface Window { pywebview?: { api: NativeApi } } }
const nativeMethods: (keyof NativeApi)[] = [
  "connection", "configure", "save_connection", "open_website", "request", "select_demos",
  "hash_demo", "start_export", "export_status", "read_chunk", "cleanup", "record",
  "export_logs", "report_ui_error",
];
export function nativeApiReady(api: Partial<NativeApi> | undefined): api is NativeApi {
  return nativeMethods.every(method => typeof api?.[method] === "function");
}
export function initializeNativeApiOnce(
  api: Partial<NativeApi> | undefined,
  initialized: { current: boolean },
  onReady: (api: NativeApi) => void,
): boolean {
  if (!nativeApiReady(api) || initialized.current) return false;
  initialized.current = true;
  onReady(api);
  return true;
}
export function native(): NativeApi {
  if (!nativeApiReady(window.pywebview?.api)) throw new Error("DESKTOP_REQUIRED：桌面桥接尚未就绪，请稍候或重启程序");
  return window.pywebview.api;
}
/** Best-effort logging must never throw back into UI or replace a task outcome. */
export async function logDiagnostic(error: unknown): Promise<void> {
  const diagnostic = normalizeDiagnostic(error);
  try {
    if (await native().report_ui_error(diagnostic.message, "", diagnostic)) return;
  } catch { /* The final fallback does not call the bridge again. */ }
  try { console.error("Uploader diagnostic", diagnostic); }
  catch { /* No remaining diagnostic sink; never recurse. */ }
}
export async function recordDiagnostic(id: string, phase: string, diagnostic: SafeDiagnostic): Promise<void> {
  const safe = normalizeDiagnostic(diagnostic);
  try {
    if (await native().record(id, phase, safe.code, safe)) return;
    throw new Error("DIAGNOSTIC_RECORD_FAILED：诊断记录未保存");
  } catch (error) {
    await logDiagnostic(safe);
    await logDiagnostic(normalizeDiagnostic(error, { stage: "record", fileId: id, attempt: safe.attempt }));
  }
}
export const client = createRivalHubClient(async <T,>(path: string, method: "GET" | "POST", body?: unknown, key?: string): Promise<T> => {
  const result = await native().request(path, method, body ?? null, key);
  const error = result.body as { error?: { code?: string } } | null;
  if (result.status < 200 || result.status >= 300 || error?.error?.code === "INVALID_RESPONSE") {
    const failure = httpErrorFromResponse(result.status, result.body, result.requestId);
    const cause = normalizeDiagnostic(result.diagnostic).cause;
    if (cause) failure.cause = cause;
    throw failure;
  }
  return result.body as T;
});
export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const exportPolling = new ExportPolling();
export async function exportZip(id: string, progress: (message: string) => void): Promise<Uint8Array> {
  await native().start_export(id);
  const status = await exportPolling.wait(id, () => native().export_status(id), status => {
    progress(`正在解析 · ${Math.round(status.progress * 100)}% · ${sanitizeDiagnosticText(status.stage)} · 大文件请耐心等待`);
  });
  const data = new Uint8Array(status.size!);
  let offset = 0;
  while (offset < data.length) {
    const chunk = atob(await native().read_chunk(id, offset));
    if (!chunk.length) throw new Error("EXPORT_READ：读取解析结果中断，请重试");
    data.set(Uint8Array.from(chunk, char => char.charCodeAt(0)), offset);
    offset += chunk.length;
  }
  return data;
}
