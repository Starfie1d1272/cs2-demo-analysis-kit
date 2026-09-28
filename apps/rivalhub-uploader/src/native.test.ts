import { describe, expect, it, vi } from "vitest";
import { initializeNativeApiOnce, nativeApiReady, type NativeApi } from "./native";

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
