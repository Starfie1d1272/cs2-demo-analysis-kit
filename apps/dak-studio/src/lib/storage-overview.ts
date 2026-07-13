import { getStorage } from "./storage";
import { FACTS_RECORD_NAMESPACES } from "./facts-store";
import { DERIVED_CACHE_RECORD_NAMESPACES } from "./derived-cache";

/**
 * 浏览器端（IndexedDB 后端）存储总览。
 *
 * 桌面端有 Python 提供的精确按字节分类（library-maintenance 的 storage_overview），
 * 浏览器/dev 端此前完全没有占用视图——本模块补齐：
 * - 真实总占用经 `navigator.storage.estimate()`（origin 级 usage/quota，便宜且准确）；
 * - 各逻辑分类只给"项数"（每个命名空间 = 独立 IDB 库，getAllKeys 不读值，便宜）；
 *   demo 原始 ZIP 字节用 entry.sizeBytes 汇总（导入时记录），免去把所有 ZIP 读进内存。
 * blob 类（tri）不读字节，仅计数，避免大文件读取尖峰。
 */

export interface BrowserStorageCategory {
  id: "demos" | "cache" | "tris" | "database";
  label: string;
  files: number;
  /** 已知字节数；不便宜计算时为 null（界面显示 —）。 */
  bytes: number | null;
}

export interface BrowserStorageOverview {
  estimate: { usage: number; quota: number } | null;
  categories: BrowserStorageCategory[];
}

/** 资料库元数据/设置等"数据库"类命名空间（非派生缓存、非原始字节）。 */
const DATABASE_NAMESPACES = [
  "demos", "identity", "identity-audit", "series", "series-settings",
  "playbook", "playlist", "map-pool-notes", "events", "kv",
];

const CACHE_NAMESPACES = [...FACTS_RECORD_NAMESPACES, ...DERIVED_CACHE_RECORD_NAMESPACES, "cache", "cache-meta"];

async function countKeys(namespaces: string[]): Promise<number> {
  const storage = getStorage();
  const counts = await Promise.all(
    namespaces.map(async (ns) => {
      try {
        return (await storage.records(ns).keys()).length;
      } catch {
        return 0;
      }
    })
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

export async function loadBrowserStorageOverview(demoSizeBytes: number, demoCount: number): Promise<BrowserStorageOverview> {
  let estimate: BrowserStorageOverview["estimate"] = null;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      estimate = { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    }
  } catch {
    estimate = null;
  }

  const storage = getStorage();
  const [triFiles, cacheFiles, dbFiles] = await Promise.all([
    storage.blobs("tri").keys().then((k) => k.length).catch(() => 0),
    countKeys(CACHE_NAMESPACES),
    countKeys(DATABASE_NAMESPACES),
  ]);

  return {
    estimate,
    categories: [
      { id: "demos", label: "原始 ZIP", files: demoCount, bytes: demoSizeBytes },
      { id: "cache", label: "派生缓存（facts）", files: cacheFiles, bytes: null },
      { id: "tris", label: ".tri 地图资产", files: triFiles, bytes: null },
      { id: "database", label: "资料库数据", files: dbFiles, bytes: null },
    ],
  };
}
