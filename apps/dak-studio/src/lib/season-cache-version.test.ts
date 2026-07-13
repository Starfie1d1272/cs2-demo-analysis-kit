import { describe, expect, it } from "vitest";
import { MAP_INTELLIGENCE_FACT_VERSION, TACTICAL_FACT_VERSION } from "@cs2dak/core";
import {
  FACTS_REVISION,
  FACTS_STORAGE_VERSION,
} from "./analysis-manifest";
import { CACHE_VERSION, seasonCacheKey } from "./season";

describe("season aggregate cache version", () => {
  it("does not reuse v10 persisted profile caches", () => {
    expect(CACHE_VERSION).toBe(11);
    expect(seasonCacheKey([])).toBe(`v11:facts=${FACTS_REVISION}:`);
    expect(seasonCacheKey([])).not.toMatch(/^v10:/);
  });

  it("facts revision 变化时不复用已持久化聚合", () => {
    expect(FACTS_REVISION).toContain(`storage:${FACTS_STORAGE_VERSION}`);
    expect(FACTS_REVISION).toContain(`tactical:${TACTICAL_FACT_VERSION}`);
    expect(FACTS_REVISION).toContain(`mapIntelligence:${MAP_INTELLIGENCE_FACT_VERSION}`);
    expect(seasonCacheKey([], undefined, [], "stale")).not.toBe(seasonCacheKey([]));
  });
});
