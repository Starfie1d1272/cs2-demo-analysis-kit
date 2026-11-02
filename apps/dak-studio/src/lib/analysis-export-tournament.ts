import type { TournamentInsights } from "@cs2dak/analytics";
import type { TeamComparisonModel } from "@cs2dak/presentation";
import { sortTableRows, type DataTableColumn } from "@cs2dak/react";
import type { AnalysisPageState } from "./studio-page-state";
import {
  captureAnalysisResult,
  type AnalysisExportSource,
  type AnalysisResultSection,
} from "./analysis-export";
import { comparisonSections } from "./analysis-export-team";

export function buildTournamentAnalysisResult(
  source: AnalysisExportSource,
  model: TournamentInsights | null,
  comparison: TeamComparisonModel | null,
  state: AnalysisPageState,
  columns: {
    maps: DataTableColumn<TournamentInsights["maps"][number]>[];
    weapons: DataTableColumn<TournamentInsights["weaponKills"][number]>[];
  },
  page: "analysis" | "event-analysis",
  leaderboard?: AnalysisResultSection,
  omitted: string[] = [],
) {
  const maps = sortTableRows(
    model?.maps ?? [],
    columns.maps,
    state.tables.maps?.sort ?? { key: "matches", direction: "desc" },
  );
  const weapons = sortTableRows(
    model?.weaponKills ?? [],
    columns.weapons,
    state.tables.weapons?.sort ?? { key: "kills", direction: "desc" },
  );
  const sections: AnalysisResultSection[] = [
    ...(model
      ? ([
          {
            title: "赛事总览",
            text: [
              `${model.matchCount} 场比赛，${model.roundCount} 回合；T 胜率 ${model.tWinRatePercent}%，CT 胜率 ${model.ctWinRatePercent}%；手枪局转化 ${model.pistolConversionPercent == null ? "—" : `${model.pistolConversionPercent}%`}。`,
            ],
            columns: [],
            rows: [],
            sampleDescription: `${model.matchCount} 场比赛`,
            limitations: [],
          },
          {
            title: "地图",
            text: [],
            sampleDescription: `${maps.length} 行 · 全部筛选结果`,
            limitations: [],
            columns: [
              { key: "map", label: "地图", unit: null },
              { key: "matches", label: "场次", unit: null },
              { key: "t", label: "T 胜率", unit: "%" },
              { key: "ct", label: "CT 胜率", unit: "%" },
              { key: "pistol", label: "手枪局 T 胜率", unit: "%" },
            ],
            rows: maps.map((row) => ({
              map: row.mapName,
              matches: row.matches,
              t: row.tWinRatePercent,
              ct: row.ctWinRatePercent,
              pistol: row.pistolTWinRatePercent,
            })),
          },
          {
            title: "武器",
            text: [],
            sampleDescription: `${weapons.length} 行 · 全部筛选结果`,
            limitations: [],
            columns: [
              { key: "weapon", label: "武器", unit: null },
              { key: "kills", label: "击杀", unit: null },
              { key: "hs", label: "HS", unit: "%" },
              { key: "top", label: "最高选手", unit: null },
              { key: "topKills", label: "最高选手击杀", unit: null },
            ],
            rows: weapons.map((row) => ({
              weapon: row.label,
              kills: row.kills,
              hs: row.headshotPercent,
              top: row.topPlayerName,
              topKills: row.topPlayerName ? row.topPlayerKills : null,
            })),
          },
        ] satisfies AnalysisResultSection[])
      : []),
    ...(comparison ? comparisonSections(comparison) : []),
    ...(leaderboard ? [leaderboard] : []),
  ];
  return captureAnalysisResult({
    ...source,
    conditions: [
      ...source.conditions,
      ...(source.context.focus.kind === "player" ||
      source.context.focus.kind === "self"
        ? ["赛事总览按比赛范围计算，未按个人筛选。"]
        : []),
    ],
    title: "赛事总览",
    page,
    sections,
    limitations: ["图像未包含。", ...omitted],
  });
}

export function leaderboardSection(
  model: import("@cs2dak/presentation").SeasonLeaderboardModel,
  state: AnalysisPageState,
): AnalysisResultSection {
  const view =
    model.views.find((v) => v.key === state.leaderboardView) ?? model.views[0];
  if (!view)
    return {
      title: "排行榜",
      text: [],
      columns: [],
      rows: [],
      sampleDescription: "无可用视图",
      limitations: [],
    };
  const sort = state.tables.leaderboard?.sort ?? {
    key: view.defaultSort,
    direction: "desc" as const,
  };
  const key = (sort.key ??
    view.defaultSort) as import("@cs2dak/presentation").LeaderboardMetricKey;
  const rows = sortTableRows(
    model.rows,
    [
      {
        key,
        label: key,
        sortable: true,
        sortValue: (row) => row.metrics[key] ?? null,
      },
    ],
    { ...sort, key },
  );
  return {
    title: `排行榜 · ${view.label}`,
    text: [`权重 ${model.weightsVersion}`],
    sampleDescription: `${rows.length} 行 · 全部筛选结果，${model.matchCount} 场`,
    limitations: [],
    columns: [
      { key: "name", label: "选手", unit: null },
      ...view.columns.map((column) => ({
        key: column.key,
        label: column.label,
        unit: column.format === "percent" ? "%" : null,
      })),
    ],
    rows: rows.map((row) => ({
      name: row.name,
      ...Object.fromEntries(
        view.columns.map((column) => [
          column.key,
          row.metrics[column.key] ?? null,
        ]),
      ),
    })),
  };
}

export function buildLeaderboardAnalysisResult(
  source: AnalysisExportSource,
  model: import("@cs2dak/presentation").SeasonLeaderboardModel,
  state: AnalysisPageState,
  page: "analysis" | "event-analysis",
) {
  return captureAnalysisResult({
    ...source,
    title: "排行榜",
    page,
    conditions: [...source.conditions, `排行子页：${state.leaderboardView}`],
    sections: [leaderboardSection(model, state)],
    limitations: [],
  });
}
