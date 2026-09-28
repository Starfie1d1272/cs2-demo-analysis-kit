import { createRivalHubClient, RivalHubHttpError } from "@cs2dak/rivalhub-upload";
export interface DemoFile { id: string; name: string }
export interface Connection { baseUrl: string; connected: boolean; pairingId?: string }
export interface NativeApi {
  connection(): Promise<Connection>;
  configure(baseUrl: string): Promise<boolean>;
  save_connection(pairingId: string, token: string): Promise<boolean>;
  open_website(url?: string): Promise<boolean>;
  request(path: string, method: string, body?: unknown, key?: string): Promise<{ status: number; body: unknown }>;
  select_demos(): Promise<DemoFile[]>;
  hash_demo(id: string): Promise<string>;
  start_export(id: string): Promise<boolean>;
  export_status(id: string): Promise<{ state: string; progress: number; stage: string; size?: number; error?: string }>;
  read_chunk(id: string, offset: number): Promise<string>;
  cleanup(id: string): Promise<boolean>;
  record(id: string, phase: string, code?: string): Promise<boolean>;
  export_logs(): Promise<boolean>;
}
declare global { interface Window { pywebview?: { api: NativeApi } } }
export function native(): NativeApi {
  if (!window.pywebview?.api) throw new Error("DESKTOP_REQUIRED：请使用桌面程序选择 Demo；当前是界面预览");
  return window.pywebview.api;
}
export const client = createRivalHubClient(async <T,>(path: string, method: "GET" | "POST", body?: unknown, key?: string): Promise<T> => {
  const result = await native().request(path, method, body ?? null, key);
  if (result.status < 200 || result.status >= 300) {
    const error = result.body as { error?: { message?: string } };
    throw new RivalHubHttpError(result.status, error?.error?.message ?? `HTTP ${result.status}`);
  }
  return result.body as T;
});
export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export async function exportZip(id: string, progress: (message: string) => void): Promise<Uint8Array> {
  await native().start_export(id);
  for (;;) {
    const status = await native().export_status(id);
    if (status.state === "error") throw new Error(status.error ?? "PARSE_FAILED：解析失败");
    if (status.state === "done") {
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
    progress(`正在解析 · ${Math.round(Math.max(0, Math.min(1, status.progress)) * 100)}% · 大文件请耐心等待`);
    await delay(500);
  }
}
