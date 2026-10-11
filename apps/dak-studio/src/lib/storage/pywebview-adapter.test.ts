import { describe, expect, it, vi } from "vitest";
import { createPywebviewAdapter } from "./pywebview-adapter";

describe("native RecordStore missing values", () => {
  it("normalizes Python None without changing actual record values", async () => {
    const api: Parameters<typeof createPywebviewAdapter>[0] = {
      storage_record_get: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "existing" }).mockResolvedValueOnce(false),
      storage_record_get_all: vi.fn(), storage_record_entries: vi.fn(), storage_record_keys: vi.fn(),
      storage_record_put: vi.fn(), storage_record_delete: vi.fn(), storage_record_delete_prefix: vi.fn(),
      storage_blob_get: vi.fn(), storage_blob_put: vi.fn(), storage_blob_delete: vi.fn(), storage_blob_delete_prefix: vi.fn(), storage_blob_keys: vi.fn(),
    };
    const store = createPywebviewAdapter(api).records("demos");
    expect(await store.get("missing")).toBeUndefined();
    expect(await store.get("existing")).toEqual({ id: "existing" });
    expect(await store.get("false-record")).toBe(false);
  });
});
