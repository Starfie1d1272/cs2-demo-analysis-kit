/**
 * StorageAdapter 的 IndexedDB 实现（当前唯一后端）。
 *
 * 每个命名空间 = 一个独立 IndexedDB 数据库，内含单一 out-of-line objectStore "kv"。
 * 拆库（而非单库多 store）让命名空间可独立惰性创建，绕开 IndexedDB
 * "所有 objectStore 必须在 onupgradeneeded 一次性声明" 的限制。
 * record 与 blob 库名分别加 `dak:r:` / `dak:b:` 前缀避免撞名。
 */

import { createDbOpener, txRequest } from '../idb';
import type {
  BlobStore,
  RecordStore,
  AtomicStorageAdapter,
  RecordRef,
  RecordSnapshot,
  RecordMutation,
} from './types';

/** 写入成功只在整个事务提交后确认；请求成功后仍可能中止。 */
function commitWrite(db: IDBDatabase, write: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('写入事务已中止'));
    try {
      write(tx.objectStore('kv'));
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

function makeKv(dbName: string) {
  const open = createDbOpener(dbName, 1, (db) => {
    if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
  });
  return {
    async readRecords(refs: RecordRef[]): Promise<RecordSnapshot[]> {
      if (!refs.length) return [];
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readonly');
        const store = tx.objectStore('kv');
        const values = refs.map((ref) => ({
          ref,
          key: store.getKey(ref.key),
          value: store.get(ref.key),
        }));
        tx.oncomplete = () =>
          resolve(
            values.map(({ ref, key, value }) => ({
              ...ref,
              exists: key.result !== undefined,
              ...(key.result !== undefined ? { value: value.result } : {}),
            })),
          );
        tx.onabort = () => reject(tx.error ?? new Error('读取记录事务失败'));
        tx.onerror = () => reject(tx.error ?? new Error('读取记录事务失败'));
      });
    },
    async compareAndWriteRecords(
      expected: RecordSnapshot[],
      writes: RecordMutation[],
    ): Promise<boolean> {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        const reads = expected.map((item) => ({
          item,
          key: store.getKey(item.key),
          value: store.get(item.key),
        }));
        let matches = true;
        let remaining = reads.length * 2;
        const apply = () => {
          try {
            matches = reads.every(
              ({ item, key, value }) =>
                (key.result !== undefined) === item.exists &&
                (!item.exists || JSON.stringify(value.result) === JSON.stringify(item.value)),
            );
            if (matches)
              for (const write of writes) {
                if (write.kind === 'delete') store.delete(write.key);
                else store.put(write.value, write.key);
              }
          } catch (error) {
            tx.abort();
            reject(error);
          }
        };
        if (!remaining) apply();
        for (const read of reads) {
          read.key.onsuccess = read.value.onsuccess = () => {
            if (--remaining === 0) apply();
          };
        }
        tx.oncomplete = () => resolve(matches);
        tx.onabort = () => reject(tx.error ?? new Error('提交记录事务失败'));
        tx.onerror = () => reject(tx.error ?? new Error('提交记录事务失败'));
      });
    },
    async get<T>(key: string): Promise<T | undefined> {
      const db = await open();
      return txRequest(
        db.transaction('kv', 'readonly').objectStore('kv').get(key) as IDBRequest<T | undefined>,
      );
    },
    async getAll<T>(): Promise<T[]> {
      const db = await open();
      return txRequest(
        db.transaction('kv', 'readonly').objectStore('kv').getAll() as IDBRequest<T[]>,
      );
    },
    async entries<T>(): Promise<Array<[string, T]>> {
      const db = await open();
      const store = db.transaction('kv', 'readonly').objectStore('kv');
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
        db.transaction('kv', 'readonly').objectStore('kv').getAllKeys() as IDBRequest<
          IDBValidKey[]
        >,
      );
      return raw.map(String);
    },
    async put(key: string, value: unknown): Promise<void> {
      const db = await open();
      await commitWrite(db, (store) => {
        store.put(value, key);
      });
    },
    async delete(key: string): Promise<void> {
      const db = await open();
      await commitWrite(db, (store) => {
        store.delete(key);
      });
    },
    async deleteByPrefix(prefix: string): Promise<void> {
      const db = await open();
      const range = IDBKeyRange.bound(prefix, prefix + '￿');
      await commitWrite(db, (store) => {
        store.delete(range);
      });
    },
  };
}

export function createIdbAdapter(): AtomicStorageAdapter {
  const recordStores = new Map<string, RecordStore>();
  const recordDatabases = new Map<string, ReturnType<typeof makeKv>>();
  function recordDatabase(namespace: string) {
    let database = recordDatabases.get(namespace);
    if (!database) {
      database = makeKv(`dak:r:${namespace}`);
      recordDatabases.set(namespace, database);
    }
    return database;
  }
  const identityNamespaces = new Set([
    'identity',
    'role-declarations',
    'identity-audit',
    'identity-workspace',
  ]);
  function atomicDatabase(refs: RecordRef[]) {
    if (!refs.length) throw new Error('原子操作缺少记录');
    if (refs.every((ref) => identityNamespaces.has(ref.namespace))) {
      return {
        db: recordDatabase('identity-workspace'),
        map: (ref: RecordRef) => ({ ...ref, key: JSON.stringify([ref.namespace, ref.key]) }),
      };
    }
    const namespace = refs[0].namespace;
    if (refs.some((ref) => ref.namespace !== namespace || identityNamespaces.has(ref.namespace)))
      throw new Error('IndexedDB 不支持跨数据库原子事务');
    return { db: recordDatabase(namespace), map: (ref: RecordRef) => ref };
  }
  const blobStores = new Map<string, BlobStore>();

  return {
    async readRecords(refs) {
      if (!refs.length) return [];
      const { db, map } = atomicDatabase(refs);
      const rows = await db.readRecords(refs.map(map));
      return rows.map((row, i) => ({ ...row, ...refs[i] }));
    },
    compareAndWriteRecords(expected, writes) {
      const { db, map } = atomicDatabase([...expected, ...writes]);
      return db.compareAndWriteRecords(
        expected.map((row) => ({ ...row, ...map(row) })),
        writes.map((row) => ({ ...row, ...map(row) })),
      );
    },
    records(namespace: string): RecordStore {
      let store = recordStores.get(namespace);
      if (!store) {
        const kv = recordDatabase(namespace);
        store = {
          get: (key) => kv.get(key),
          getAll: () => kv.getAll(),
          entries: () => kv.entries(),
          keys: () => kv.keys(),
          put: (key, value) => kv.put(key, value),
          delete: (key) => kv.delete(key),
          deleteByPrefix: (prefix) => kv.deleteByPrefix(prefix),
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
          deleteByPrefix: (prefix) => kv.deleteByPrefix(prefix),
        };
        blobStores.set(namespace, store);
      }
      return store;
    },
  };
}
