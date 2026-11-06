/**
 * 存储接缝单例。业务层一律 `getStorage().records(...)` / `.blobs(...)`，
 * 永不直接 `indexedDB`。
 *
 * 换后端只动这一处：未来检测到 `window.pywebview.api`（桌面壳）时返回
 * bridge + SQLite/文件系统 适配器；浏览器/dev 仍走 IndexedDB。
 */

import { createIdbAdapter } from './idb-adapter';
import { createPywebviewAdapter, getPywebviewStorageApi } from './pywebview-adapter';
import type { AtomicStorageAdapter } from './types';

let adapter: AtomicStorageAdapter | null = null;
let nativeApiForAdapter: ReturnType<typeof getPywebviewStorageApi> = null;

export function getStorage(): AtomicStorageAdapter {
  if (adapter) return adapter;
  nativeApiForAdapter = getPywebviewStorageApi();
  adapter = nativeApiForAdapter ? createPywebviewAdapter(nativeApiForAdapter) : createIdbAdapter();
  return adapter;
}

/** 返回存储单例实际使用的原生桥接，供一次性数据接管选择来源。 */
export function getNativeStorageApiForCurrentAdapter(): ReturnType<typeof getPywebviewStorageApi> {
  getStorage();
  return nativeApiForAdapter;
}

export type { StorageAdapter, RecordStore, BlobStore } from './types';
