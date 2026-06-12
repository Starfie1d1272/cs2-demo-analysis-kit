import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip } from "../loader.js";
import { deriveAccountSignalsV2 } from "../signals.js";

/**
 * SP2 Trade 闭环端到端：de_ancient fixture 含 replay + 现役图动线，
 * 故 strategicIsolationDeaths 应可观测（非 null），接入 rival-rating 的
 * effectiveUntradedDeaths（rr-model.md §3.3）。
 */
describe("strategicIsolationDeaths wiring (de_ancient fixture)", () => {
  it("derives an observable (non-null, >= 0) credit for every player", async () => {
    const zip = await readFile(
      fileURLToPath(new URL("../../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)),
    );
    const pkg = await loadDemoPackageFromZip(zip);
    const signals = deriveAccountSignalsV2(pkg);

    expect(signals).toHaveLength(10);
    for (const s of signals) {
      expect(s.trade.strategicIsolationDeaths).not.toBeNull();
      expect(s.trade.strategicIsolationDeaths as number).toBeGreaterThanOrEqual(0);
      // credit 不应超过该选手的死亡数（抵扣项语义上界）
      expect(s.trade.strategicIsolationDeaths as number).toBeLessThanOrEqual(s.trade.deaths);
    }
  });

  it("returns null strategicIsolationDeaths when replay is absent (unobservable)", async () => {
    const zip = await readFile(
      fileURLToPath(new URL("../../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)),
    );
    const pkg = await loadDemoPackageFromZip(zip);
    const { replay: _, ...stripped } = pkg;
    const signals = deriveAccountSignalsV2(stripped);
    for (const s of signals) expect(s.trade.strategicIsolationDeaths).toBeNull();
  });
});
