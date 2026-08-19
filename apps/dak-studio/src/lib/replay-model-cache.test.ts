import { describe, expect, it } from "vitest";
import { ReplayModelCache } from "./replay-model-cache";

describe("ReplayModelCache", () => {
  it("deduplicates in-flight loads and respects the LRU entry budget", async () => {
    const cache = new ReplayModelCache<{ id: string }>(2, 1024);
    let loads = 0;
    const loader = async () => { loads += 1; return { id: "a" }; };
    await Promise.all([cache.load("a", loader), cache.load("a", loader)]);
    await cache.load("b", async () => ({ id: "b" }));
    await cache.load("c", async () => ({ id: "c" }));
    expect(loads).toBe(1);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it("does not evict the active model while applying a budget", async () => {
    const cache = new ReplayModelCache<{ payload: string }>(1, 64);
    cache.setActive("active");
    await cache.load("active", async () => ({ payload: "x".repeat(100) }));
    await cache.load("other", async () => ({ payload: "y".repeat(100) }));
    expect(cache.get("active")).toBeDefined();
  });

  it("supports explicit invalidation without serializing the cached value", async () => {
    let estimates = 0;
    const cache = new ReplayModelCache<{ frames: number[] }>(3, 1024, (value) => {
      estimates += 1;
      return value.frames.length * 8;
    });
    await cache.load("match", async () => ({ frames: [1, 2, 3] }));
    expect(cache.estimatedBytes).toBe(24);
    expect(estimates).toBe(1);

    cache.invalidate("match");
    expect(cache.get("match")).toBeUndefined();
  });
});
