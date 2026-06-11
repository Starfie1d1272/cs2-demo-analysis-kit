import { describe, expect, it } from "vitest";
import { leaderboardMetricKeySchema, seasonLeaderboardModelSchema } from "@cs2dak/contract";
import { buildSeasonLeaderboardModel } from "./index";
import { buildTestSeasonCohortBundle } from "./test-fixtures";

const ALL_METRIC_KEYS = leaderboardMetricKeySchema.options;

describe("buildSeasonLeaderboardModel", () => {
  it("derives a product-neutral leaderboard model from a season cohort bundle", () => {
    const bundle = buildTestSeasonCohortBundle();
    const model = buildSeasonLeaderboardModel(bundle);

    // schema 自校验 + 元信息透传
    expect(() => seasonLeaderboardModelSchema.parse(model)).not.toThrow();
    expect(model.version).toBe("cs2-demo-analysis-kit/leaderboard-0.1");
    expect(model.matchCount).toBe(bundle.matchCount);
    expect(model.weightsVersion).toBe(bundle.weightsVersion);
    expect(model.provenance).toEqual(bundle.provenance);

    // 视图：core/impact/advanced，无独立 Demo tab
    expect(model.views.map((v) => v.key)).toEqual(["core", "impact", "advanced"]);
    for (const view of model.views) {
      // 默认排序列必须真实存在于该视图
      expect(view.columns.some((c) => c.key === view.defaultSort)).toBe(true);
    }

    // 每行覆盖全部玩家，且每个指标 key 都有条目（可为 null，但不缺）
    expect(model.rows).toHaveLength(bundle.players.length);
    for (const row of model.rows) {
      for (const key of ALL_METRIC_KEYS) {
        expect(row.metrics).toHaveProperty(key);
      }
      // 中立性：不暴露数据库/路由字段，只有中立 key
      expect(row).not.toHaveProperty("userId");
    }
  });

  it("preserves null instead of coercing to 0, and matches cohort source values", () => {
    const bundle = buildTestSeasonCohortBundle();
    const model = buildSeasonLeaderboardModel(bundle);

    const byKey = new Map(model.rows.map((row) => [row.playerKey, row]));
    for (const player of bundle.players) {
      const row = byKey.get(player.playerKey)!;
      // 不重算：rate 字段直接透传 cohort 已重算的值
      expect(row.metrics.rivalhubRR).toBe(player.accountRR);
      expect(row.metrics.hltvRating).toBe(player.rrV1);
      expect(row.metrics.adr).toBe(player.indicators.adr);
      expect(row.metrics.kast).toBe(player.indicators.kast);
      // K/D：deaths=0 必须为 null 而非 0/Infinity
      if (player.indicators.deaths === 0) {
        expect(row.metrics.kd).toBeNull();
      } else {
        expect(row.metrics.kd).toBeCloseTo(player.indicators.kills / player.indicators.deaths, 1);
      }
    }
  });
});
