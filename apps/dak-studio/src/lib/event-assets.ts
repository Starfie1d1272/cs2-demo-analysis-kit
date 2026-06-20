import JSZip from "jszip";
import { eventsManifestSchema, type EventsManifest } from "@cs2dak/contract";
import { importDemoFile, type StudioDemoEntry } from "./library";
import { importEventPackage, type EventImportResult } from "./events";

export const EVENTS_MANIFEST_URL = "https://dakupdate.starfie1d.top/events/manifest.json";

export async function loadEventsManifest(): Promise<EventsManifest> {
  const response = await fetch(EVENTS_MANIFEST_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`赛事清单请求失败：HTTP ${response.status}`);
  return eventsManifestSchema.parse(await response.json());
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function downloadWithFallback(urls: string[]): Promise<ArrayBuffer> {
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.arrayBuffer();
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`赛事资产下载失败：${failures.join("；")}`);
}

export async function downloadAndImportEvent(
  asset: EventsManifest["events"][number],
  existingEntries: StudioDemoEntry[],
): Promise<{ event: EventImportResult; entries: StudioDemoEntry[] }> {
  const bytes = await downloadWithFallback(asset.urls);
  const actualHash = await sha256Hex(bytes);
  if (actualHash !== asset.sha256.toLowerCase()) throw new Error("赛事资产 sha256 校验失败");
  const archive = await JSZip.loadAsync(bytes);
  const packageFile = archive.file("event-package.json");
  if (!packageFile) throw new Error("赛事资产缺少 event-package.json");
  const eventPackage = JSON.parse(await packageFile.async("string"));
  const entries = [...existingEntries];
  const demoFiles = Object.values(archive.files)
    .filter((file) => !file.dir && /^maps\/.+\.zip$/i.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const demo of demoFiles) {
    const data = await demo.async("arraybuffer");
    const imported = await importDemoFile(new File([data], demo.name.split("/").at(-1)!, { type: "application/zip" }), {
      tags: [eventPackage.event?.slug ?? asset.slug],
    });
    if (!entries.some((entry) => entry.id === imported.entry.id)) entries.push(imported.entry);
  }
  return { event: await importEventPackage(eventPackage, entries), entries };
}
