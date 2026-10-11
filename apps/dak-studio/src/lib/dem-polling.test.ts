import { afterEach, expect, it, vi } from "vitest";
import { exportDemToZip, exportPolling, fileFromNativePath } from "./dem";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("keeps unknown native job separate from parse failure and rechecks the original ID", async () => {
  vi.useFakeTimers();
  const start = vi.fn(async () => ({ jobId: "job-native" }));
  const read = vi.fn().mockResolvedValueOnce({ state: "error", code: "EXPORT_JOB_NOT_FOUND", error: "未知任务" })
    .mockResolvedValueOnce({ state: "done", fileName: "result.zip", resultSize: 3 });
  vi.stubGlobal("window", { pywebview: { api: { start_export_job: start, get_export_status: read,
    get_export_result_chunk: async () => ({ ok: true, done: true, data: btoa("zip") }) } } });
  const task = exportDemToZip(fileFromNativePath("/private/source.dem"), "pywebview");
  await vi.advanceTimersByTimeAsync(1);
  expect(exportPolling.snapshots()[0]).toMatchObject({ jobId: "job-native", uncertain: true, diagnostic: { code: "EXPORT_STATE_UNKNOWN" } });
  exportPolling.recheck("job-native");
  const result = await task;
  expect(result.file.name).toBe("result.zip");
  expect(await result.file.text()).toBe("zip");
  expect(start).toHaveBeenCalledOnce();
  expect(read.mock.calls).toEqual([["job-native"], ["job-native"]]);
});
