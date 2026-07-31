import type { StudioDemoEntry } from "../library";
import { createIdbAdapter } from "./idb-adapter";
import { createPywebviewAdapter, getPywebviewStorageApi } from "./pywebview-adapter";
import type { StorageAdapter } from "./types";

export const LEGACY_IDB_MIGRATION_VERSION = "idb-to-native/1";
const MARKER_KEY = LEGACY_IDB_MIGRATION_VERSION;
const MARKER_NAMESPACE = "storage-migrations";

/**
 * 仅包含不可从 ZIP 重建的用户数据与其旧兼容入口。
 * facts / derived / producer manifest / cache / RadarField / tri 明确不搬迁：
 * 新原生库中的 Demo 会标为 producer missing，由现有“重建 facts”入口恢复。
 */
export const LEGACY_TRUTH_RECORD_NAMESPACES = [
  "identity",
  "identity-audit",
  "events",
  "kv",
  "role-declarations",
  "practice-lineups",
  "series",
  "series-settings",
  "playbook",
  "prep-items",
  "playlist",
  "map-pool-notes",
  "training-focus",
] as const;

export const LEGACY_REBUILDABLE_NAMESPACES = [
  "facts:*",
  "derived:*",
  "producer-manifests",
  "facts:cohort_rows",
  "cache",
  "cache-meta",
  "radar_field",
  "tri",
] as const;

const PRODUCERS = [
  "base-facts",
  "duel",
  "tactical",
  "map-intelligence",
  "utility",
  "radar-field",
] as const;

export interface LegacyIdbMigrationMarker {
  version: typeof LEGACY_IDB_MIGRATION_VERSION;
  completedAt: number;
  sourceDemoCount: number;
  recordCounts: Record<string, number>;
  rebuildableNamespaces: readonly string[];
}

export type LegacyIdbMigrationResult =
  | { status: "not-desktop" | "no-data" | "already-complete" }
  | { status: "migrated"; marker: LegacyIdbMigrationMarker }
  | { status: "failed"; error: string };

interface MigrationOptions {
  legacy: StorageAdapter;
  native: StorageAdapter;
  now?: () => number;
  onProgress?: (message: string) => void;
}

let lastResult: LegacyIdbMigrationResult | null = null;

export function getLegacyIdbMigrationResult(): LegacyIdbMigrationResult | null {
  return lastResult;
}

