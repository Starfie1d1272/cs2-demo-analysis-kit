import { afterEach, expect, it, vi } from "vitest";
const load = vi.hoisted(() => vi.fn());
vi.mock("@cs2dak/core", () => ({ loadDemoPackageFromZip: load, buildMatchRadarField: vi.fn() }));
vi.mock("./extract-match-facts", () => ({ extractMatchData: vi.fn() }));
vi.mock("./demo-meta", () => ({ metaFromPackage: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); load.mockReset(); });
it("worker includes safe optional-input diagnostics on successful and failed parse replies", async () => {
  const postMessage = vi.fn();
  const worker = { postMessage, importScripts: () => {}, onmessage: undefined as undefined | ((event: unknown) => Promise<void>) };
  vi.stubGlobal("self", worker);
  load.mockImplementation(async (_bytes, options) => {
    options.onDiagnostic({ code: "OPTIONAL_INPUT_READ_FAILED", stage: "package.optional.shots.read", message: "Optional stream could not be read", cause: new Error("read failed pollToken=synthetic-secret /home/synthetic/demo.zip") });
    return { marker: "original package" };
  });
  await import("./pkg-worker");
  await worker.onmessage!({ data: { id: 1, op: "parse", buffer: new ArrayBuffer(0) } });
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ ok: true, pkg: { marker: "original package" }, diagnostics: [expect.objectContaining({ code: "OPTIONAL_INPUT_READ_FAILED", fileId: "worker-1" })] }));
  expect(JSON.stringify(postMessage.mock.calls)).not.toContain("synthetic-secret");
  expect(JSON.stringify(postMessage.mock.calls)).not.toContain("/home/synthetic");
  load.mockImplementation(async (_bytes, options) => {
    options.onDiagnostic({ code: "OPTIONAL_INPUT_MISSING", stage: "package.optional.shots.read", message: "Optional stream is absent" });
    throw new Error("required schema invalid");
  });
  await worker.onmessage!({ data: { id: 2, op: "parse", buffer: new ArrayBuffer(0) } });
  expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({ ok: false, diagnostics: [expect.objectContaining({ code: "OPTIONAL_INPUT_MISSING" })], diagnostic: { message: "required schema invalid" } });
});
