import { afterEach, expect, it, vi } from "vitest";
import { exportPolling, exportZip } from "./native";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("rechecks a failed status query without restarting export or cleaning the live task", async () => {
  vi.useFakeTimers();
  const start = vi.fn(async () => true), cleanup = vi.fn(async () => true);
  const status = vi.fn().mockRejectedValueOnce(new Error("Service unavailable"))
    .mockResolvedValueOnce({ state: "done", size: 3 });
  const api = Object.fromEntries(["connection", "configure", "save_connection", "open_website", "request", "select_demos", "hash_demo", "record", "export_logs", "report_ui_error"].map(key => [key, vi.fn()]));
  vi.stubGlobal("window", { pywebview: { api: { ...api, start_export: start, export_status: status, cleanup, read_chunk: async () => btoa("zip") } } });
  const task = exportZip("file-1", vi.fn());
  await vi.advanceTimersByTimeAsync(1);
  expect(exportPolling.snapshots()[0]).toMatchObject({ jobId: "file-1", uncertain: true });
  expect(start).toHaveBeenCalledOnce(); expect(cleanup).not.toHaveBeenCalled();
  exportPolling.recheck("file-1");
  await expect(task).resolves.toEqual(new Uint8Array([122, 105, 112]));
  expect(start).toHaveBeenCalledOnce();
  expect(status.mock.calls).toEqual([["file-1"], ["file-1"]]);
});
