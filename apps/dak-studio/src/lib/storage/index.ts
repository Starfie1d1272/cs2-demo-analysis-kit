/**
 * 存储接缝单例。业务层一律 `getStorage().records(...)` / `.blobs(...)`，
 * 永不直接 `indexedDB`。
 *
 * 换后端只动这一处：未来检测到 `window.pywebview.api`（桌面壳）时返回
 * bridge + SQLite/文件系统 适配器；浏览器/dev 仍走 IndexedDB。
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
