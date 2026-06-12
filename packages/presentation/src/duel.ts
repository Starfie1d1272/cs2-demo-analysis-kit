import type { DemoPackage, DuelInsightsModel, DuelFinderRow, OpeningDuelRow, PlayerMechanicsRow } from "@cs2dak/contract";
import { duelInsightsModelSchema } from "@cs2dak/contract";
import { deriveDuels, deriveOpeningDuels, derivePlayerMechanics, type PlayerMechanicsFact } from "@cs2dak/core";
import type { TriangleBvh } from "@cs2dak/maps";

export interface DuelInsightsInput {
  matchId: string;
  pkg: DemoPackage;
}

export interface DuelInsightsOptions {
  /** 按地图名提供 .tri BVH；提供后视觉反应/预瞄走 LOS 精确口径，否则退化为 duels 窗口起点。 */
  visibilityFor?: (mapName: string) => TriangleBvh | null;
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  contested_duel: "对枪胜出",
  suppressed_kill: "先手压制击杀",
  caught_off_guard: "侧背身击杀"
};

function nameFor(pkg: DemoPackage, steamId64: string): string {
  return pkg.players.find((player) => player.steamId64 === steamId64)?.name ?? steamId64;
}

function teamNameFor(pkg: DemoPackage, teamKey: string): string {
  return teamKey === "teamA" ? (pkg.match.teamA.name ?? "Team A") : (pkg.match.teamB.name ?? "Team B");
}

function duelRow(input: DuelInsightsInput, fact: ReturnType<typeof deriveDuels>[number]): DuelFinderRow {
  return {
    id: `${input.matchId}:${fact.id}`,
    matchId: input.matchId,
    mapName: input.pkg.match.mapName,
    roundNumber: fact.roundNumber,
    tick: fact.tick,
    killerSteamId64: fact.killerSteamId64,
    victimSteamId64: fact.victimSteamId64,
    killerName: nameFor(input.pkg, fact.killerSteamId64),
    victimName: nameFor(input.pkg, fact.victimSteamId64),
    weapon: fact.weapon,
    classification: fact.classification,
    hpBucket: fact.hpBucket,
    thirdParty: fact.thirdParty,
    fullHealth: fact.fullHealth,
    victimHealthBefore: fact.victimHealthBefore,
    killerHealthBefore: fact.killerHealthBefore,
    ttkMs: fact.ttkMs,
    oneShotKill: fact.oneShotKill,
    evidenceTicks: fact.evidenceTicks,
    killerPosition: fact.killerPosition,
    victimPosition: fact.victimPosition,
    evidence: { matchId: input.matchId, roundNumber: fact.roundNumber, tick: fact.tick }
  };
}

function openingRow(input: DuelInsightsInput, fact: ReturnType<typeof deriveDuels>[number]): OpeningDuelRow {
  return {
    ...duelRow(input, fact),
    attackerCallout: null,
    victimCallout: null
  };
}

function rankLabel(value: number, values: number[], higherIsBetter = true): string | null {
  if (values.length < 1) return null;
  const sorted = [...values].sort((a, b) => higherIsBetter ? b - a : a - b);
  const rank = sorted.findIndex((candidate) => candidate === value) + 1;
  return rank > 0 ? `当前范围前 ${Math.max(1, Math.round(rank / values.length * 100))}%` : null;
}

function metricValues(rows: PlayerMechanicsFact[], pick: (row: PlayerMechanicsFact) => number | null): number[] {
  return rows.map(pick).filter((value): value is number => value != null);
}

