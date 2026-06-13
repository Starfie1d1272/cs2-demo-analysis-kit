/**
 * StorageAdapter：业务层与具体持久化后端（今天 IndexedDB，未来 SQLite + 文件系统）
 * 之间的唯一接缝。业务模块（library / season / tri / identity / series / pin）只认本接口，
 * 不再直接调用 `indexedDB`。换后端 = 换 `getStorage()` 返回的实现，业务层零改动。
 *
 * 两类原语，对应未来 SQLite 方案的两种落点：
 * - RecordStore：JSON 记录 → 未来 SQLite 行（元数据 / 派生缓存 / 设置）。
 * - BlobStore：二进制字节 → 未来磁盘文件（原始 ZIP / .tri 几何）。
 *
 * key 一律显式传入（out-of-line）：屏蔽 IndexedDB keyPath 内联键的差异，
 * SQLite/FS 适配器也用显式主键，语义一致。
 */

/** 按 key 存取 JSON 记录的命名空间。 */
export interface RecordStore {
  get<T>(key: string): Promise<T | undefined>;
  /** 取该命名空间全部值（无序）。 */
  getAll<T>(): Promise<T[]>;
  /** 取该命名空间全部 [key, value] 对（无序）。 */
  entries<T>(): Promise<Array<[string, T]>>;
  keys(): Promise<string[]>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

/** 按 key 存取二进制字节的命名空间。 */
export interface BlobStore {
  get(key: string): Promise<ArrayBuffer | undefined>;
  put(key: string, bytes: ArrayBuffer): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface StorageAdapter {
  /** JSON 记录命名空间（如 "demos" / "derived" / "cache" / "identity" / "series" / "kv"）。 */
  records(namespace: string): RecordStore;
  /** 二进制命名空间（如 "demos"=ZIP 字节 / "tri"=.tri 字节）。 */
  blobs(namespace: string): BlobStore;
}
