import { describe, expect, it } from "vitest";
import type { StudioDemoEntry } from "../library";
import {
  LEGACY_IDB_MIGRATION_VERSION,
  migrateLegacyIdbToNative,
} from "./legacy-idb-migration";
import type { BlobStore, RecordStore, StorageAdapter } from "./types";

function memoryAdapter(options: { failRecordPut?: (namespace: string, key: string) => boolean } = {}): StorageAdapter {
  const recordNamespaces = new Map<string, Map<string, unknown>>();
  const blobNamespaces = new Map<string, Map<string, ArrayBuffer>>();
  const records = (namespace: string): RecordStore => {
    const values = recordNamespaces.get(namespace) ?? new Map<string, unknown>();
    recordNamespaces.set(namespace, values);
    return {
      async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined; },
      async getAll<T>() { return [...values.values()].map((value) => structuredClone(value)) as T[]; },
      async entries<T>() { return [...values].map(([key, value]) => [key, structuredClone(value)] as [string, T]); },
      async getByPrefix<T>(prefix: string) {
        return [...values].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)] as [string, T]);
      },
      async keys() { return [...values.keys()]; },
      async put<T>(key: string, value: T) {
        if (options.failRecordPut?.(namespace, key)) throw new Error(`injected write failure: ${namespace}/${key}`);
        values.set(key, structuredClone(value));
      },
      async putMany<T>(rows: Array<[string, T]>) {
        for (const [key, value] of rows) await this.put(key, value);
      },
      async delete(key: string) { values.delete(key); },
      async deleteByPrefix(prefix: string) {
        for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
      },
    };
  };
  const blobs = (namespace: string): BlobStore => {
    const values = blobNamespaces.get(namespace) ?? new Map<string, ArrayBuffer>();
    blobNamespaces.set(namespace, values);
    return {
      async get(key: string) { return values.get(key)?.slice(0); },
      async put(key: string, bytes: ArrayBuffer) { values.set(key, bytes.slice(0)); },
      async delete(key: string) { values.delete(key); },
      async keys() { return [...values.keys()]; },
      async deleteByPrefix(prefix: string) {
        for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
      },
    };
  };
  return { records, blobs };
}

async function hash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function demoEntry(id: string, fileName: string, tags: string[] = []): StudioDemoEntry {
  return {
    id,
    fileName,
    importedAt: 1,
    tags,
    sourceDemPath: null,
    builtWith: { factsRevision: "legacy", formatVersion: "legacy" },
    producerStatuses: { "base-facts": "current" },
    sizeBytes: 4,
    meta: {
      mapName: "de_nuke",
      teamAName: "A",
      teamBName: "B",
      teamAScore: 13,
      teamBScore: 10,
      roundCount: 23,
      durationSeconds: 2_000,
      playerCount: 10,
      hasReplay: true,
      source: "test",
      serverName: null,
      matchDate: null,
    },
  };
}

async function seedDemo(adapter: StorageAdapter, bytes: ArrayBuffer, fileName: string, tags: string[] = []) {
  const id = await hash(bytes);
  await adapter.records("demos").put(id, demoEntry(id, fileName, tags));
  await adapter.blobs("demos").put(id, bytes);
  return id;
}

