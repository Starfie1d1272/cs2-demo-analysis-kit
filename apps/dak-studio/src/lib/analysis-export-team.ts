import type { TeamComparisonModel, TeamOverviewModel } from "@cs2dak/presentation";
import { sortTableRows, type DataTableColumn } from "@cs2dak/react";
import type { TeamPageState } from "./studio-page-state";
import { captureAnalysisResult, type AnalysisExportSource, type AnalysisResultSection } from "./analysis-export";

export function comparisonSections(model: TeamComparisonModel): AnalysisResultSection[] {
  if (model.teams.length !== 2) return [];
  const sections: AnalysisResultSection[] = [];
  for (const side of model.teams) {
    sections.push({ title: `${side.teamName} · 比赛`, text: [], sampleDescription: `${side.matchCount} 场；两队分别按各自出场集合聚合`, limitations: ["两队无需直接交手。"], columns: [{ key: "match", label: "比赛", unit: null }, { key: "map", label: "地图", unit: null }, { key: "opponent", label: "对手", unit: null }, { key: "won", label: "胜回合", unit: null }, { key: "lost", label: "负回合", unit: null }], rows: side.matches.map(row => ({ match: row.matchId, map: row.mapName, opponent: row.opponent, won: row.roundsWon, lost: row.roundsLost })) });
    sections.push({ title: `${side.teamName} · 选手`, text: [], sampleDescription: `${Math.min(side.players.length, 8)} 名显示的选手`, limitations: ["仅包含页面显示的前八名选手。"], columns: [{ key: "name", label: "选手", unit: null }, ...["rr", "adr", "kast", "kpr", "dpr"].map(key => ({ key, label: key.toUpperCase(), unit: key === "kast" ? "%" : null }))], rows: side.players.slice(0, 8).map(row => ({ name: row.name, rr: row.rr, adr: row.adr, kast: row.kast, kpr: row.kpr, dpr: row.dpr })) });
    sections.push({ title: `${side.teamName} · 武器及经济`, text: [...side.weaponPreference.slice(0, 5).map(row => `${row.label}：${row.sharePercent}%`), ...side.economyWinRate.map(row => `${row.economyType}：${row.wins}/${row.rounds}，${row.winRatePercent == null ? "—" : `${row.winRatePercent}%`}`)], columns: [], rows: [], sampleDescription: "页面显示的前五种武器及经济样本", limitations: [] });
  }
  sections.push({ title: "队伍差异", text: [], sampleDescription: "同一基线上的页面比较", limitations: ["图像未包含；两队无需直接交手。"], columns: [{ key: "metric", label: "指标", unit: null }, { key: "a", label: model.teams[0].teamName, unit: null }, { key: "b", label: model.teams[1].teamName, unit: null }, { key: "delta", label: "差值", unit: null }], rows: model.radar.map(row => ({ metric: row.label, a: row.a, b: row.b, delta: row.delta })) });
  return sections;
}

export function buildTeamAnalysisResult(source: AnalysisExportSource, model: TeamOverviewModel, comparison: TeamComparisonModel | null, state: TeamPageState, columns: { maps: DataTableColumn<TeamOverviewModel["maps"][number]>[]; roster: DataTableColumn<TeamOverviewModel["roster"][number]>[] }) {
  const maps = sortTableRows(model.maps, columns.maps, state.tables.maps?.sort ?? { key: "matches", direction: "desc" });
  const roster = sortTableRows(model.roster, columns.roster, state.tables.roster?.sort ?? { key: "rr", direction: "desc" });
  const sections: AnalysisResultSection[] = [
    { title: "队伍总览", text: [`比赛 ${model.matchCount} 场，${model.wins} 胜 ${model.losses} 负；回合 ${model.roundsWon}:${model.roundsLost}。`], columns: [], rows: [], sampleDescription: `${model.matchCount} 场`, limitations: [] },
    { title: "地图盘面", text: [], sampleDescription: `${maps.length} 行 · 全部筛选结果`, limitations: [], columns: [{ key: "map", label: "地图", unit: null }, { key: "matches", label: "场次", unit: null }, { key: "wins", label: "胜", unit: null }, { key: "losses", label: "负", unit: null }, { key: "won", label: "胜回合", unit: null }, { key: "lost", label: "负回合", unit: null }], rows: maps.map(row => ({ map: row.mapName, matches: row.matches, wins: row.wins, losses: row.losses, won: row.roundsWon, lost: row.roundsLost })) },
    { title: "阵容", text: [], sampleDescription: `${roster.length} 行 · 全部筛选结果`, limitations: [], columns: [{ key: "name", label: "选手", unit: null }, { key: "rr", label: "RR", unit: null }, { key: "adr", label: "ADR", unit: null }, { key: "kast", label: "KAST", unit: "%" }], rows: roster.map(row => ({ name: row.name, rr: row.rr, adr: row.adr, kast: row.kast })) },
    { title: "经济样本", text: model.economyWinRate.map(row => `${row.economyType} · ${row.wins}/${row.rounds}`), columns: [], rows: [], sampleDescription: "当前队伍", limitations: [] },
    { title: "最近比赛", text: [], sampleDescription: "最近五场", limitations: [], columns: [{ key: "match", label: "比赛", unit: null }, { key: "map", label: "地图", unit: null }, { key: "opponent", label: "对手", unit: null }, { key: "won", label: "胜回合", unit: null }, { key: "lost", label: "负回合", unit: null }], rows: model.matches.slice(-5).reverse().map(row => ({ match: row.matchId, map: row.mapName, opponent: row.opponent, won: row.roundsWon, lost: row.roundsLost })) },
    ...(comparison ? comparisonSections(comparison) : []),
  ];
  return captureAnalysisResult({ ...source, title: `${model.teamName} · 队伍`, page: "team", sections, limitations: ["图像未包含。"] });
}
