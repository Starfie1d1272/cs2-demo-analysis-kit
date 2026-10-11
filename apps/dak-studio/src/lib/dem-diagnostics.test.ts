import { afterEach, expect, it, vi } from "vitest";
import { exportDemToZip, fileFromNativePath } from "./dem";

afterEach(() => vi.unstubAllGlobals());

it("keeps export stage and safe native causes available after the desktop bridge", async () => {
  vi.stubGlobal("window", { pywebview: { api: {
    start_export_job: async () => ({ jobId: "export-1" }),
    get_export_status: async () => ({
      state: "error", stage: "export.dependencies", error: "parser unavailable token=private-token",
      diagnostic: { type: "ImportError", message: "parser unavailable", stage: "export.dependencies",
        causes: [{ type: "OSError", message: "native loader unavailable", relation: "__cause__" }] },
    }),
  } } });
  const error = await exportDemToZip(fileFromNativePath("/private/source.dem"), "pywebview").catch((error: Error) => error);
  expect(error).toBeInstanceOf(Error);
  if (!(error instanceof Error)) throw new Error("expected failure");
  expect(error.message).toContain("export.dependencies");
  expect(error.message).toContain("导出诊断日志");
  expect(error.message).not.toContain("private-token");
  expect(error.cause).toMatchObject({ stage: "export.dependencies", cause: "native loader unavailable" });
});
