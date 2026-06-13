/**
 * StorageAdapter 的 IndexedDB 实现（当前唯一后端）。
 *
 * 每个命名空间 = 一个独立 IndexedDB 数据库，内含单一 out-of-line objectStore "kv"。
 * 拆库（而非单库多 store）让命名空间可独立惰性创建，绕开 IndexedDB
 * "所有 objectStore 必须在 onupgradeneeded 一次性声明" 的限制。
 * record 与 blob 库名分别加 `dak:r:` / `dak:b:` 前缀避免撞名。
 */

import { createDbOpener, txRequest } from "../idb";
import type { BlobStore, RecordStore, StorageAdapter } from "./types";

function makeKv(dbName: string) {
  const open = createDbOpener(dbName, 1, (db) => {
    if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
  });
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const db = await open();
      return txRequest(
        db.transaction("kv", "readonly").objectStore("kv").get(key) as IDBRequest<T | undefined>
      );
    },
    async getAll<T>(): Promise<T[]> {
      const db = await open();
      return txRequest(
        db.transaction("kv", "readonly").objectStore("kv").getAll() as IDBRequest<T[]>
      );
    },
    async entries<T>(): Promise<Array<[string, T]>> {
      const db = await open();
      const store = db.transaction("kv", "readonly").objectStore("kv");
      // 同一 readonly 事务上同步发出两个请求，避免 await 后事务自动提交导致 InvalidStateError。
      const keysReq = store.getAllKeys() as IDBRequest<IDBValidKey[]>;
      const valsReq = store.getAll() as IDBRequest<T[]>;
      const rawKeys = await txRequest(keysReq);
      const vals = await txRequest(valsReq);
      return rawKeys.map((key, i) => [String(key), vals[i] as T]);
    },
    async keys(): Promise<string[]> {
      const db = await open();
      const raw = await txRequest(
        db.transaction("kv", "readonly").objectStore("kv").getAllKeys() as IDBRequest<IDBValidKey[]>
      );
      return raw.map(String);
    },
    async put(key: string, value: unknown): Promise<void> {
      const db = await open();
      await txRequest(db.transaction("kv", "readwrite").objectStore("kv").put(value, key));
    },
    async delete(key: string): Promise<void> {
      const db = await open();
      await txRequest(db.transaction("kv", "readwrite").objectStore("kv").delete(key));
    },
  };
}

export function createIdbAdapter(): StorageAdapter {
  const recordStores = new Map<string, RecordStore>();
  const blobStores = new Map<string, BlobStore>();

  return {
    records(namespace: string): RecordStore {
      let store = recordStores.get(namespace);
      if (!store) {
        const kv = makeKv(`dak:r:${namespace}`);
        store = {
          get: (key) => kv.get(key),
          getAll: () => kv.getAll(),
          entries: () => kv.entries(),
          keys: () => kv.keys(),
          put: (key, value) => kv.put(key, value),
          delete: (key) => kv.delete(key),
        };
        recordStores.set(namespace, store);
      }
      return store;
    },
    blobs(namespace: string): BlobStore {
      let store = blobStores.get(namespace);
      if (!store) {
        const kv = makeKv(`dak:b:${namespace}`);
        store = {
          get: (key) => kv.get<ArrayBuffer>(key),
          put: (key, bytes) => kv.put(key, bytes),
          delete: (key) => kv.delete(key),
          keys: () => kv.keys(),
        };
        blobStores.set(namespace, store);
      }
      return store;
    },
  };
}
