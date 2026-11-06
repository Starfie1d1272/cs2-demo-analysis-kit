import { getNativeStorageApiForCurrentAdapter } from './storage';

/** Serialize only a library commit, across windows sharing the same storage. */
export async function withLibraryCommit<T>(
  keys: string[],
  operation: () => Promise<T>,
): Promise<T> {
  // Analysis cache uses a single persistent dirty marker, so its short writes
  // and startup recovery must not overlap across windows.
  const ordered = [
    ...new Set(keys.some((key) => key.startsWith('match:')) ? [...keys, 'analysis-cache'] : keys),
  ].sort();
  if (!ordered.length) return operation();
  // Node’s test adapters do not have competing browser contexts.
  if (typeof window === 'undefined') return operation();
  const native = getNativeStorageApiForCurrentAdapter();
  if (native) {
    if (!native.storage_demo_commit_begin || !native.storage_demo_commit_end) {
      throw new Error('桌面程序不支持安全提交，请更新桌面程序后重试。');
    }
    const token = await native.storage_demo_commit_begin(ordered);
    try {
      return await operation();
    } finally {
      await native.storage_demo_commit_end(token);
    }
  }
  if (!navigator.locks) throw new Error('当前环境不支持安全的跨窗口提交，请使用桌面版。');
  const acquire = (index: number): Promise<T> =>
    index === ordered.length
      ? operation()
      : navigator.locks.request(`dak-library:${ordered[index]}`, () => acquire(index + 1));
  return acquire(0);
}
