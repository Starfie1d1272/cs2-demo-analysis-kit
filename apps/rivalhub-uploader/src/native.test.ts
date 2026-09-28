import { describe, expect, it } from "vitest";
import { nativeApiReady, type NativeApi } from "./native";

describe("desktop bridge readiness", () => {
  it("does not treat pywebview's initial empty api object as ready", () => {
    expect(nativeApiReady({})).toBe(false);
    expect(nativeApiReady({ connection: (() => Promise.resolve({ baseUrl: "", connected: false })) } as Partial<NativeApi>)).toBe(false);
  });

  it("waits until the complete native API has been injected", () => {
    const api = Object.fromEntries([
      "connection", "configure", "save_connection", "open_website", "request", "select_demos",
      "hash_demo", "start_export", "export_status", "read_chunk", "cleanup", "record",
      "export_logs", "report_ui_error",
    ].map(method => [method, () => Promise.resolve()])) as Partial<NativeApi>;
    expect(nativeApiReady(api)).toBe(true);
  });
});
