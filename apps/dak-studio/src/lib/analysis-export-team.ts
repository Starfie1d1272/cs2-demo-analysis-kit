import type {
  TeamComparisonModel,
  TeamOverviewModel,
} from "@cs2dak/presentation";
import { sortTableRows, type DataTableColumn } from "@cs2dak/react";
import type { TeamPageState } from "./studio-page-state";
import {
  captureAnalysisResult,
  type AnalysisExportSource,
  type AnalysisResultSection,
} from "./analysis-export";

export function comparisonSections(
  model: TeamComparisonModel,
): AnalysisResultSection[] {
  if (model.teams.length !== 2) return [];
  const sections: AnalysisResultSection[] = [];
  for (const side of model.teams) {
    sections.push({
      title: `${side.teamName} · 比赛`,
      text: [],
      sampleDescription: `${side.matchCount} 场；两队分别按各自出场集合聚合`,
      limitations: ["按显示名称观察组汇总；同场双方同名时双方贡献均计入，比赛场次去重，胜负与回合按双方累计。两队无需直接交手。"],
      columns: [
        { key: "match", label: "比赛", unit: null },
        { key: "map", label: "地图", unit: null },
        { key: "opponent", label: "对手", unit: null },
        { key: "won", label: "胜回合", unit: null },
        { key: "lost", label: "负回合", unit: null },
      ],
      rows: side.matches.map((row) => ({
        match: row.matchId,
        map: row.mapName,
        opponent: row.opponent,
        won: row.roundsWon,
        lost: row.roundsLost,
      })),
    });
    sections.push({
      title: `${side.teamName} · 选手`,
      text: [],
      sampleDescription: `${Math.min(side.players.length, 8)} 名显示的选手`,
      limitations: ["仅包含页面显示的前八名选手。RR 按该队出场信号聚合后计算账号评分，与单场计分板指标评分口径不同。"],
      columns: [
        { key: "name", label: "选手", unit: null },
        ...["rr", "adr", "kast", "kpr", "dpr"].map((key) => ({
          key,
          label: key.toUpperCase(),
          unit: key === "kast" ? "%" : null,
        })),
      ],
      rows: side.players.slice(0, 8).map((row) => ({
        name: row.name,
        rr: row.rr,
        adr: row.adr,
        kast: row.kast,
        kpr: row.kpr,
        dpr: row.dpr,
      })),
    });
    sections.push({
      title: `${side.teamName} · 武器`,
      text: [],
      sampleDescription: "页面显示的前五种武器",
      limitations: [],
      columns: [
        { key: "weapon", label: "武器", unit: null },
        { key: "share", label: "占比", unit: "%" },
      ],
      rows: side.weaponPreference
        .slice(0, 5)
        .map((row) => ({ weapon: row.label, share: row.sharePercent })),
    });
    sections.push({
      title: `${side.teamName} · 经济`,
      text: [],
      sampleDescription: "各经济类型样本",
      limitations: [],
      columns: [
        { key: "economy", label: "经济", unit: null },
        { key: "wins", label: "胜", unit: null },
        { key: "rounds", label: "回合", unit: null },
        { key: "rate", label: "胜率", unit: "%" },
      ],
      rows: side.economyWinRate.map((row) => ({
        economy: row.economyType,
        wins: row.wins,
        rounds: row.rounds,
        rate: row.winRatePercent,
      })),
    });
  }
  sections.push({
    title: "队伍差异",
    text: [],
    sampleDescription: "两侧使用相同页面比较口径",
    limitations: [
      "图像未包含；两队无需直接交手。比较模型没有应用分析上下文中单独选择的基线。RR 为选手账号评分的均值。",
    ],
    columns: [
      { key: "metric", label: "指标", unit: null },
      { key: "unit", label: "单位", unit: null },
      { key: "a", label: model.teams[0].teamName, unit: null },
      { key: "b", label: model.teams[1].teamName, unit: null },
      { key: "delta", label: "差值", unit: null },
    ],
    rows: model.radar.map((row) => ({
      metric: row.label,
      unit:
        row.metric === "kast"
          ? "%"
          : row.metric === "kpr" || row.metric === "dpr"
            ? "每回合"
            : null,
      a: row.a,
      b: row.b,
      delta: row.delta,
    })),
  });
  return sections;
}

