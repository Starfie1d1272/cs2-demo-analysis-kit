export interface StorageCategory {
  id: "database" | "demos" | "cache" | "bundledEvents" | "tris" | "updates" | "reports" | "logs" | "backups";
  bytes: number;
  files: number;
  path: string;
}

export interface StorageOverview {
  ok: boolean;
  userdata: string;
  categories: StorageCategory[];
}

interface LibraryMaintenanceApi {
  storage_overview(): Promise<StorageOverview>;
  storage_backup(): Promise<{ ok: boolean; path?: string; demoCount?: number; error?: string }>;
  storage_restore(path?: string): Promise<{ ok: boolean; path?: string; restartRequired?: boolean; error?: string }>;
  storage_cleanup(category: string): Promise<{ ok: boolean; freedBytes?: number; error?: string }>;
  storage_repair(): Promise<{
    ok: boolean;
    integrity?: string;
    removedMissingBlobRecords?: number;
    removedOrphanBlobs?: number;
    error?: string;
  }>;
}

function api(): LibraryMaintenanceApi | null {
  const bridge = typeof window === "undefined"
    ? null
    : (window as typeof window & { pywebview?: { api?: Partial<LibraryMaintenanceApi> } }).pywebview?.api;
  return bridge?.storage_overview && bridge.storage_backup && bridge.storage_restore && bridge.storage_cleanup && bridge.storage_repair
    ? bridge as LibraryMaintenanceApi
    : null;
}

export function hasLibraryMaintenance(): boolean {
  return api() != null;
}

export async function loadStorageOverview(): Promise<StorageOverview | null> {
  return api()?.storage_overview() ?? null;
}

export async function backupLibrary() {
  return api()?.storage_backup() ?? { ok: false, error: "仅桌面版支持资料库备份" };
}

export async function restoreLibrary() {
  return api()?.storage_restore() ?? { ok: false, error: "仅桌面版支持资料库恢复" };
}

export async function cleanupStorage(category: StorageCategory["id"]) {
  return api()?.storage_cleanup(category) ?? { ok: false, error: "仅桌面版支持存储清理" };
}

export async function repairLibrary() {
  return api()?.storage_repair() ?? { ok: false, error: "仅桌面版支持资料库修复" };
}
