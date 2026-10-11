import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as tri from "./tri";
import { downloadTri, loadTrisManifest } from "./tri-assets";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe(".tri asset manifest", () => {
  it("桌面端通过 Python bridge 加载清单，避免静态服务缺 manifest 时大小显示为空", async () => {
    const manifest = {
      generatedAt: "2026-06-26T00:00:00.000Z",
      maps: {
        de_mirage: {
          name: "de_mirage.tri",
          size: 1234,
          sha256: "a".repeat(64),
          urls: ["https://example.test/de_mirage.tri"]
        }
      }
    };
    const fetchSpy = vi.fn();
    vi.stubGlobal("window", { pywebview: { api: { tri_present: vi.fn().mockResolvedValue(["de_mirage"]), tris_manifest: vi.fn().mockResolvedValue(manifest) } } });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(loadTrisManifest()).resolves.toEqual(manifest);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each([
    [404, "application/json", "", "TRI_MANIFEST_MISSING"],
    [503, "application/json", "", "TRI_MANIFEST_FETCH_FAILED"],
    [200, "application/json", "{broken", "TRI_MANIFEST_INVALID"],
    [200, "application/json", "{}", "TRI_MANIFEST_INVALID"],
  ])("retains manifest downgrade category for HTTP %i", async (status, contentType, body, code) => {
    const diagnostics: unknown[] = [];
    vi.stubGlobal("window", { pywebview: { api: { report_diagnostic: vi.fn(async diagnostic => { diagnostics.push(diagnostic); return { ok: true }; }) } } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers: { "content-type": contentType } })));
    await expect(loadTrisManifest()).resolves.toBeNull();
    expect(diagnostics).toEqual([expect.objectContaining({ code })]);
  });

  it("keeps explicit install persistence failure distinct from malformed tri bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ArrayBuffer(36))));
    const install = vi.spyOn(tri, "installTriBuffer").mockResolvedValue(false);
    await expect(downloadTri("de_nuke")).rejects.toThrow("TRI_CACHE_WRITE_FAILED");
    install.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ArrayBuffer(1))));
    await expect(downloadTri("de_nuke")).rejects.toThrow("TRI_INVALID");
    expect(install).not.toHaveBeenCalled();
  });

});
