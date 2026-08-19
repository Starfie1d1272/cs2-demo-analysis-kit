import { describe, expect, it, vi } from "vitest";
import { createReplayPlayheadStore } from "./replay-playhead";

describe("createReplayPlayheadStore", () => {
  it("notifies continuous consumers without emitting duplicate snapshots", () => {
    const store = createReplayPlayheadStore(1);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set(1.25);
    store.set(1.25);
    expect(store.getSnapshot()).toBe(1.25);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.set(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
