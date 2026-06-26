import JSZip from "jszip";
import { eventPackageSchema, eventsManifestSchema, type EventsManifest } from "@cs2dak/contract";
import { importDemoFile, type StudioDemoEntry } from "./library";
import { importEventPackage, type EventImportResult } from "./events";
import { base64ToBytes } from "./storage/base64";

export const EVENTS_MANIFEST_URL = "https://dakupdate.starfie1d.top/events/manifest.json";

export interface EventAssetImportResult {
  event: EventImportResult;
  entries: StudioDemoEntry[];
  errors: string[];
  cancelled: boolean;
}

export interface EventImportProgress {
  onProgress?: (message: string) => void;
  isCancelled?: () => boolean;
}

interface NativeEventApi {
  events_manifest?(): Promise<unknown>;
  event_package_pick(): Promise<{ ok: boolean; cancelled?: boolean; error?: string; sessionId?: string; eventPackage?: unknown; maps?: Array<{ name: string; size: number }> }>;
  event_package_map_chunk(sessionId: string, member: string, offset: number, size: number): Promise<{ ok: boolean; data?: string; done?: boolean; error?: string }>;
  event_package_close(sessionId: string): Promise<void>;
  event_download_start?(urls: string[], sha256: string, size: number, slug: string): Promise<{ jobId: string }>;
  event_download_status?(jobId: string): Promise<{ state: string; stage?: string; progress?: number; error?: string }>;
  event_download_open?(jobId: string): Promise<{ ok: boolean; error?: string; sessionId?: string; eventPackage?: unknown; maps?: Array<{ name: string; size: number }> }>;
  event_download_cancel?(jobId: string): Promise<void>;
}

function nativeEventApi(): NativeEventApi | null {
  const api = typeof window === "undefined" ? undefined : (window as unknown as { pywebview?: { api?: Partial<NativeEventApi> } }).pywebview?.api;
  return api?.event_package_pick && api.event_package_map_chunk && api.event_package_close ? api as NativeEventApi : null;
}

function nativeEventsManifestApi(): Pick<NativeEventApi, "events_manifest"> | null {
  const api = typeof window === "undefined" ? undefined : (window as unknown as { pywebview?: { api?: Partial<NativeEventApi> } }).pywebview?.api;
  return api?.events_manifest ? api as Pick<NativeEventApi, "events_manifest"> : null;
}

export function supportsNativeEventImport(): boolean {
  return nativeEventApi() != null;
}

export async function loadEventsManifest(): Promise<EventsManifest> {
  const api = nativeEventsManifestApi();
  if (api?.events_manifest) {
    try {
      const raw = await api.events_manifest();
      return eventsManifestSchema.parse(raw);
    } catch {
      // Fall through to browser fetch. Desktop uses the bridge to avoid WebView CORS/proxy failures.
    }
  }
  const response = await fetch(EVENTS_MANIFEST_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`赛事清单请求失败：HTTP ${response.status}`);
  return eventsManifestSchema.parse(await response.json());
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function downloadWithFallback(urls: string[], progress: EventImportProgress): Promise<ArrayBuffer> {
  const failures: string[] = [];
  for (const url of urls) {
    if (progress.isCancelled?.()) throw new Error("已取消赛事资产下载");
    const controller = new AbortController();
    const cancelPoll = setInterval(() => { if (progress.isCancelled?.()) controller.abort(); }, 100);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (!response.body) return await response.arrayBuffer();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        chunks.push(value);
        progress.onProgress?.(`浏览器降级下载 ${(received / 1024 / 1024).toFixed(1)} MB${declared ? ` / ${(declared / 1024 / 1024).toFixed(1)} MB` : ""}`);
      }
      return await new Blob(chunks as BlobPart[]).arrayBuffer();
    } catch (error) {
      if (progress.isCancelled?.()) throw new Error("已取消赛事资产下载");
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearInterval(cancelPoll);
    }
  }
  throw new Error(`赛事资产下载失败：${failures.join("；")}`);
}

/**
 * 赛事资源包（zip）是唯一一等格式：解出 event-package.json + maps/*.zip，
 * 先把各图 demo 导入资料库，再建立 Event→Series→Map。R2 下载与本地导入共用此核心。
 */
