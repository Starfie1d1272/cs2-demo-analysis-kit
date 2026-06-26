import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTrisManifest } from "./tri-assets";

afterEach(() => vi.unstubAllGlobals());

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
});