export function buildTeamAnalysisResult(
  source: AnalysisExportSource,
  model: TeamOverviewModel,
  comparison: TeamComparisonModel | null,
  state: TeamPageState,
  columns: {
    maps: DataTableColumn<TeamOverviewModel["maps"][number]>[];
    roster: DataTableColumn<TeamOverviewModel["roster"][number]>[];
  },
  omitted: string[] = [],
) {
  const maps = sortTableRows(
    model.maps,
    columns.maps,
    state.tables.maps?.sort ?? { key: "matches", direction: "desc" },
  );
  const roster = sortTableRows(
    model.roster,
    columns.roster,
    state.tables.roster?.sort ?? { key: "rr", direction: "desc" },
  );
  const sections: AnalysisResultSection[] = [
    {
      title: "队伍总览",
      text: [
        `比赛 ${model.matchCount} 场，${model.wins} 胜 ${model.losses} 负；回合 ${model.roundsWon}:${model.roundsLost}。`,
        "按显示名称观察组汇总；同场双方同名时双方贡献均计入，比赛场次去重，胜负与回合按双方累计。RR 为出场信号聚合后的账号评分，与单场计分板指标评分口径不同。",
      ],
      columns: [],
      rows: [],
      sampleDescription: `${model.matchCount} 场`,
      limitations: [],
    },
    {
      title: "地图盘面",
      text: [],
      sampleDescription: `${maps.length} 行 · 全部筛选结果`,
      limitations: [],
      columns: [
        { key: "map", label: "地图", unit: null },
        { key: "matches", label: "场次", unit: null },
        { key: "wins", label: "胜", unit: null },
        { key: "losses", label: "负", unit: null },
        { key: "won", label: "胜回合", unit: null },
        { key: "lost", label: "负回合", unit: null },
      ],
      rows: maps.map((row) => ({
        map: row.mapName,
        matches: row.matches,
        wins: row.wins,
        losses: row.losses,
        won: row.roundsWon,
        lost: row.roundsLost,
      })),
    },
    {
      title: "阵容",
      text: [],
      sampleDescription: `${roster.length} 行 · 全部筛选结果`,
      limitations: [],
      columns: [
        { key: "name", label: "选手", unit: null },
        { key: "rr", label: "RR", unit: null },
        { key: "adr", label: "ADR", unit: null },
        { key: "kast", label: "KAST", unit: "%" },
      ],
      rows: roster.map((row) => ({
        name: row.name,
        rr: row.rr,
        adr: row.adr,
        kast: row.kast,
      })),
    },
    {
      title: "经济样本",
      text: model.economyWinRate.map(
        (row) => `${row.economyType} · ${row.wins}/${row.rounds}`,
      ),
      columns: [],
      rows: [],
      sampleDescription: "当前队伍",
      limitations: [],
    },
    {
      title: "最近比赛",
      text: [],
      sampleDescription: "最近五场",
      limitations: [],
      columns: [
        { key: "match", label: "比赛", unit: null },
        { key: "map", label: "地图", unit: null },
        { key: "opponent", label: "对手", unit: null },
        { key: "won", label: "胜回合", unit: null },
        { key: "lost", label: "负回合", unit: null },
      ],
      rows: model.matches
        .slice(-5)
        .reverse()
        .map((row) => ({
          match: row.matchId,
          map: row.mapName,
          opponent: row.opponent,
          won: row.roundsWon,
          lost: row.roundsLost,
        })),
    },
    ...(comparison ? comparisonSections(comparison) : []),
  ];
  return captureAnalysisResult({
    ...source,
    title: `${model.teamName} · 队伍`,
    page: "team",
    sections,
    limitations: ["图像未包含。", ...omitted],
  });
}
