import { describe, expect, it, vi } from "vitest";
import { createPywebviewAdapter, type PywebviewStorageApi } from "./pywebview-adapter";

function apiReturning(value: unknown): PywebviewStorageApi {
  return {
    storage_record_get: vi.fn().mockResolvedValue(value),
    storage_record_get_all: vi.fn().mockResolvedValue([]),
    storage_record_entries: vi.fn().mockResolvedValue([]),
    storage_record_get_prefix: vi.fn().mockResolvedValue([]),
    storage_record_keys: vi.fn().mockResolvedValue([]),
    storage_record_put: vi.fn().mockResolvedValue(undefined),
    storage_record_put_many: vi.fn().mockResolvedValue(undefined),
    storage_record_delete: vi.fn().mockResolvedValue(undefined),
    storage_record_delete_prefix: vi.fn().mockResolvedValue(undefined),
    storage_blob_get: vi.fn().mockResolvedValue(null),
    storage_blob_put: vi.fn().mockResolvedValue(undefined),
    storage_blob_delete: vi.fn().mockResolvedValue(undefined),
    storage_blob_delete_prefix: vi.fn().mockResolvedValue(undefined),
    storage_blob_keys: vi.fn().mockResolvedValue([]),
  };
}

describe("createPywebviewAdapter", () => {
  it("normalizes Python None to the RecordStore missing-key contract", async () => {
    const store = createPywebviewAdapter(apiReturning(null)).records("kv");
    await expect(store.get("missing")).resolves.toBeUndefined();
  });

  it("preserves existing JSON record values", async () => {
    const value = { source: "native" };
    const store = createPywebviewAdapter(apiReturning(value)).records("kv");
    await expect(store.get("present")).resolves.toEqual(value);
  });
});
