import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { BROWSER_EVENT_PACKAGE_LIMIT, downloadAndImportEvent, importEventAssetArchive, importEventAssetFile } from "./event-assets";

afterEach(() => vi.unstubAllGlobals());

async function archiveWithMaps(names: string[]): Promise<ArrayBuffer> {
  const archive = new JSZip();
  archive.file("event-package.json", JSON.stringify({
    version: "cs2-demo-analysis-kit/event-package-1.0",
    source: "manual",
    exportedAt: "2026-06-21T00:00:00.000Z",
    event: { slug: `checkpoint-${names.length}`, name: "Checkpoint", kind: "test", stages: [] },
    teams: [],
    series: [],
  }));
  for (const name of names) archive.file(`maps/${name}`, "not-a-demo-package");
  return archive.generateAsync({ type: "arraybuffer" });
}

describe("赛事包渐进导入", () => {
  it("单图失败会记录错误并继续，不丢失赛事 checkpoint", async () => {
    const progress: string[] = [];
    const result = await importEventAssetArchive(await archiveWithMaps(["a.zip", "b.zip"]), [], "checkpoint", { onProgress: (message) => progress.push(message) });
    expect(result.errors).toHaveLength(2);
    expect(result.cancelled).toBe(false);
    expect(progress).toHaveLength(2);
    expect(result.event.event.slug).toBe("checkpoint-2");
  });

  it("取消在地图边界生效并返回可持久化的部分结果", async () => {
    const result = await importEventAssetArchive(await archiveWithMaps(["a.zip", "b.zip"]), [], "checkpoint", { isCancelled: () => true });
    expect(result.cancelled).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.event.event.slug).toBe("checkpoint-2");
  });

  it("坏 manifest 在任何 demo 入库前被拒绝", async () => {
    const archive = new JSZip();
    archive.file("event-package.json", JSON.stringify({ version: "bad" }));
    archive.file("maps/a.zip", "not-a-demo");
    await expect(importEventAssetArchive(await archive.generateAsync({ type: "arraybuffer" }), [])).rejects.toThrow();
  });

  it("浏览器入口在读取字节前拒绝大包", async () => {
    const oversized = { size: BROWSER_EVENT_PACKAGE_LIMIT + 1, name: "huge.zip" } as File;
    await expect(importEventAssetFile(oversized, [])).rejects.toThrow("桌面端低内存入口");
  });

  it("浏览器在线下载使用 AbortSignal 真正取消 fetch", async () => {
    let cancelled = false;
    let observedAbort = false;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => { observedAbort = true; reject(new DOMException("aborted", "AbortError")); });
      setTimeout(() => { cancelled = true; }, 10);
    })));
    await expect(downloadAndImportEvent({ slug: "small", name: "Small", size: 10, sha256: "0".repeat(64), urls: ["https://example.test/a.zip"], packageVersion: "1" }, [], () => {}, () => cancelled)).rejects.toThrow("已取消");
    expect(observedAbort).toBe(true);
  });
});
