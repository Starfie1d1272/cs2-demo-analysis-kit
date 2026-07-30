import type { BlobStore, RecordStore, StorageAdapter } from "./types";

interface PywebviewStorageApi {
  storage_record_get(namespace: string, key: string): Promise<unknown>;
  storage_record_get_all(namespace: string): Promise<unknown[]>;
  storage_record_entries(namespace: string): Promise<Array<[string, unknown]>>;
  storage_record_get_prefix(namespace: string, prefix: string): Promise<Array<[string, unknown]>>;
  storage_record_keys(namespace: string): Promise<string[]>;
  storage_record_put(namespace: string, key: string, value: unknown): Promise<void>;
  storage_record_put_many(namespace: string, rows: Array<[string, unknown]>): Promise<void>;
  storage_record_delete(namespace: string, key: string): Promise<void>;
  storage_record_delete_prefix(namespace: string, prefix: string): Promise<void>;
  storage_blob_get(namespace: string, key: string): Promise<string | null>;
  storage_blob_put(namespace: string, key: string, dataBase64: string): Promise<void>;
  storage_blob_delete(namespace: string, key: string): Promise<void>;
  storage_blob_delete_prefix(namespace: string, prefix: string): Promise<void>;
  storage_blob_keys(namespace: string): Promise<string[]>;
}

export function getPywebviewStorageApi(): PywebviewStorageApi | null {
  const api = typeof window === "undefined"
    ? undefined
    : ((window as any).pywebview?.api as Partial<PywebviewStorageApi> | undefined);
  if (!api?.storage_record_get || !api.storage_blob_get) return null;
  return api as PywebviewStorageApi;
}

import { bytesToBase64, base64ToBytes } from "./base64";

/**
 * pywebview native 后端。待桌面验证：当前 CI/沙箱没有真实桌面壳，
 * 这里只做类型检查与浏览器 fallback 验证。
 */
export function createPywebviewAdapter(api: PywebviewStorageApi): StorageAdapter {
  const recordStores = new Map<string, RecordStore>();
  const blobStores = new Map<string, BlobStore>();

  return {
    records(namespace): RecordStore {
      let store = recordStores.get(namespace);
      if (!store) {
        store = {
          async get<T>(key: string) {
            return (await api.storage_record_get(namespace, key)) as T | undefined;
          },
          async getAll<T>() {
            return (await api.storage_record_get_all(namespace)) as T[];
          },
          async entries<T>() {
            return (await api.storage_record_entries(namespace)) as Array<[string, T]>;
          },
          async getByPrefix<T>(prefix: string) {
            return (await api.storage_record_get_prefix(namespace, prefix)) as Array<[string, T]>;
          },
          keys: () => api.storage_record_keys(namespace),
          put: (key, value) => api.storage_record_put(namespace, key, value),
          putMany: (rows) => api.storage_record_put_many(namespace, rows),
          delete: (key) => api.storage_record_delete(namespace, key),
          deleteByPrefix: (prefix) => api.storage_record_delete_prefix(namespace, prefix),
        };
        recordStores.set(namespace, store);
      }
      return store;
    },
    blobs(namespace) {
      let store = blobStores.get(namespace);
      if (!store) {
        store = {
          async get(key) {
            const data = await api.storage_blob_get(namespace, key);
            return data == null ? undefined : base64ToBytes(data);
          },
          put: (key, bytes) => api.storage_blob_put(namespace, key, bytesToBase64(bytes)),
          delete: (key) => api.storage_blob_delete(namespace, key),
          keys: () => api.storage_blob_keys(namespace),
          deleteByPrefix: (prefix) => api.storage_blob_delete_prefix(namespace, prefix),
        };
        blobStores.set(namespace, store);
      }
      return store;
    }
  };
}