export async function importEventAssetArchive(
  bytes: ArrayBuffer,
  existingEntries: StudioDemoEntry[],
  fallbackSlug?: string,
  progress: EventImportProgress = {},
): Promise<EventAssetImportResult> {
  const archive = await JSZip.loadAsync(bytes);
  const packageFile = archive.file("event-package.json");
  if (!packageFile) throw new Error("赛事资源包缺少 event-package.json（请确认导入的是 <slug>.zip 资源包，而非裸 JSON）");
  const eventPackage = eventPackageSchema.parse(JSON.parse(await packageFile.async("string")));
  const demoDateByFileName = new Map(eventPackage.series.flatMap((series) => {
    const date = series.completedAt ? String(series.completedAt).slice(0, 10) : null;
    return series.maps.filter((map) => map.demoHint?.fileName).map((map) => [map.demoHint!.fileName!, date] as const);
  }));
  const entries = [...existingEntries];
  const errors: string[] = [];
  let cancelled = false;
  const demoFiles = Object.values(archive.files)
    .filter((file) => !file.dir && /^maps\/.+\.zip$/i.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const [index, demo] of demoFiles.entries()) {
    if (progress.isCancelled?.()) { cancelled = true; break; }
    const innerName = demo.name.split("/").at(-1)!;
    progress.onProgress?.(`浏览器降级导入第 ${index + 1}/${demoFiles.length} 图：${innerName}`);
    try {
      const data = await demo.async("arraybuffer");
      const imported = await importDemoFile(new File([data], innerName, { type: "application/zip" }), {
        tags: [eventPackage.event?.slug ?? fallbackSlug ?? "event"], lowMemory: true,
        matchDate: demoDateByFileName.get(innerName) ?? null,
      });
      if (!entries.some((entry) => entry.id === imported.entry.id)) entries.push(imported.entry);
    } catch (error) {
      errors.push(`${demo.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { event: await importEventPackage(eventPackage, entries), entries, errors, cancelled };
}

/** 本地选择 <slug>.zip 资源包导入（含 demo）。 */
export async function importEventAssetFile(
  file: File,
  existingEntries: StudioDemoEntry[],
  progress: EventImportProgress = {},
): Promise<EventAssetImportResult> {
  return importEventAssetArchive(await file.arrayBuffer(), existingEntries, file.name.replace(/\.zip$/i, ""), progress);
}

/** 桌面端路径式导入：外层赛事 ZIP 始终留在 Python，前端一次只接收一张 v3 ZIP。 */
export async function pickAndImportEventAsset(
  existingEntries: StudioDemoEntry[],
  onProgress: (message: string) => void,
  isCancelled: () => boolean = () => false,
): Promise<EventAssetImportResult | null> {
  const api = nativeEventApi();
  if (!api) return null;
  const opened = await api.event_package_pick();
  if (opened.cancelled) return null;
  return importNativeOpened(api, opened, existingEntries, { onProgress, isCancelled });
}

async function importNativeOpened(
  api: NativeEventApi,
  opened: { ok: boolean; error?: string; sessionId?: string; eventPackage?: unknown; maps?: Array<{ name: string; size: number }> },
  existingEntries: StudioDemoEntry[],
  progress: EventImportProgress,
): Promise<EventAssetImportResult> {
  if (!opened.ok || !opened.sessionId || !opened.eventPackage) throw new Error(opened.error ?? "赛事包打开失败");
  try {
    const eventPackage = eventPackageSchema.parse(opened.eventPackage);
    const demoDateByFileName = new Map(eventPackage.series.flatMap((series) => {
      const date = series.completedAt ? String(series.completedAt).slice(0, 10) : null;
      return series.maps.filter((map) => map.demoHint?.fileName).map((map) => [map.demoHint!.fileName!, date] as const);
    }));
    const entries = [...existingEntries];
    const maps = opened.maps ?? [];
    const errors: string[] = [];
    let cancelled = false;
    for (const [index, map] of maps.entries()) {
      if (progress.isCancelled?.()) { cancelled = true; break; }
      progress.onProgress?.(`正在导入第 ${index + 1}/${maps.length} 图：${map.name.split("/").at(-1)}`);
      try {
        const parts: ArrayBuffer[] = [];
        let offset = 0;
        for (;;) {
          const chunk = await api.event_package_map_chunk(opened.sessionId, map.name, offset, 512 * 1024);
          if (!chunk.ok || chunk.data == null) throw new Error(chunk.error ?? "读取失败");
          const bytes = base64ToBytes(chunk.data);
          parts.push(bytes);
          offset += bytes.byteLength;
          if (chunk.done) break;
        }
        const name = map.name.split("/").at(-1)!;
        const imported = await importDemoFile(new File(parts as BlobPart[], name, { type: "application/zip" }), {
          tags: [eventPackage.event.slug], lowMemory: true,
          matchDate: demoDateByFileName.get(name) ?? null,
        });
        if (!entries.some((entry) => entry.id === imported.entry.id)) entries.push(imported.entry);
        parts.length = 0;
      } catch (error) {
        errors.push(`${map.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { event: await importEventPackage(eventPackage, entries), entries, errors, cancelled };
  } finally {
    await api.event_package_close(opened.sessionId);
  }
}

export async function downloadAndImportEvent(
  asset: EventsManifest["events"][number],
  existingEntries: StudioDemoEntry[],
  onProgress: (message: string) => void = () => {},
  isCancelled: () => boolean = () => false,
): Promise<EventAssetImportResult> {
  const api = nativeEventApi();
  if (api?.event_download_start && api.event_download_status && api.event_download_open) {
    const { jobId } = await api.event_download_start(asset.urls, asset.sha256, asset.size, asset.slug);
    for (;;) {
      if (isCancelled()) {
        await api.event_download_cancel?.(jobId);
        throw new Error("已取消赛事资产下载");
      }
      const status = await api.event_download_status(jobId);
      if (status.state === "error") throw new Error(status.error ?? "赛事资产下载失败");
      onProgress(`${status.stage ?? "下载中"} ${Math.round((status.progress ?? 0) * 100)}%`);
      if (status.state === "ready") break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return importNativeOpened(api, await api.event_download_open(jobId), existingEntries, { onProgress, isCancelled });
  }
  const bytes = await downloadWithFallback(asset.urls, { onProgress, isCancelled });
  const actualHash = await sha256Hex(bytes);
  if (actualHash !== asset.sha256.toLowerCase()) throw new Error("赛事资产 sha256 校验失败");
  return importEventAssetArchive(bytes, existingEntries, asset.slug, { onProgress, isCancelled });
}
