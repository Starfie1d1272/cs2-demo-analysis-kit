import type { DemoPackage, DuelInsightsModel, DuelFinderRow, OpeningDuelRow, PlayerMechanicsRow } from "@cs2dak/contract";
import { duelInsightsModelSchema } from "@cs2dak/contract";
import { deriveDuels, deriveOpeningDuels, derivePlayerMechanics, type PlayerMechanicsFact } from "@cs2dak/core";

export interface DuelInsightsInput {
  matchId: string;
  pkg: DemoPackage;
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  contested: "正面对枪",
  outaimed: "正面秒杀",
  caught_off_guard: "偷背身",
  cleanup: "补残血"
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
    fullHealth: fact.fullHealth,
    victimHealthBefore: fact.victimHealthBefore,
    killerHealthBefore: fact.killerHealthBefore,
    ttkMs: fact.ttkMs,
    oneShotKill: fact.oneShotKill,
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
  return rank > 0 ? `当前范围第 ${rank}/${values.length}` : null;
}

function metricValues(rows: PlayerMechanicsFact[], pick: (row: PlayerMechanicsFact) => number | null): number[] {
  return rows.map(pick).filter((value): value is number => value != null);
}

function mechanicsRow(pkg: DemoPackage, fact: PlayerMechanicsFact, allFacts: PlayerMechanicsFact[]): PlayerMechanicsRow {
  const firstShotValues = metricValues(allFacts, (row) => row.firstShotAccuracyPercent);
  const sprayValues = metricValues(allFacts, (row) => row.sprayAccuracyPercent);
  const counterStrafeValues = metricValues(allFacts, (row) => row.counterStrafeSuccessPercent);
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
    burstLengthBuckets: fact.burstLengthBuckets
  };
}

export function duelClassificationLabel(classification: string): string {
  return CLASSIFICATION_LABEL[classification] ?? classification;
}

export function buildDuelInsights(inputs: DuelInsightsInput[]): DuelInsightsModel {
  const duelRows: DuelFinderRow[] = [];
  const openingRows: OpeningDuelRow[] = [];
  const mechanicsPairs: Array<{ pkg: DemoPackage; fact: PlayerMechanicsFact }> = [];

  for (const input of inputs) {
    duelRows.push(...deriveDuels(input.pkg).map((fact) => duelRow(input, fact)));
    openingRows.push(...deriveOpeningDuels(input.pkg).map((fact) => openingRow(input, fact)));
    mechanicsPairs.push(...derivePlayerMechanics(input.pkg).map((fact) => ({ pkg: input.pkg, fact })));
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
      "急停成功率只在 shots.velocity 有有效非零采样时展示；全零 velocity 视为导出不可用。",
      "当前范围标签只基于本次选择的 demo，不是固定联赛评级。"
    ]
  });
}
