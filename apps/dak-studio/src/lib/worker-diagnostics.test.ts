import { describe, expect, it, vi } from "vitest";
import { withWorkerFallback } from "./worker-diagnostics";

describe("worker failure diagnostics", () => {
  it("preserves worker reply cause in low-memory mode without retrying", async () => {
    const fallback = vi.fn();
    const error = await withWorkerFallback(
      { code: "LOAD_FAILED", message: "ZIP schema invalid", cause: "missing round" },
      "worker.parse", null, fallback,
    ).catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("expected failure");
    expect(error.message).toContain("ZIP schema invalid");
    expect(error.cause).toMatchObject({ stage: "worker.parse", cause: "missing round" });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("retains worker ErrorEvent error and a secondary fallback failure safely", async () => {
    const primary = new Error("worker crashed Authorization: Bearer private-worker-token");
    const error = await withWorkerFallback(primary, "worker.import", new ArrayBuffer(0), async () => {
      throw new Error("fallback failed token=private-fallback-token");
    }).catch((error: Error) => error);
    expect(error.message).toContain("worker crashed");
    expect(error.message).toContain("fallback failed");
    expect(error.cause).toMatchObject({ stage: "worker.import", fallback: { stage: "worker.import.fallback" } });
    expect(JSON.stringify(error.cause)).not.toContain("private-worker-token");
    expect(JSON.stringify(error.cause)).not.toContain("private-fallback-token");
  });

  it("allows a successful fallback and records its sanitized primary", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(withWorkerFallback(new Error("worker failed"), "worker.parse", new ArrayBuffer(0), async () => "ok"))
      .resolves.toBe("ok");
    expect(warning).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: "worker failed", stage: "worker.parse" }));
    warning.mockRestore();
  });
});

it("reports bounded worker and fallback causes without letting bridge failure replace them", async () => {
  const report = vi.fn().mockRejectedValue(new Error("bridge unavailable"));
  vi.stubGlobal("window", { pywebview: { api: { report_diagnostic: report } } });
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await expect(withWorkerFallback(new Error("worker failed token=secret"), "worker.import", new ArrayBuffer(0), async () => {
      throw new Error("fallback failed");
    }, "match-1")).rejects.toMatchObject({ cause: { message: "worker failed token=[redacted]", fallback: { message: "fallback failed" } } });
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[0][0]).toMatchObject({ stage: "worker.import", fileId: "match-1" });
    expect(report.mock.calls[1][0]).toMatchObject({ stage: "worker.import.fallback", fileId: "match-1" });
    expect(JSON.stringify(report.mock.calls)).not.toContain("secret");
  } finally {
    vi.unstubAllGlobals();
    warning.mockRestore();
  }
});