describe("legacy IndexedDB → native storage migration", () => {
  it("migrates an old desktop library into an empty native store and marks rebuildable producers missing", async () => {
    const legacy = memoryAdapter();
    const native = memoryAdapter();
    const id = await seedDemo(legacy, new Uint8Array([1, 2, 3, 4]).buffer, "old.zip", ["legacy"]);
    await legacy.records("training-focus").put("training:1", { id: "training:1", note: "keep me" });

    const result = await migrateLegacyIdbToNative({ legacy, native, now: () => 123 });

    expect(result.status).toBe("migrated");
    expect((await native.records("demos").get<StudioDemoEntry>(id))?.builtWith).toBeUndefined();
    expect((await native.records("demos").get<StudioDemoEntry>(id))?.producerStatuses?.["base-facts"]).toBe("missing");
    expect(await native.records("training-focus").get("training:1")).toEqual({ id: "training:1", note: "keep me" });
    expect(await native.blobs("demos").get(id)).toBeDefined();
    expect(await legacy.blobs("demos").get(id)).toBeDefined();
    expect(await native.records("storage-migrations").get(LEGACY_IDB_MIGRATION_VERSION)).toMatchObject({
      completedAt: 123,
      sourceDemoCount: 1,
    });
  });

  it("does not write the completion marker after a mid-migration failure and succeeds on retry", async () => {
    const legacy = memoryAdapter();
    let fail = true;
    const native = memoryAdapter({ failRecordPut: (namespace) => namespace === "identity" && fail });
    const id = await seedDemo(legacy, new Uint8Array([5, 6, 7, 8]).buffer, "retry.zip");
    await legacy.records("identity").put("current", { version: 1, mappings: [] });

    const failed = await migrateLegacyIdbToNative({ legacy, native });
    expect(failed.status).toBe("failed");
    expect(await native.records("storage-migrations").keys()).toEqual([]);
    expect(await native.blobs("demos").get(id)).toBeDefined();

    fail = false;
    const retried = await migrateLegacyIdbToNative({ legacy, native });
    expect(retried.status).toBe("migrated");
    expect(await native.records("identity").get("current")).toEqual({ version: 1, mappings: [] });
  });

  it("is a no-op after a verified migration completed", async () => {
    const legacy = memoryAdapter();
    const native = memoryAdapter();
    await seedDemo(legacy, new Uint8Array([9, 10, 11, 12]).buffer, "once.zip");

    expect((await migrateLegacyIdbToNative({ legacy, native })).status).toBe("migrated");
    expect((await migrateLegacyIdbToNative({ legacy, native })).status).toBe("already-complete");
  });

  it("merges old and native libraries by package hash without overwriting native analysis state", async () => {
    const legacy = memoryAdapter();
    const native = memoryAdapter();
    const sharedBytes = new Uint8Array([13, 14, 15, 16]).buffer;
    const sharedId = await seedDemo(legacy, sharedBytes, "shared-old-name.zip", ["legacy"]);
    await seedDemo(native, sharedBytes, "shared-native-name.zip", ["native"]);
    const nativeOnlyId = await seedDemo(native, new Uint8Array([17, 18, 19, 20]).buffer, "native-only.zip");
    await legacy.records("training-focus").put("legacy-focus", { id: "legacy-focus" });
    await native.records("training-focus").put("native-focus", { id: "native-focus" });

    const result = await migrateLegacyIdbToNative({ legacy, native });
    const shared = await native.records("demos").get<StudioDemoEntry>(sharedId);

    expect(result.status).toBe("migrated");
    expect(new Set(shared?.tags)).toEqual(new Set(["native", "legacy"]));
    expect(shared?.fileName).toBe("shared-native-name.zip");
    expect(shared?.producerStatuses?.["base-facts"]).toBe("current");
    expect(new Set(await native.records("demos").keys())).toEqual(new Set([sharedId, nativeOnlyId]));
    expect(new Set(await native.records("training-focus").keys())).toEqual(new Set(["legacy-focus", "native-focus"]));
  });

  it.each(["missing", "corrupt"] as const)("leaves the marker absent when a legacy ZIP is %s", async (kind) => {
    const legacy = memoryAdapter();
    const native = memoryAdapter();
    const bytes = new Uint8Array([21, 22, 23, 24]).buffer;
    const id = kind === "missing" ? await hash(bytes) : "0".repeat(64);
    await legacy.records("demos").put(id, demoEntry(id, `${kind}.zip`));
    if (kind === "corrupt") await legacy.blobs("demos").put(id, bytes);

    const result = await migrateLegacyIdbToNative({ legacy, native });

    expect(result.status).toBe("failed");
    expect(await native.records("storage-migrations").keys()).toEqual([]);
    expect(await native.records("demos").keys()).toEqual([]);
  });
});
