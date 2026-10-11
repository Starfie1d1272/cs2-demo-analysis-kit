import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPkgCache, getDemoPackage, loadDemoPackageTransient } from "./library";
import { getStorage } from "./storage";

class FailingWorker {
  static mode: "reply" | "event" | "degraded" = "reply";
  onmessage?: (event: unknown) => void;
  onerror?: (event: unknown) => void;
  terminate() {}
  postMessage(message: { id: number }) {
    queueMicrotask(() => {
      if (FailingWorker.mode === "reply") {
        this.onmessage?.({ data: { id: message.id, ok: false, error: "original worker reply" } });
      } else if (FailingWorker.mode === "degraded") {
        this.onmessage?.({ data: { id: message.id, ok: true, pkg: {}, diagnostics: [{
          code: "OPTIONAL_INPUT_READ_FAILED", message: "Optional input failed", stage: "package.optional.shots.read",
          cause: "read denied accessToken=synthetic-secret /home/synthetic/demo.zip",
        }] } });
      } else {
        this.onerror?.({ error: new Error("original ErrorEvent cause"), message: "generic worker error" });
      }
    });
  }
}

afterEach(() => { vi.unstubAllGlobals(); clearPkgCache(); });

describe("library worker boundaries", () => {
  it("preserves reply.error when low-memory loading disables fallback", async () => {
    vi.stubGlobal("Worker", FailingWorker);
    FailingWorker.mode = "reply";
    await expect(loadDemoPackageTransient("unused", new File(["invalid zip"], "test.zip")))
      .rejects.toMatchObject({ cause: { message: "original worker reply", stage: "worker.parse" } });
  });

  it("preserves ErrorEvent.error when low-memory loading disables fallback", async () => {
    vi.stubGlobal("Worker", FailingWorker);
    FailingWorker.mode = "event";
    await expect(loadDemoPackageTransient("unused", new File(["invalid zip"], "test.zip")))
      .rejects.toMatchObject({ cause: { message: "original ErrorEvent cause", stage: "worker.parse" } });
  });

  it("settles constructor failure without leaving a stale queued task", async () => {
    vi.stubGlobal("Worker", class { constructor() { throw new Error("worker module missing"); } });
    await expect(loadDemoPackageTransient("unused", new File(["invalid zip"], "test.zip")))
      .rejects.toMatchObject({ cause: { message: "worker module missing" } });
    vi.stubGlobal("Worker", FailingWorker);
    FailingWorker.mode = "event";
    await expect(loadDemoPackageTransient("unused", new File(["invalid zip"], "test.zip")))
      .rejects.toMatchObject({ cause: { message: "original ErrorEvent cause" } });
  });

  it("settles postMessage failure with its original cause", async () => {
    vi.stubGlobal("Worker", class extends FailingWorker {
      override postMessage() { throw new Error("worker transfer failed"); }
    });
    await expect(loadDemoPackageTransient("unused", new File(["invalid zip"], "test.zip")))
      .rejects.toMatchObject({ cause: { message: "worker transfer failed" } });
  });

  it("keeps the worker cause when main-thread parsing also fails", async () => {
    vi.stubGlobal("Worker", FailingWorker);
    FailingWorker.mode = "event";
    await getStorage().blobs("demos").put("worker-fallback-test", new TextEncoder().encode("invalid zip").buffer);
    await expect(getDemoPackage("worker-fallback-test"))
      .rejects.toMatchObject({ cause: { message: "original ErrorEvent cause", fallback: { stage: "worker.parse.fallback" } } });
    await getStorage().blobs("demos").delete("worker-fallback-test");
  });
  it("retains sanitized downgrade diagnostics on a successful worker reply", async () => {
    const report = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("window", { pywebview: { api: { report_diagnostic: report } } });
    vi.stubGlobal("Worker", FailingWorker);
    FailingWorker.mode = "degraded";
    await expect(loadDemoPackageTransient("unused", new File(["zip"], "test.zip"))).resolves.toEqual({});
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ code: "OPTIONAL_INPUT_READ_FAILED", stage: "package.optional.shots.read", fileId: expect.stringMatching(/^worker-/) }));
    expect(JSON.stringify(report.mock.calls)).not.toContain("synthetic-secret");
    expect(JSON.stringify(report.mock.calls)).not.toContain("/home/synthetic");
  });

});
