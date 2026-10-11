import { afterEach, describe, expect, it, vi } from "vitest";
import { client, exportZip, initializeNativeApiOnce, logDiagnostic, recordDiagnostic, nativeApiReady, type NativeApi } from "./native";

function completeApi(): Partial<NativeApi> {
  return Object.fromEntries([
    "connection", "configure", "save_connection", "open_website", "request", "select_demos",
    "hash_demo", "start_export", "export_status", "read_chunk", "cleanup", "record",
    "export_logs", "report_ui_error",
  ].map(method => [method, () => Promise.resolve()])) as Partial<NativeApi>;
}

describe("desktop bridge readiness", () => {
  it("does not treat pywebview's initial empty api object as ready", () => {
    expect(nativeApiReady({})).toBe(false);
    expect(nativeApiReady({ connection: (() => Promise.resolve({ baseUrl: "", connected: false })) } as Partial<NativeApi>)).toBe(false);
  });

  it("waits until the complete native API has been injected", () => {
    expect(nativeApiReady(completeApi())).toBe(true);
  });

  it("recovers from an initially empty api and initializes exactly once after pywebviewready", () => {
    const initialized = { current: false };
    const onReady = vi.fn();

    // pywebview may expose a truthy but still-empty api object before its bridge is ready.
    expect(initializeNativeApiOnce({}, initialized, onReady)).toBe(false);
    expect(initialized.current).toBe(false);
    expect(onReady).not.toHaveBeenCalled();

    const api = completeApi();
    expect(initializeNativeApiOnce(api, initialized, onReady)).toBe(true);
    expect(initialized.current).toBe(true);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(api);

    // Duplicate readiness signals must not reconnect or reinitialize the app.
    expect(initializeNativeApiOnce(api, initialized, onReady)).toBe(false);
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("native transport diagnostics", () => {
  function mockRequest(result: unknown) {
    vi.stubGlobal("window", { pywebview: { api: { ...completeApi(), request: vi.fn(async () => result) } } });
  }
  it("retains HTTP code, status, request ID and native cause", async () => {
    mockRequest({ status: 422, body: { error: { code: "NEW_CODE", message: "Rejected" } }, requestId: "req-native", diagnostic: { cause: "Roster mismatch" } });
    await expect(client.startPairing()).rejects.toMatchObject({ status: 422, code: "NEW_CODE", requestId: "req-native", cause: "Roster mismatch" });
  });
  it("rejects native nonJSON success envelopes", async () => {
    mockRequest({ status: 200, body: { error: { code: "INVALID_RESPONSE", message: "Invalid JSON" } } });
    await expect(client.startPairing()).rejects.toMatchObject({ status: 200, code: "INVALID_RESPONSE" });
  });
  it("retains structured export diagnostics", async () => {
    const diagnostic = { code: "PARSE_FAILED", message: "Exporter failed", cause: "Worker exited", stage: "export:parsing" };
    vi.stubGlobal("window", { pywebview: { api: { ...completeApi(), export_status: async () => ({ state: "error", diagnostic }) } } });
    await expect(exportZip("file-1", vi.fn())).rejects.toEqual(diagnostic);
  });
  it("logs the original diagnostic and secondary record failure safely", async () => {
    const report = vi.fn(async () => true);
    vi.stubGlobal("window", { pywebview: { api: { ...completeApi(), record: async () => { throw new Error("record failed token=private"); }, report_ui_error: report } } });
    await recordDiagnostic("file-1", "failed", { code: "NETWORK", message: "Original failure", attempt: 2 });
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[0]).toEqual(["Original failure", "", expect.objectContaining({ code: "NETWORK", attempt: 2 })]);
    expect(JSON.stringify(report.mock.calls)).not.toContain("private");
  });
  it("falls back once without recursing if native error logging fails", async () => {
    const report = vi.fn(async () => { throw new Error("logging failed"); });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("window", { pywebview: { api: { ...completeApi(), report_ui_error: report } } });
    await expect(logDiagnostic({ message: "Native rejected token=private", rawBody: "private" })).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledOnce();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("private");
  });
});
