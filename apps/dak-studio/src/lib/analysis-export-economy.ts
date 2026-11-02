import type { TournamentInsights } from "@cs2dak/analytics";
import { sortTableRows, type DataTableColumn } from "@cs2dak/react";
import type { EconomyPageState } from "./analysis-theme-state";
import {
  captureAnalysisResult,
  type AnalysisExportSource,
  type AnalysisResultSection,
} from "./analysis-export";

type Team = TournamentInsights["teamEconomySummaries"][number];
type Matrix = TournamentInsights["economyMatrix"][number];
type Upset = TournamentInsights["ecoUpsets"][number];
export function buildEconomyAnalysisResult(
  source: AnalysisExportSource,
  model: TournamentInsights,
  state: EconomyPageState,
  columns: {
    teams: DataTableColumn<Team>[];
    matrix: DataTableColumn<Matrix>[];
    upset: DataTableColumn<Upset>[];
  },
) {
  const teams = sortTableRows(
    model.teamEconomySummaries,
    columns.teams,
    state.teamDetails.sort,
  );
  const matrix = sortTableRows(
    model.economyMatrix,
    columns.matrix,
    state.economyMatrix.sort,
  );
  const upsets = sortTableRows(
    model.ecoUpsets,
    columns.upset,
    state.smallBuyUpsets.sort,
  );
  const sections: AnalysisResultSection[] = [
    {
      title: "比赛范围总体",
      text: [
        `比赛 ${model.matchCount} 场，${model.roundCount} 回合；总体手枪转化 ${model.pistolConversionPercent == null ? "—" : `${model.pistolConversionPercent}%`}。`,
      ],
      sampleDescription: `${model.roundCount} 回合 · ${model.matchCount} 场`,
      limitations: ["人数转换为比赛范围总体，不是当前队伍投影。"],
      columns: [
        { key: "advantage", label: "优势", unit: null },
        { key: "wins", label: "优势胜", unit: null },
        { key: "opportunities", label: "机会", unit: null },
        { key: "rate", label: "优势转化", unit: "%" },
        { key: "disadvantage", label: "劣势", unit: null },
        { key: "comebacks", label: "劣势胜", unit: null },
        { key: "comebackRate", label: "劣势翻盘", unit: "%" },
      ],
      rows: model.manAdvantageConversions.map((row) => ({
        advantage: row.advantageLabel,
        wins: row.advantageWins,
        opportunities: row.opportunities,
        rate: row.advantageConversionPercent,
        disadvantage: row.disadvantageLabel,
        comebacks: row.disadvantageWins,
        comebackRate: row.disadvantageConversionPercent,
      })),
    },
    {
      title: "队伍明细矩阵 · 当前队伍投影",
      text: [],
      sampleDescription: `${teams.length} 行 · 全部筛选结果`,
      limitations: ["未绑定队伍按用户重命名后的显示名分组；同场同名双方单独列出。名称筛选包含该名称的全部分组。"],
      columns: [
        { key: "team", label: "队伍", unit: null },
        { key: "maps", label: "Maps", unit: null },
        { key: "wins", label: "胜回合", unit: null },
        { key: "rounds", label: "回合", unit: null },
        { key: "rw", label: "RW", unit: "%" },
        { key: "pistol", label: "Pistol", unit: "%" },
        { key: "pistolWins", label: "手枪胜", unit: null },
        { key: "pistolRounds", label: "手枪样本", unit: null },
        { key: "conv", label: "R2 Conv", unit: "%" },
        { key: "convWins", label: "转化胜", unit: null },
        { key: "convRounds", label: "转化机会", unit: null },
        { key: "break", label: "R2 Break", unit: "%" },
        { key: "breakWins", label: "反转化胜", unit: null },
        { key: "breakRounds", label: "反转化机会", unit: null },
        ...["5v4", "4v5", "5v3", "3v5"].flatMap((key) => [
          { key, label: key, unit: "%" },
          { key: `${key}Wins`, label: `${key} 胜`, unit: null },
          { key: `${key}Opportunities`, label: `${key} 机会`, unit: null },
        ]),
        { key: "upset", label: "小枪翻盘", unit: "%" },
        { key: "upsetWins", label: "小枪胜", unit: null },
        { key: "upsetOpportunities", label: "小枪机会", unit: null },
      ],
      rows: teams.map((row) => {
        const a = row.manAdvantage.states.find(
          (s) => s.advantageAlive === 5 && s.disadvantageAlive === 4,
        );
        const b = row.manAdvantage.states.find(
          (s) => s.advantageAlive === 5 && s.disadvantageAlive === 3,
        );
        return {
          team: row.teamName,
          maps: row.maps,
          wins: row.roundWins,
          rounds: row.rounds,
          rw: row.roundWinPercent,
          pistol: row.pistol.winRatePercent,
          pistolWins: row.pistol.wins,
          pistolRounds: row.pistol.rounds,
          conv: row.round2.conversionPercent,
          convWins: row.round2.conversionWins,
          convRounds: row.round2.conversionRounds,
          break: row.round2.breakRatePercent,
          breakWins: row.round2.breakWins,
          breakRounds: row.round2.breakRounds,
          "5v4": a?.advantageConversionPercent ?? null,
          "5v4Wins": a?.advantageWins ?? null,
          "5v4Opportunities": a?.advantageOpportunities ?? null,
          "4v5": a?.disadvantageConversionPercent ?? null,
          "4v5Wins": a?.disadvantageWins ?? null,
          "4v5Opportunities": a?.disadvantageOpportunities ?? null,
          "5v3": b?.advantageConversionPercent ?? null,
          "5v3Wins": b?.advantageWins ?? null,
          "5v3Opportunities": b?.advantageOpportunities ?? null,
          "3v5": b?.disadvantageConversionPercent ?? null,
          "3v5Wins": b?.disadvantageWins ?? null,
          "3v5Opportunities": b?.disadvantageOpportunities ?? null,
          upset: row.smallBuyUpset.winRatePercent,
          upsetWins: row.smallBuyUpset.wins,
          upsetOpportunities: row.smallBuyUpset.opportunities,
        };
      }),
    },
    {
      title: "经济对位胜率 · 比赛范围总体",
      text: [],
      sampleDescription: `${matrix.length} 行 · 全部筛选结果`,
      limitations: ["经济表不能精确反查每格回合。"],
      columns: [
        { key: "low", label: "低经济方", unit: null },
        { key: "high", label: "高经济方", unit: null },
        { key: "rounds", label: "样本", unit: null },
        { key: "rate", label: "低经济方胜率", unit: "%" },
      ],
      rows: matrix.map((row) => ({
        low: row.lowEconomy,
        high: row.highEconomy,
        rounds: row.rounds,
        rate: row.lowWinRatePercent,
      })),
    },
    {
      title: "小枪翻盘排行",
      text: [],
      sampleDescription: `${upsets.length} 行 · 全部筛选结果`,
      limitations: [],
      columns: [
        { key: "team", label: "队伍", unit: null },
        { key: "wins", label: "胜场", unit: null },
        { key: "opps", label: "机会", unit: null },
        { key: "rate", label: "胜率", unit: "%" },
      ],
      rows: upsets.map((row) => ({
        team: row.teamName,
        wins: row.wins,
        opps: row.opportunities,
        rate: row.winRatePercent,
      })),
    },
  ];
  return captureAnalysisResult({
    ...source,
    conditions: [
      ...source.conditions,
      ...(source.context.focus.kind === "player" ||
      source.context.focus.kind === "self"
        ? ["经济统计按比赛范围计算，未按个人筛选。"]
        : []),
    ],
    title: "经济与转化",
    page: "economy",
    sections,
    limitations: ["经济结果仅提供比赛来源，不虚构逐格证据。"],
  });
}
