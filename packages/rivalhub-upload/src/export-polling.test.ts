import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExportPolling } from "./export-polling";
const running = (progress = 0.1, stage = "parse") => ({ state: "running", progress, stage });
const done = { state: "done", size: 4 };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const make = () => new ExportPolling({ intervalMs: 10, queryMs: 100, unchangedMs: 200 });

it.each([null, { state: "future" }, { state: "error", code: "EXPORT_JOB_NOT_FOUND" }, { state: "running", stage: "parse", progress: NaN }])("retains unknown/service-invalid task state until explicit read-only recheck: %j", async value => {
  const monitor = make(), read = vi.fn().mockResolvedValueOnce(value).mockResolvedValue(done);
  const task = monitor.wait("job-1", read, vi.fn());
  await vi.advanceTimersByTimeAsync(1000);
  expect(read).toHaveBeenCalledTimes(1);
  expect(monitor.snapshots()[0]).toMatchObject({ jobId: "job-1", uncertain: true, progress: null });
  monitor.recheck("job-1");
  await expect(task).resolves.toEqual(done);
  expect(read).toHaveBeenCalledTimes(2);
});

it("retains last stage/progress and a safe network cause while disconnected; recheck uses the same job", async () => {
  const monitor = make(), read = vi.fn().mockResolvedValueOnce(running(0.4, "decode"))
    .mockRejectedValueOnce(Object.assign(new Error("Bridge unavailable token=private"), { status: 503, requestId: "req-bridge" })).mockResolvedValueOnce(done);
  const task = monitor.wait("job-2", read, vi.fn());
  await vi.advanceTimersByTimeAsync(30);
  expect(monitor.snapshots()[0]).toMatchObject({ jobId: "job-2", stage: "decode", progress: 0.4, diagnostic: { code: "EXPORT_QUERY_FAILED", status: 503, requestId: "req-bridge", cause: "Bridge unavailable token=[redacted]" } });
  await vi.advanceTimersByTimeAsync(10000);
  expect(read).toHaveBeenCalledTimes(2);
  monitor.recheck("job-2");
  await expect(task).resolves.toEqual(done);
});

it("late status completion recovers automatically without starting or cancelling a task", async () => {
  const monitor = make(); let finish!: (value: unknown) => void;
  const read = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const task = monitor.wait("job-3", read, vi.fn());
  await vi.advanceTimersByTimeAsync(150);
  expect(monitor.snapshots()[0].diagnostic?.code).toBe("EXPORT_QUERY_UNCONFIRMED");
  await vi.advanceTimersByTimeAsync(200);
  expect(read).toHaveBeenCalledTimes(1);
  finish(done);
  await expect(task).resolves.toEqual(done);
  expect(monitor.snapshots()).toEqual([]);
});

it("does not fail a slow parser or infer heartbeat from repeated successful queries", async () => {
  const monitor = make(), read = vi.fn().mockResolvedValue(running());
  const task = monitor.wait("job-slow", read, vi.fn());
  await vi.advanceTimersByTimeAsync(1000);
  expect(monitor.snapshots()[0]).toMatchObject({ uncertain: true, diagnostic: { code: "EXPORT_PROGRESS_UNCONFIRMED" } });
  expect(monitor.snapshots()[0].message).toContain("没有心跳");
  read.mockResolvedValue(running(0.2));
  await vi.advanceTimersByTimeAsync(10);
  expect(monitor.snapshots()[0]).toMatchObject({ uncertain: false, progress: 0.2 });
  read.mockResolvedValue(done);
  await vi.advanceTimersByTimeAsync(10);
  await expect(task).resolves.toEqual(done);
});

it("shares a monitor for the same job and preserves a confirmed parser failure", async () => {
  const monitor = make(); const diagnostic = { code: "PARSE_FAILED", message: "Parser exited", stage: "parse", cause: "Native dependency" };
  const read = vi.fn().mockResolvedValue({ state: "error", diagnostic });
  const task = monitor.wait("job-4", read, vi.fn());
  expect(monitor.wait("job-4", read, vi.fn())).toBe(task);
  await expect(task).rejects.toEqual(diagnostic);
  expect(read).toHaveBeenCalledOnce();
});

it("an explicit recheck can recover a never-returning query and ignores its stale late reply", async () => {
  const monitor = make(); let late!: (value: unknown) => void;
  const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { late = resolve; })).mockResolvedValueOnce(done);
  const task = monitor.wait("job-lost", read, vi.fn());
  await vi.advanceTimersByTimeAsync(100);
  monitor.recheck("job-lost"); monitor.recheck("job-lost");
  await expect(task).resolves.toEqual(done);
  expect(read).toHaveBeenCalledTimes(2);
  late({ state: "error", error: "stale reply" });
  await vi.advanceTimersByTimeAsync(1);
  expect(monitor.snapshots()).toEqual([]);
});
it("changing stages can run beyond the inactivity window without a total parser deadline", async () => {
  const monitor = make(), read = vi.fn().mockResolvedValue(running());
  const task = monitor.wait("job-long", read, vi.fn());
  for (let index = 0; index < 10; index++) {
    read.mockResolvedValue(running(0.1, `stage-${index}`));
    await vi.advanceTimersByTimeAsync(150);
    expect(monitor.snapshots()[0].uncertain).toBe(false);
  }
  read.mockResolvedValue(done);
  await vi.advanceTimersByTimeAsync(10);
  await expect(task).resolves.toEqual(done);
});
