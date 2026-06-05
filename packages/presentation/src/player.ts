import { PRISM_AXIS_ORDER, type PrismAxisKey } from "@rivalhub/rival-rating";
import {
  playerSeasonProfileSchema,
  type LeaderboardMetricKey,
  type PlayerSeasonProfile,
  type RRBreakdownEntry,
  type SeasonCohortBundle,
  type SeasonPlayerRow
} from "@cs2dak/contract";
import { computeSeasonMetrics, round } from "./season-metrics.js";
import { displayWeaponName } from "./weapons.js";

/** RR 账户分解标签（与 Match Workspace 的 rrBreakdown 一致）。 */
const RR_BREAKDOWN_LABEL: Record<RRBreakdownEntry["key"], string> = {
  combat: "Combat",
  trade: "Trade",
  mapControl: "MapControl",
  clutch: "Clutch",
  objective: "Objective",
  utility: "Utility"
};

/** PRISM 八维中文标签。 */
const PRISM_AXIS_LABEL: Record<PrismAxisKey, string> = {
  firepower: "火力",
  opening: "首杀",
  clutch: "残局",
  sniping: "狙击",
  survival: "生存",
  utility: "道具",
  trading: "补枪",
  entry: "突破"
};

/** 用于强项/弱项判定的技能类指标（高 = 好）。不含纯风格标签（如 AWP）。 */
const SKILL_METRICS: { key: LeaderboardMetricKey; label: string }[] = [
  { key: "adr", label: "输出 (ADR)" },
  { key: "kast", label: "回合参与 (KAST)" },
  { key: "kd", label: "对枪交换 (K/D)" },
  { key: "hsPercent", label: "爆头率" },
  { key: "openingDuelWinRate", label: "首杀对枪 (Entry)" },
  { key: "multiKillPer100", label: "多杀产量" }
];

const STRENGTH_PERCENTILE = 70;
const WEAKNESS_PERCENTILE = 30;
const MIN_COHORT_FOR_NARRATIVE = 5;
const MAX_NARRATIVE_ITEMS = 3;

/** value 在分布中的百分位（≤ 计数 / 总数 × 100）。 */
function percentileOf(value: number, distribution: number[]): number {
  if (distribution.length === 0) return 0;
  const atOrBelow = distribution.filter((v) => v <= value).length;
  return round((atOrBelow / distribution.length) * 100, 1);
}

function buildStyle(player: SeasonPlayerRow): PlayerSeasonProfile["style"] {
  const prism = player.prism;
  if (!prism) return null;
  return {
    weightsVersion: prism.weightsVersion,
    rrPercentile: prism.rrPercentile,
    axes: PRISM_AXIS_ORDER.map((key) => ({
      key,
      label: PRISM_AXIS_LABEL[key],
      percentile: prism.axes[key].percentile
    }))
  };
}

