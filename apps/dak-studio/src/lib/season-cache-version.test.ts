import { describe, expect, it } from "vitest";
import { TACTICAL_FACT_VERSION } from "@cs2dak/core";
import {
  FACTS_REVISION,
  FACTS_STORAGE_VERSION,
} from "./analysis-manifest";
import { CACHE_VERSION, seasonCacheKey } from "./season";

describe("season aggregate cache version", () => {
  it("does not reuse v9 persisted profile caches", () => {
    expect(CACHE_VERSION).toBe(10);
    expect(seasonCacheKey([])).toBe(`v10:facts=${FACTS_REVISION}:`);
    expect(seasonCacheKey([])).not.toMatch(/^v9:/);
  });

  it("facts revision 变化时不复用已持久化聚合", () => {
    expect(FACTS_REVISION).toContain(`storage:${FACTS_STORAGE_VERSION}`);
    expect(FACTS_REVISION).toContain(`tactical:${TACTICAL_FACT_VERSION}`);
    expect(seasonCacheKey([], undefined, [], "stale")).not.toBe(seasonCacheKey([]));
  });
});
