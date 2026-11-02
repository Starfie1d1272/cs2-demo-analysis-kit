import type { MatchWorkspaceModel } from "@cs2dak/presentation";
import { ANALYSIS_MANIFEST } from "./analysis-manifest";
import type { AnalysisContext } from "./analysis-context";
import type { StudioDemoEntry } from "./demo-entry";
import { sourceRefForEntry, type StudioSourceRef } from "./saved-evidence";
import type { AnalysisPageId } from "./studio-navigation";
import { roundMatchesFilter, type MatchWorkspaceState } from "./match-workspace-state";
import { matchesQuickRound } from "./match-review";

export type ExportCell = string | number | boolean | null;
export interface AnalysisResultSection {
  title: string;
  text: string[];
  columns: Array<{ key: string; label: string; unit: string | null }>;
  rows: Array<Record<string, ExportCell>>;
  sampleDescription: string;
  limitations: string[];
}
export interface AnalysisResultSnapshotV1 {
  schemaVersion: 1;
  title: string;
  generatedAt: number;
  appVersion: string;
  page: AnalysisPageId | "match";
  context: AnalysisContext | null;
  scopeSummary: string;
  conditions: string[];
  sources: StudioSourceRef[];
  sections: AnalysisResultSection[];
  limitations: string[];
}

/** Capture only the data explicitly projected by the page, independently of later edits. */
export function captureAnalysisResult(input: Omit<AnalysisResultSnapshotV1, "schemaVersion" | "generatedAt" | "appVersion" | "sources"> & { entries: StudioDemoEntry[] }): AnalysisResultSnapshotV1 {
  const { entries, ...result } = input;
  return structuredClone({
    ...result, schemaVersion: 1 as const, generatedAt: Date.now(), appVersion: ANALYSIS_MANIFEST.appVersion,
    sources: entries.map(entry => {
      const source = sourceRefForEntry(entry);
      // Legacy records can contain paths; only the final filename belongs in a report.
      return { ...source, fileName: source.fileName.split(/[\\/]/).pop() ?? "" };
    }),
    sections: result.sections.map(section => ({ ...section, rows: section.rows.map(row => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === "number" && !Number.isFinite(value) ? null : value]),
    )) })),
  });
}

/** Fixed projection of the already loaded single-match report model. */
export function buildMatchAnalysisResult(model: MatchWorkspaceModel, entry: StudioDemoEntry, state: MatchWorkspaceState): AnalysisResultSnapshotV1 {
  const rounds = model.rounds.filter(row => roundMatchesFilter(row, state.roundExplorer.filter) && matchesQuickRound(row, state.quickRoundFilter, state.reviewPlayerSteamId64));
  const conditions = [`复盘选手：${model.scoreboard.find(row => row.steamId64 === state.reviewPlayerSteamId64)?.name ?? "全部"}`, `快捷回合筛选：${state.quickRoundFilter}`, `回合筛选：${JSON.stringify(state.roundExplorer.filter)}`, "记分板与关键回合为整场；回合表应用当前回合筛选。"];
  return captureAnalysisResult({
    title: model.title, page: "match", context: null, scopeSummary: `${model.mapName} · ${model.scoreline}`,
    conditions, entries: [entry], limitations: ["图像、回放帧和原始 ZIP 未包含；此文件不能重建旧算法环境。"],
    sections: [
      { title: "记分板", text: [], sampleDescription: `${model.scoreboard.length} 名选手`, limitations: [],
        columns: [{ key: "name", label: "选手", unit: null }, { key: "team", label: "队伍", unit: null }, { key: "kills", label: "击杀", unit: null }, { key: "deaths", label: "死亡", unit: null }, { key: "assists", label: "助攻", unit: null }, { key: "adr", label: "ADR", unit: null }, { key: "kast", label: "KAST", unit: "%" }, { key: "rr", label: "RR", unit: null }],
        rows: model.scoreboard.map(row => ({ name: row.name, team: model.teams[row.teamKey].name, kills: row.fieldAvailability.playerStats === "available" ? row.kills : null, deaths: row.fieldAvailability.playerStats === "available" ? row.deaths : null, assists: row.fieldAvailability.playerStats === "available" ? row.assists : null, adr: row.fieldAvailability.damages === "available" ? row.adr : null, kast: row.fieldAvailability.rounds === "available" ? row.kast : null, rr: row.accountRR })) },
      { title: "关键回合", text: [], sampleDescription: `${model.reportHighlights.length} 个关键回合`, limitations: [],
        columns: [{ key: "round", label: "回合", unit: null }, { key: "score", label: "比分", unit: null }, { key: "winner", label: "胜方", unit: null }, { key: "tags", label: "标签", unit: null }],
        rows: model.reportHighlights.map(row => ({ round: row.roundNumber, score: row.scoreBefore, winner: row.winnerSide, tags: row.tags.join("、") })) },
      { title: "经济与回合", text: [], sampleDescription: `${rounds.length} 个回合（全部筛选结果）`, limitations: [],
        columns: [{ key: "round", label: "回合", unit: null }, { key: "score", label: "比分", unit: null }, { key: "winner", label: "胜方", unit: null }, { key: "economyA", label: "A 队经济", unit: null }, { key: "economyB", label: "B 队经济", unit: null }, { key: "reason", label: "结束方式", unit: null }],
        rows: rounds.map(row => ({ round: row.roundNumber, score: row.scoreBefore, winner: row.winnerSide, economyA: row.teamAEconomy, economyB: row.teamBEconomy, reason: row.endReason })) },
    ],
  });
}

function escapeMarkdown(value: ExportCell): string {
  return String(value ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}
export function analysisResultMarkdown(snapshot: AnalysisResultSnapshotV1): string {
  const lines = [`# ${escapeMarkdown(snapshot.title)}`, "", `范围：${escapeMarkdown(snapshot.scopeSummary)}`, `生成时间：${new Date(snapshot.generatedAt).toISOString()}`, `应用版本：${escapeMarkdown(snapshot.appVersion)}`, "", "## 条件", ...snapshot.conditions.map(value => `- ${escapeMarkdown(value)}`)];
  for (const section of snapshot.sections) {
    lines.push("", `## ${escapeMarkdown(section.title)}`, "", escapeMarkdown(section.sampleDescription), ...section.text.map(escapeMarkdown));
    if (section.columns.length) {
      lines.push("", `| ${section.columns.map(column => escapeMarkdown(column.label + (column.unit ? ` (${column.unit})` : ""))).join(" | ")} |`, `| ${section.columns.map(() => "---").join(" | ")} |`);
      for (const row of section.rows) lines.push(`| ${section.columns.map(column => escapeMarkdown(row[column.key] ?? null)).join(" | ")} |`);
    }
    lines.push(...section.limitations.map(value => `- 局限：${escapeMarkdown(value)}`));
  }
  lines.push("", "## 来源", ...snapshot.sources.map(source => `- ${escapeMarkdown(source.fileName)} · ${escapeMarkdown(source.mapName)} · entry ${escapeMarkdown(source.entryId)} · match ${escapeMarkdown(source.matchId)} · SHA-256 ${escapeMarkdown(source.demoSha256)} · 构建版本 ${escapeMarkdown(source.builtWith ? JSON.stringify(source.builtWith) : null)}`), "", "## 局限", ...snapshot.limitations.map(value => `- ${escapeMarkdown(value)}`));
  return lines.join("\n");
}
