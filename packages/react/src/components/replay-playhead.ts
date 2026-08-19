export interface ReplayPlayheadStore {
  getSnapshot(): number;
  set(next: number): void;
  subscribe(listener: () => void): () => void;
}

/**
 * 连续回放位置的最小外部 store。
 *
 * 地图 token 直接订阅屏幕刷新率位置；控制条、roster 和离散装备状态只在
 * source frame 边界更新 React state，避免整棵 ReplayViewer 以 60 Hz 重渲染。
 */
export function createReplayPlayheadStore(initial = 0): ReplayPlayheadStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    set(next) {
      if (Object.is(value, next)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
