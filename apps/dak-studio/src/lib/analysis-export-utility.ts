import type { UtilityValueRow, UtilityValueSummary } from "@cs2dak/analytics";
import { sortTableRows, type DataTableColumn } from "@cs2dak/react";
import type { UtilityPageState } from "./studio-page-state";
import { captureAnalysisResult, type AnalysisExportSource, type AnalysisResultSection } from "./analysis-export";

/** Export the same filtered lists, defaults, and column sort used by UtilityView. */
export function buildUtilityAnalysisResult(source: AnalysisExportSource, model: UtilityValueSummary, state: UtilityPageState, columns: { he: DataTableColumn<UtilityValueRow>[]; fire: DataTableColumn<UtilityValueRow>[]; flash: DataTableColumn<UtilityValueRow>[]; smoke: DataTableColumn<UtilityValueRow>[] }) {
  const groups = [
    { key: "he" as const, title: "HE 伤害", filter: (r: UtilityValueRow) => r.heThrows > 0, sort: "heDamagePerThrow", fields: [["heThrows", "HE 数", null], ["heDamagePerThrow", "HE 伤害/颗", null], ["heDamagePerRound", "HE 伤害/回合", null], ["heDamage", "HE 总伤害", null]] },
    { key: "fire" as const, title: "火焰伤害", filter: (r: UtilityValueRow) => r.fireThrows > 0, sort: "fireDamagePerThrow", fields: [["fireThrows", "火数", null], ["fireDamagePerThrow", "火焰伤害/颗", null], ["fireDamagePerRound", "火焰伤害/回合", null], ["fireDamage", "火焰总伤害", null]] },
    { key: "flash" as const, title: "闪光", filter: (r: UtilityValueRow) => r.flashesThrown > 0, sort: "enemyBlindSecondsPerRound", fields: [["flashesThrown", "闪光数", null], ["enemyBlindSecondsPerRound", "闪光时间/回合", "s"], ["enemyBlindSecondsPerFlash", "闪光时间/颗", "s"], ["flashAssistsPerRound", "闪光助攻/回合", null]] },
    { key: "smoke" as const, title: "烟雾", filter: (r: UtilityValueRow) => r.smokesThrown > 0, sort: "smokesPerRound", fields: [["smokesThrown", "烟数", null], ["smokesPerRound", "烟/回合", null]] },
  ];
  const sections: AnalysisResultSection[] = [];
  for (const group of groups) for (const kind of ["Players", "Teams"] as const) {
    const rows = (kind === "Players" ? model.players : model.teams).filter(group.filter);
    const table = state.tables[`${group.key}${kind}`];
    const sorted = sortTableRows(rows, columns[group.key], table?.sort ?? { key: group.sort, direction: "desc" });
    const fields = [["name", "对象", null], ["rounds", "回合", null], ...group.fields] as Array<[keyof UtilityValueRow, string, string | null]>;
    sections.push({ title: `${group.title} · ${kind === "Players" ? "选手榜" : "队伍榜"}`, text: [], sampleDescription: `${rows.length} 行 · 全部筛选结果`, limitations: [], columns: fields.map(([key, label, unit]) => ({ key, label, unit })), rows: sorted.map(row => Object.fromEntries(fields.map(([key]) => [key, row[key] as string | number | null]))) });
  }
  sections.push({ title: "闪光候选", text: [], sampleDescription: `${Math.min(model.bestFlashes.length, 12)} 条有限候选，不是统计分母`, limitations: [], columns: [{ key: "player", label: "选手", unit: null }, { key: "match", label: "比赛", unit: null }, { key: "round", label: "回合", unit: null }, { key: "tick", label: "Tick", unit: null }, { key: "victims", label: "人数", unit: null }, { key: "seconds", label: "敌方致盲", unit: "s" }], rows: model.bestFlashes.slice(0, 12).map(row => ({ player: row.playerName, match: row.matchId, round: row.roundNumber, tick: row.tick ?? null, victims: row.victimCount, seconds: row.enemySeconds })) });
  sections.push({ title: "伤害回合候选", text: [], sampleDescription: `${model.bestDamageRounds.length} 条有限候选，不是统计分母`, limitations: [], columns: [{ key: "player", label: "选手", unit: null }, { key: "kind", label: "道具", unit: null }, { key: "match", label: "比赛", unit: null }, { key: "round", label: "回合", unit: null }, { key: "tick", label: "Tick", unit: null }, { key: "victims", label: "人数", unit: null }, { key: "damage", label: "伤害", unit: null }], rows: model.bestDamageRounds.map(row => ({ player: row.playerName, kind: row.kind, match: row.matchId, round: row.roundNumber, tick: row.tick ?? null, victims: row.victimCount, damage: row.damage })) });
  return captureAnalysisResult({ ...source, title: "道具价值", page: "utility", sections, limitations: ["候选为有限示例，不代表全部事件或统计分母。"] });
}