function profileFromRow(
  player: SeasonPlayerRow,
  metrics: Record<LeaderboardMetricKey, number | null>,
  weightsVersion: string,
  strengths: string[],
  weaknesses: string[]
): PlayerSeasonProfile {
  const percent = (count: number, total: number): number | null =>
    total > 0 ? round((count / total) * 100, 1) : null;

  return playerSeasonProfileSchema.parse({
    version: "cs2-demo-analysis-kit/player-profile-0.1",
    weightsVersion,
    playerKey: player.playerKey,
    name: player.name,
    steamIds: player.steamIds,
    externalUserId: player.externalUserId,
    teamKeys: player.teamKeys,
    mapCount: player.mapCount,
    confidence: player.confidence,
    accountContextStatus: player.accountContextStatus,
    rating: {
      rivalhubRR: player.accountRR,
      rivalhubRRRaw: player.accountRRRaw,
      hltvRating: player.rrV1,
      hltvPercentile: player.rrV1Percentile,
      breakdown: (Object.keys(RR_BREAKDOWN_LABEL) as RRBreakdownEntry["key"][]).map((key) => ({
        key,
        label: RR_BREAKDOWN_LABEL[key],
        value: player.accountBreakdown[key]
      }))
    },
    metrics,
    weapons: player.weaponHighlights.weapons.map((weapon) => ({
      weapon: weapon.weapon,
      label: displayWeaponName(weapon.weapon),
      kills: weapon.kills,
      killSharePercent: player.weaponHighlights.totalKills > 0
        ? round((weapon.kills / player.weaponHighlights.totalKills) * 100, 1)
        : 0,
      headshotPercent: percent(weapon.headshotKills, weapon.kills),
      tradeKillPercent: percent(weapon.tradeKills, weapon.kills),
      noScopePercent: percent(weapon.noScopeKills, weapon.kills),
      throughSmokePercent: percent(weapon.throughSmokeKills, weapon.kills),
      wallbangPercent: percent(weapon.wallbangKills, weapon.kills),
      averagePenetratedObjects: weapon.kills > 0
        ? round(weapon.penetratedObjects / weapon.kills, 2)
        : null
    })),
    highlights: player.weaponHighlights.highlights,
    style: buildStyle(player),
    perMatch: [...player.perMatch]
      .sort((a, b) => a.matchId.localeCompare(b.matchId))
      .map((m) => ({ matchId: m.matchId, rivalhubRR: m.accountRR, hltvRating: m.rrV1 })),
    strengths,
    weaknesses
  });
}

/**
 * 为赛季 cohort 中每个选手派生档案。强项/弱项相对该 cohort 计算（技能类指标百分位）。
 * 纯转换 + cohort 内部排名总结，不算评分公式。
 */
export function buildAllPlayerSeasonProfiles(bundle: SeasonCohortBundle): PlayerSeasonProfile[] {
  const metricsByKey = new Map(bundle.players.map((p) => [p.playerKey, computeSeasonMetrics(p)]));

  // 每个技能指标在 cohort 内的取值分布（剔除 null）。
  const distribution = new Map<LeaderboardMetricKey, number[]>(
    SKILL_METRICS.map(({ key }) => [
      key,
      bundle.players
        .map((p) => metricsByKey.get(p.playerKey)![key])
        .filter((v): v is number => v != null)
    ])
  );

  const cohortLargeEnough = bundle.players.length >= MIN_COHORT_FOR_NARRATIVE;

  return bundle.players.map((player) => {
    const metrics = metricsByKey.get(player.playerKey)!;

    const ranked = cohortLargeEnough
      ? SKILL_METRICS.map(({ key, label }) => {
          const value = metrics[key];
          if (value == null) return null;
          return { label, percentile: percentileOf(value, distribution.get(key)!) };
        }).filter((x): x is { label: string; percentile: number } => x != null)
      : [];

    const strengths = ranked
      .filter((r) => r.percentile >= STRENGTH_PERCENTILE)
      .sort((a, b) => b.percentile - a.percentile)
      .slice(0, MAX_NARRATIVE_ITEMS)
      .map((r) => r.label);
    const weaknesses = ranked
      .filter((r) => r.percentile <= WEAKNESS_PERCENTILE)
      .sort((a, b) => a.percentile - b.percentile)
      .slice(0, MAX_NARRATIVE_ITEMS)
      .map((r) => r.label);

    return profileFromRow(player, metrics, bundle.weightsVersion, strengths, weaknesses);
  });
}

/** 取单个选手档案；playerKey 不存在时抛错。 */
export function buildPlayerSeasonProfile(bundle: SeasonCohortBundle, playerKey: string): PlayerSeasonProfile {
  const profile = buildAllPlayerSeasonProfiles(bundle).find((p) => p.playerKey === playerKey);
  if (!profile) {
    throw new Error(`playerKey not found in cohort: ${playerKey}`);
  }
  return profile;
}
