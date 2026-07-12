import { describe, expect, it } from "vitest";
import { CACHE_VERSION, seasonCacheKey } from "./season";

describe("season aggregate cache version", () => {
  it("does not reuse v8 persisted profile caches", () => {
    expect(CACHE_VERSION).toBe(9);
    expect(seasonCacheKey([])).toBe("v9:");
    expect(seasonCacheKey([])).not.toMatch(/^v8:/);
  });
});
