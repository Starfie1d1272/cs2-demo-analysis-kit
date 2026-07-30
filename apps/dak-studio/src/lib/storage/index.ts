/**
 * 存储接缝单例。业务层一律 `getStorage().records(...)` / `.blobs(...)`，
 * 永不直接 `indexedDB`。
 *
 * 桌面入口会先等待 `pywebviewready`，因此这里检测到 bridge 后返回
 * SQLite/文件系统适配器；浏览器/dev 仍走 IndexedDB。
 */

import { createIdbAdapter } from "./idb-adapter";
import { createPywebviewAdapter, getPywebviewStorageApi } from "./pywebview-adapter";
import type { StorageAdapter } from "./types";

let adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (adapter) return adapter;
  const nativeApi = getPywebviewStorageApi();
  adapter = nativeApi ? createPywebviewAdapter(nativeApi) : createIdbAdapter();
  return adapter;
}

export type { StorageAdapter, RecordStore, BlobStore } from "./types";
