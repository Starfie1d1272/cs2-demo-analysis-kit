import { normalizeDiagnostic } from "@cs2dak/rivalhub-upload";
import { FACTS_RECORD_NAMESPACES } from "./facts-store";
import { DERIVED_CACHE_RECORD_NAMESPACES, LEGACY_DERIVED_RECORD_NAMESPACES } from "./derived-cache";
import { isMatchRowKey, settleWrites } from "./storage/match-rows";
import type { StorageAdapter } from "./storage";

function sameBytes(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const current = new Uint8Array(right);
  return new Uint8Array(left).every((byte, index) => byte === current[index]);
}

/** A runtime undo checkpoint, not a cross-backend crash-safe transaction. */
export async function withImportCheckpoint(
  adapter: StorageAdapter,
  entryIds: string[],
  matchIds: string[],
  operation: () => Promise<void>,
): Promise<void> {
  const namespaces = [...FACTS_RECORD_NAMESPACES, ...DERIVED_CACHE_RECORD_NAMESPACES, ...LEGACY_DERIVED_RECORD_NAMESPACES, "facts:cohort_rows", "analysis:retired-match-ids"];
  const snapshots = await Promise.all(namespaces.map(async (namespace) => {
    const store = adapter.records(namespace);
    const matches = (key: string) => matchIds.some((id) => isMatchRowKey(key, id));
    const before = (await store.entries()).filter(([key]) => matches(key));
    return { store, matches, before };
  }));
  const meta = adapter.records("demos");
  const blobs = adapter.blobs("demos");
  const entries = await Promise.all([...new Set(entryIds)].map(async (id) => ({
    id, record: await meta.get(id), bytes: await blobs.get(id),
  })));
  try {
    await operation();
  } catch (error) {
    // Every producer write must have settled before operation rejects.
    const restored = await Promise.allSettled(snapshots.map(async ({ store, matches, before }) => {
      const current = new Map((await store.entries()).filter(([key]) => matches(key)));
      const original = new Map(before);
      await settleWrites([...current.keys()].filter((key) => !original.has(key)).map((key) => store.delete(key)));
      await settleWrites(before.filter(([key, value]) => !current.has(key) || JSON.stringify(current.get(key)) !== JSON.stringify(value))
        .map(([key, value]) => store.put(key, value)));
    }));
    // Remove newly created candidates before restoring changed old blobs. Do not
    // rewrite an untouched old ZIP on a quota/permission failure elsewhere.
    const restoredCandidates = await Promise.allSettled(entries.filter(({ record, bytes }) => record === undefined && bytes === undefined).map(async ({ id }) => {
      if (await blobs.get(id) !== undefined) await blobs.delete(id);
      if (await meta.get(id) !== undefined) await meta.delete(id);
    }));
    const restoredEntries = await Promise.allSettled(entries.filter(({ record, bytes }) => record !== undefined || bytes !== undefined).map(async ({ id, record, bytes }) => {
      const currentBytes = await blobs.get(id);
      if (bytes === undefined) {
        if (currentBytes !== undefined) await blobs.delete(id);
      } else if (!currentBytes || currentBytes.byteLength !== bytes.byteLength ||
        !sameBytes(bytes, currentBytes)) {
        await blobs.put(id, bytes);
      }
      const currentRecord = await meta.get(id);
      if (record === undefined) {
        if (currentRecord !== undefined) await meta.delete(id);
      } else if (JSON.stringify(currentRecord) !== JSON.stringify(record)) await meta.put(id, record);
    }));
    const failures = [...restored, ...restoredCandidates, ...restoredEntries].filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw Object.assign(new AggregateError([error, ...failures.map((failure) => failure.reason)],
      `Demo 导入失败：${normalizeDiagnostic(error).message}；部分旧记录无法恢复：${normalizeDiagnostic(failures[0].reason).message}；请保留 ZIP 并导出日志`),
    { code: "IMPORT_ROLLBACK_FAILED", stage: "import.rollback" });
    throw error;
  }
}