function canonicalJson(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const rows = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${rows.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

async function sha256Hex(bytes: ArrayBuffer | string): Promise<string> {
  const input = typeof bytes === "string" ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function migratedDemoEntry(entry: StudioDemoEntry): StudioDemoEntry {
  return {
    ...structuredClone(entry),
    builtWith: undefined,
    producerStatuses: Object.fromEntries(PRODUCERS.map((producer) => [producer, "missing"])),
  };
}

function mergeDemoEntry(native: StudioDemoEntry, legacy: StudioDemoEntry): StudioDemoEntry {
  return {
    ...native,
    tags: [...new Set([...(native.tags ?? []), ...(legacy.tags ?? [])])],
    sourceDemPath: native.sourceDemPath ?? legacy.sourceDemPath ?? null,
    sizeBytes: native.sizeBytes ?? legacy.sizeBytes,
    meta: {
      ...native.meta,
      matchDate: native.meta.matchDate ?? legacy.meta.matchDate ?? null,
      serverName: native.meta.serverName ?? legacy.meta.serverName ?? null,
    },
  };
}

async function preflightLegacyDemos(
  legacy: StorageAdapter,
): Promise<Array<{ key: string; entry: StudioDemoEntry; bytes: ArrayBuffer }>> {
  const rows = await legacy.records("demos").entries<StudioDemoEntry>();
  const result = [];
  for (const [key, entry] of rows) {
    if (!entry || entry.id !== key) throw new Error(`旧资料库 Demo 元数据损坏：${key}`);
    const bytes = await legacy.blobs("demos").get(key);
    if (!bytes) throw new Error(`旧资料库 ZIP 缺失：${entry.fileName}`);
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== key) throw new Error(`旧资料库 ZIP 校验失败：${entry.fileName}`);
    result.push({ key, entry, bytes });
  }
  return result;
}

async function copyTruthNamespace(
  namespace: string,
  legacy: StorageAdapter,
  native: StorageAdapter,
): Promise<Array<[string, unknown]>> {
  const sourceRows = await legacy.records(namespace).entries<unknown>();
  const target = native.records(namespace);
  for (const [key, value] of sourceRows) {
    const existing = await target.get<unknown>(key);
    if (existing === undefined) {
      await target.put(key, structuredClone(value));
      continue;
    }
    const [existingHash, sourceHash] = await Promise.all([
      sha256Hex(canonicalJson(existing)),
      sha256Hex(canonicalJson(value)),
    ]);
    if (existingHash !== sourceHash) {
      throw new Error(`原生库与旧资料库存在同键冲突，未覆盖：${namespace}/${key}`);
    }
  }
  return sourceRows;
}

export async function migrateLegacyIdbToNative(options: MigrationOptions): Promise<LegacyIdbMigrationResult> {
  const { legacy, native, now = Date.now, onProgress } = options;
  const markerStore = native.records(MARKER_NAMESPACE);
  if (await markerStore.get<LegacyIdbMigrationMarker>(MARKER_KEY)) {
    return { status: "already-complete" };
  }

  try {
    const sourceDemos = await preflightLegacyDemos(legacy);
    if (sourceDemos.length === 0) return { status: "no-data" };
    onProgress?.(`正在迁移旧资料库（${sourceDemos.length} 场 Demo）…`);

    const nativeDemoMeta = native.records("demos");
    const nativeDemoBlobs = native.blobs("demos");
    const expectedDemos = new Map<string, StudioDemoEntry>();
    for (const source of sourceDemos) {
      const [existingEntry, existingBytes] = await Promise.all([
        nativeDemoMeta.get<StudioDemoEntry>(source.key),
        nativeDemoBlobs.get(source.key),
      ]);
      if (existingBytes) {
        const existingHash = await sha256Hex(existingBytes);
        if (existingHash !== source.key) throw new Error(`原生库 ZIP 校验失败，未覆盖：${source.entry.fileName}`);
      } else {
        await nativeDemoBlobs.put(source.key, source.bytes.slice(0));
      }
      const expected = existingEntry
        ? mergeDemoEntry(existingEntry, source.entry)
        : migratedDemoEntry(source.entry);
      await nativeDemoMeta.put(source.key, expected);
      expectedDemos.set(source.key, expected);
    }

    const copiedRecords = new Map<string, Array<[string, unknown]>>();
    for (const namespace of LEGACY_TRUTH_RECORD_NAMESPACES) {
      const rows = await copyTruthNamespace(namespace, legacy, native);
      copiedRecords.set(namespace, rows);
    }

    onProgress?.("正在校验迁移结果…");
    for (const [key, expected] of expectedDemos) {
      const [entry, bytes] = await Promise.all([
        nativeDemoMeta.get<StudioDemoEntry>(key),
        nativeDemoBlobs.get(key),
      ]);
      if (!entry || canonicalJson(entry) !== canonicalJson(expected)) {
        throw new Error(`迁移后 Demo 元数据校验失败：${key}`);
      }
      if (!bytes || await sha256Hex(bytes) !== key) throw new Error(`迁移后 ZIP 校验失败：${key}`);
    }
    for (const [namespace, rows] of copiedRecords) {
      const target = native.records(namespace);
      for (const [key, expected] of rows) {
        const actual = await target.get<unknown>(key);
        if (actual === undefined || await sha256Hex(canonicalJson(actual)) !== await sha256Hex(canonicalJson(expected))) {
          throw new Error(`迁移后记录校验失败：${namespace}/${key}`);
        }
      }
      if ((await target.keys()).length < rows.length) throw new Error(`迁移后记录数量不足：${namespace}`);
    }

    const marker: LegacyIdbMigrationMarker = {
      version: LEGACY_IDB_MIGRATION_VERSION,
      completedAt: now(),
      sourceDemoCount: sourceDemos.length,
      recordCounts: Object.fromEntries([...copiedRecords].map(([namespace, rows]) => [namespace, rows.length])),
      rebuildableNamespaces: LEGACY_REBUILDABLE_NAMESPACES,
    };
    // 这是唯一的完成提交点；以上任一步失败都不会留下“已迁移”假象。
    await markerStore.put(MARKER_KEY, marker);
    return { status: "migrated", marker };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function migrateLegacyDesktopStorage(
  onProgress?: (message: string) => void,
): Promise<LegacyIdbMigrationResult> {
  const api = getPywebviewStorageApi();
  if (!api) return (lastResult = { status: "not-desktop" });
  lastResult = await migrateLegacyIdbToNative({
    legacy: createIdbAdapter(),
    native: createPywebviewAdapter(api),
    onProgress,
  });
  return lastResult;
}
