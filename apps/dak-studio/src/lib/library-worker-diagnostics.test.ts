import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPkgCache, getDemoPackage, loadDemoPackageTransient } from "./library";
import { getStorage } from "./storage";

class FailingWorker {
  static mode: "reply" | "event" = "reply";
  onmessage?: (event: unknown) => void;
  onerror?: (event: unknown) => void;
  terminate() {}
  postMessage(message: { id: number }) {
    queueMicrotask(() => {
      if (FailingWorker.mode === "reply") {
        this.onmessage?.({ data: { id: message.id, ok: false, error: "original worker reply" } });
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
});