function mechanicsRow(pkg: DemoPackage, fact: PlayerMechanicsFact, allFacts: PlayerMechanicsFact[]): PlayerMechanicsRow {
  const firstShotValues = metricValues(allFacts, (row) => row.firstShotAccuracyPercent);
  const sprayValues = metricValues(allFacts, (row) => row.sprayAccuracyPercent);
  const counterStrafeValues = metricValues(allFacts, (row) => row.counterStrafeSuccessPercent);
  const oneTapValues = metricValues(allFacts, (row) => row.oneTapRatePercent);
  const shotIntervalValues = metricValues(allFacts, (row) => row.medianShotIntervalMs);
  const visualReactionValues = metricValues(allFacts, (row) => row.reaction.visualReactionMs);
  const preaimValues = metricValues(allFacts, (row) => row.reaction.preaimAngleErrorDegrees);
  const metrics = [
    fact.firstShotAccuracyPercent == null ? null : {
      key: "firstShotAccuracy",
      label: "首发精准度",
      value: fact.firstShotAccuracyPercent,
      unit: "%",
      percentileLabel: rankLabel(fact.firstShotAccuracyPercent, firstShotValues)
    },
    fact.sprayAccuracyPercent == null ? null : {
      key: "sprayAccuracy",
      label: "扫射精准度",
      value: fact.sprayAccuracyPercent,
      unit: "%",
      percentileLabel: rankLabel(fact.sprayAccuracyPercent, sprayValues)
    },
    fact.counterStrafeSuccessPercent == null ? null : {
      key: "counterStrafe",
      label: "急停成功率",
      value: fact.counterStrafeSuccessPercent,
      unit: "%",
      percentileLabel: rankLabel(fact.counterStrafeSuccessPercent, counterStrafeValues)
    },
    fact.oneTapRatePercent == null ? null : {
      key: "oneTapRate",
      label: "一枪致命率",
      value: fact.oneTapRatePercent,
      unit: "%",
      percentileLabel: rankLabel(fact.oneTapRatePercent, oneTapValues)
    },
    fact.medianShotIntervalMs == null ? null : {
      key: "medianShotInterval",
      label: "开枪间隔",
      value: fact.medianShotIntervalMs,
      unit: "ms",
      percentileLabel: rankLabel(fact.medianShotIntervalMs, shotIntervalValues, false)
    },
    fact.reaction.visualReactionMs == null ? null : {
      key: "visualReaction",
      label: "视觉反应",
      value: fact.reaction.visualReactionMs,
      unit: "ms",
      percentileLabel: rankLabel(fact.reaction.visualReactionMs, visualReactionValues, false)
    },
    fact.reaction.preaimAngleErrorDegrees == null ? null : {
      key: "preaimAngleError",
      label: "预瞄误差",
      value: fact.reaction.preaimAngleErrorDegrees,
      unit: "°",
      percentileLabel: rankLabel(fact.reaction.preaimAngleErrorDegrees, preaimValues, false)
    }
  ].filter((metric): metric is NonNullable<typeof metric> => metric != null);

  return {
    steamId64: fact.steamId64,
    playerName: fact.playerName,
    teamName: teamNameFor(pkg, fact.teamKey),
    weapon: fact.weapon,
    killCount: fact.killCount,
    shotCount: fact.shotCount,
    burstCount: fact.burstCount,
    metrics,
    reaction: fact.reaction,
    burstLengthBuckets: fact.burstLengthBuckets,
    firingPatternRatio: fact.firingPatternRatio
  };
}

export function duelClassificationLabel(classification: string): string {
  return CLASSIFICATION_LABEL[classification] ?? classification;
}

export function buildDuelInsights(inputs: DuelInsightsInput[], options: DuelInsightsOptions = {}): DuelInsightsModel {
  const duelRows: DuelFinderRow[] = [];
  const openingRows: OpeningDuelRow[] = [];
  const mechanicsPairs: Array<{ pkg: DemoPackage; fact: PlayerMechanicsFact }> = [];

  for (const input of inputs) {
    const visibility = options.visibilityFor?.(input.pkg.match.mapName) ?? null;
    duelRows.push(...deriveDuels(input.pkg).map((fact) => duelRow(input, fact)));
    openingRows.push(...deriveOpeningDuels(input.pkg).map((fact) => openingRow(input, fact)));
    mechanicsPairs.push(...derivePlayerMechanics(input.pkg, { visibility }).map((fact) => ({ pkg: input.pkg, fact })));
  }

  const allFacts = mechanicsPairs.map((pair) => pair.fact);
  return duelInsightsModelSchema.parse({
    version: "cs2-demo-analysis-kit/duel-insights-0.1",
    matchCount: inputs.length,
    duelRows,
    openingRows,
    mechanicsRows: mechanicsPairs.map((pair) => mechanicsRow(pair.pkg, pair.fact, allFacts)),
    notes: [
      "TTK 以击杀连发组第一枪到击杀 tick 计算；AK 一枪头可能接近 0ms。",
      "首发/扫射命中按开枪 tick ±1 匹配伤害事件；穿物体、霰弹多弹丸可能低估。",
      "扫射命中率从同一 burst 第二发起算，且只统计击杀边界前的开枪。",
      "急停成功率读取开枪前 200ms 的 shots velocity，并按武器/类别阈值判定；全零 velocity 视为导出不可用。",
      "反应/预瞄优先消费 research duels.json 满 tick 窗口；缺失窗口时只展示可证据化字段。",
      "百分位标签基于当前聚合范围；未接入固定联赛基线时不输出 A/B/C。"
    ]
  });
}
