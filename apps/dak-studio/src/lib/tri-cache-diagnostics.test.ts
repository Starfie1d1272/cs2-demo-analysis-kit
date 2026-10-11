import { afterEach, beforeEach, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), keys: vi.fn() }));
const report = vi.hoisted(() => vi.fn());
vi.mock("./storage", () => ({ getStorage: () => ({ blobs: () => store }) }));
vi.mock("./worker-diagnostics", () => ({ reportDiagnostic: report }));
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => { vi.resetModules(); store.get.mockReset(); store.put.mockReset(); report.mockClear(); vi.unstubAllGlobals(); });
it("falls back from an unreadable cache and records cache-write failure without changing BVH success", async () => {
  store.get.mockRejectedValue(new Error("cache denied accessToken=synthetic-secret"));
  store.put.mockRejectedValue(new Error("disk full /home/synthetic/tri"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer)));
  const { loadMapTri } = await import("./tri");
  await expect(loadMapTri("de_nuke")).resolves.not.toBeNull();
  await Promise.resolve();
  expect(report.mock.calls.map(([diagnostic]) => diagnostic.code)).toEqual(["TRI_READ_FAILED", "TRI_CACHE_WRITE_FAILED"]);
  expect(JSON.stringify(report.mock.calls)).not.toContain("synthetic-secret");
  expect(JSON.stringify(report.mock.calls)).not.toContain("/home/synthetic");
});
it("does not claim a browser installation succeeded when cache persistence failed", async () => {
  store.put.mockRejectedValue(new Error("write denied"));
  const { installTriBuffer } = await import("./tri");
  await expect(installTriBuffer("de_nuke", new ArrayBuffer(36))).resolves.toBe(false);
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ code: "TRI_CACHE_WRITE_FAILED" }));
});
it("records corrupt cached bytes before successfully recovering from the source", async () => {
  store.get.mockResolvedValue(new ArrayBuffer(1));
  store.put.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new ArrayBuffer(36))));
  const { loadMapTri } = await import("./tri");
  await expect(loadMapTri("de_nuke")).resolves.not.toBeNull();
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ code: "TRI_INVALID", stage: "tri.cache_read" }));
});
