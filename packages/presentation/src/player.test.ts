import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import { buildSeasonCohort } from "@cs2dak/cohort";
import { playerSeasonProfileSchema } from "@cs2dak/contract";
import { buildAllPlayerSeasonProfiles, buildPlayerSeasonProfile } from "./index";

const fixtureDir = fileURLToPath(new URL("../../../fixtures/input/cohort", import.meta.url));
const integrationTimeoutMs = 20_000;
let cohortFixtures: ReturnType<typeof buildCohort> | null = null;

async function buildCohort() {
  const names = (await readdir(fixtureDir)).filter((name) => name.endsWith(".zip")).sort();
  const demos = await Promise.all(
    names.map(async (name) => ({
      matchId: name.replace(/\.zip$/, ""),
      pkg: await loadDemoPackageFromZip(await readFile(join(fixtureDir, name)))
    }))
  );
  return buildSeasonCohort(demos);
}

function getCohort() {
  cohortFixtures ??= buildCohort();
  return cohortFixtures;
}

describe("buildPlayerSeasonProfile", () => {
  it(
    "derives a per-player profile covering rating, metrics, style and trend",
    async () => {
      const bundle = await getCohort();
      const profiles = buildAllPlayerSeasonProfiles(bundle);

      expect(profiles).toHaveLength(bundle.players.length);
      for (const profile of profiles) {
        expect(() => playerSeasonProfileSchema.parse(profile)).not.toThrow();
      }

      const source = bundle.players[0];
      const profile = buildPlayerSeasonProfile(bundle, source.playerKey);

      // 元信息与评分透传（不重算）
      expect(profile.version).toBe("cs2-demo-analysis-kit/player-profile-0.1");
      expect(profile.rating.rivalhubRR).toBe(source.accountRR);
      expect(profile.rating.hltvRating).toBe(source.rrV1);
      expect(profile.rating.hltvPercentile).toBe(source.rrV1Percentile);
      expect(profile.rating.breakdown.map((b) => b.key)).toEqual([
        "combat",
        "trade",
        "clutch",
        "objective",
        "utility"
      ]);
      expect(profile.weapons.reduce((sum, weapon) => sum + weapon.kills, 0)).toBe(source.weaponHighlights.totalKills);
      expect(profile.weapons.map((weapon) => weapon.kills)).toEqual(
        [...profile.weapons.map((weapon) => weapon.kills)].sort((a, b) => b - a)
      );
      expect(profile.highlights.noScopeKills).toBe(source.weaponHighlights.highlights.noScopeKills);
      expect(profile.highlights.wallbangKills).toBe(source.weaponHighlights.highlights.wallbangKills);

      // 每场趋势条数 == 该选手参与场次，且按 matchId 升序
      expect(profile.perMatch).toHaveLength(source.perMatch.length);
      const ids = profile.perMatch.map((m) => m.matchId);
      expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));

      // 中立性：不暴露数据库/路由字段
      expect(profile).not.toHaveProperty("userId");
    },
    integrationTimeoutMs
  );

  it(
    "exposes PRISM style as 8 ordered axes, or null when PRISM is missing",
    async () => {
      const bundle = await getCohort();
      const profiles = buildAllPlayerSeasonProfiles(bundle);

      for (const profile of profiles) {
        const source = bundle.players.find((p) => p.playerKey === profile.playerKey)!;
        if (source.prism == null) {
          expect(profile.style).toBeNull();
        } else {
          expect(profile.style).not.toBeNull();
          expect(profile.style!.axes).toHaveLength(8);
          // 风格轴顺序固定（PRISM_AXIS_ORDER）
          expect(profile.style!.axes.map((a) => a.key)).toEqual([
            "firepower",
            "opening",
            "clutch",
            "sniping",
            "survival",
            "utility",
            "trading",
            "entry"
          ]);
          for (const axis of profile.style!.axes) {
            expect(axis.percentile).toBeGreaterThanOrEqual(0);
            expect(axis.percentile).toBeLessThanOrEqual(100);
          }
        }
      }
    },
    integrationTimeoutMs
  );

  it("throws for an unknown playerKey", async () => {
    const bundle = await getCohort();
    expect(() => buildPlayerSeasonProfile(bundle, "steam:does-not-exist")).toThrow(/not found/);
  }, integrationTimeoutMs);
});
