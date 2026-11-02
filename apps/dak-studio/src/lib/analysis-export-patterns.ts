import { sortTableRows } from "@cs2dak/react";
import { patternEvidenceSortColumns } from "./pattern-evidence-sort";
import {
  economyLabelCn,
  ECONOMY_ENTRY_CN,
  formatTacticalClusterName,
} from "@cs2dak/presentation";
import type { TacticalCluster, TacticalRoundFact } from "@cs2dak/tactics";
import type { PatternPageState } from "./pattern-page-state";
import {
  captureAnalysisResult,
  type AnalysisExportSource,
  type AnalysisResultSection,
} from "./analysis-export";

export function buildPatternsAnalysisResult(
  source: AnalysisExportSource,
  cluster: TacticalCluster,
  facts: TacticalRoundFact[],
  state: PatternPageState,
  manualName: string | null,
) {
  const sections: AnalysisResultSection[] = [
    {
      title: "所选模式",
      text: [
        `自动名称：${formatTacticalClusterName(cluster)}`,
        ...(manualName ? [`人工命名：${manualName}`] : []),
        `队伍：${cluster.teamName}；经济：${ECONOMY_ENTRY_CN[cluster.economyEntry]}`,
        ...(cluster.side === "t"
          ? [
              `进点证据覆盖：${cluster.entryEvidence.coveredRounds}/${cluster.entryEvidence.totalRounds}。`,
            ]
          : []),
      ],
      sampleDescription: `${cluster.roundCount} 回合`,
      limitations: ["图像及回放帧未包含。"],
      columns: [
        { key: "metric", label: "指标", unit: null },
        { key: "value", label: "数值", unit: "%" },
      ],
      rows: [
        { metric: "胜率", value: cluster.winRatePercent },
        {
          metric: cluster.side === "t" ? "下包率" : "对手下包率",
          value: cluster.plantRatePercent,
        },
        ...(cluster.side === "t"
          ? [
              {
                metric: "进点证据覆盖率",
                value: cluster.entryEvidence.coveragePercent,
              },
            ]
          : []),
      ],
    },
    {
      title: "模式证据",
      text: [],
      sampleDescription: `${cluster.rounds.length} 行 · 全部筛选结果`,
      limitations: [],
      columns: [
        { key: "match", label: "比赛", unit: null },
        { key: "round", label: "回合", unit: null },
        { key: "economy", label: "经济", unit: null },
        { key: "remaining", label: "执行剩余", unit: "s" },
        { key: "firstKill", label: "首杀", unit: null },
        { key: "plant", label: "下包点", unit: null },
        { key: "plantRemaining", label: "下包剩余时间", unit: "s" },
        { key: "result", label: "胜利", unit: null },
      ],
      rows: sortTableRows(
        cluster.rounds,
        patternEvidenceSortColumns,
        state.explorer.evidenceTable.sort,
      ).map((row) => {
        const fact = facts.find(
          (item) =>
            item.matchId === row.matchId &&
            item.roundNumber === row.roundNumber,
        );
        return {
          match: row.matchId,
          round: row.roundNumber,
          economy: economyLabelCn(row.economy),
          remaining: fact?.executeRemainSec ?? null,
          firstKill: fact?.firstKillForTeam ?? null,
          plant: fact?.plant?.site ?? null,
          plantRemaining: fact?.plant?.remainSec ?? null,
          result: row.won,
        };
      }),
    },
  ];
  return captureAnalysisResult({
    ...source,
    title: "战术模式",
    page: "patterns",
    conditions: [
      ...source.conditions,
      `地图：${state.explorer.mapName ?? "全部"}`,
      `阵营：${state.explorer.side === "t" ? "T 方" : "CT 方"}`,
      `经济：${state.explorer.economyEntry === "all" ? "全部" : ECONOMY_ENTRY_CN[state.explorer.economyEntry]}`,
    ],
    sections,
    limitations: ["人工命名不代表自动事实。"],
  });
}

export function buildPatternReportAnalysisResult(
  source: AnalysisExportSource,
  rows: import("@cs2dak/analytics").ObservedMapPoolRow[],
  clusters: TacticalCluster[],
  notes: Record<string, string>,
  hasOwn: boolean,
  subjectTeam: string | null,
  mode: "own" | "scout",
) {
  const subject = `${mode === "own" ? "己方" : "对手"}${subjectTeam ? ` · ${subjectTeam}` : ""}`;
  const title = mode === "own" ? "己方复盘报告" : "对手备战报告";
  return captureAnalysisResult({
    ...source,
    title: subjectTeam ? `${title} · ${subjectTeam}` : title,
    page: "patterns",
    conditions: [
      ...source.conditions,
      "子页：报告",
      `模式主体：${subject}`,
      "双方分别按各自出场样本聚合，不要求直接交手。",
    ],
    sections: [
      {
        title: "地图池比较",
        text: [],
        sampleDescription: `${rows.length} 行`,
        limitations: [],
        columns: [
          { key: "map", label: "地图", unit: null },
          ...(hasOwn
            ? [
                { key: "ownMatches", label: "我方场次", unit: null },
                { key: "ownRounds", label: "我方回合", unit: null },
                { key: "ownRate", label: "我方胜率", unit: "%" },
              ]
            : []),
          { key: "opponentMatches", label: "对手场次", unit: null },
          { key: "opponentRounds", label: "对手回合", unit: null },
          { key: "opponentRate", label: "对手胜率", unit: "%" },
          { key: "patterns", label: "对手高频打法", unit: null },
          { key: "note", label: "人工备注", unit: null },
        ],
        rows: rows.map((row) => ({
          map: row.mapName,
          ...(hasOwn
            ? {
                ownMatches: row.own.matchCount,
                ownRounds: row.own.roundCount,
                ownRate: row.own.winRatePercent,
              }
            : {}),
          opponentMatches: row.opponent.matchCount,
          opponentRounds: row.opponent.roundCount,
          opponentRate: row.opponent.winRatePercent,
          patterns: row.topOpponentPatternNames.join("、"),
          note: notes[row.mapName] ?? "",
        })),
      },
      ...[...new Set(clusters.map((cluster) => cluster.mapName))]
        .sort()
        .flatMap((map) =>
          (["t", "ct"] as const).map((side): AnalysisResultSection => {
            const patterns = clusters
              .filter(
                (cluster) => cluster.mapName === map && cluster.side === side,
              )
              .slice(0, 5);
            return {
              title: `${subject} · ${map} · ${side === "t" ? "T 方" : "CT 方"}`,
              text: patterns.length ? [] : ["暂无数据"],
              columns: [
                { key: "pattern", label: "模式", unit: null },
                { key: "rounds", label: "回合", unit: null },
                { key: "winRate", label: "胜率", unit: "%" },
              ],
              rows: patterns.map((cluster) => ({
                pattern: formatTacticalClusterName(cluster),
                rounds: cluster.roundCount,
                winRate: cluster.winRatePercent,
              })),
              sampleDescription: "当前聚类结果，最多五种模式",
              limitations: [],
            };
          }),
        ),
      ...(clusters.length === 0
        ? [
            {
              title: `${subject} · 聚类结果`,
              text: ["暂无聚类数据。"],
              columns: [],
              rows: [],
              sampleDescription: "当前聚类结果",
              limitations: [],
            },
          ]
        : []),
    ],
    limitations: ["人工备注明确标注；图像未包含。"],
  });
}
