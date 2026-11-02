import { displayWeaponName, duelClassificationLabel } from "@cs2dak/presentation";
import { displayTeamName } from "./identity";
import type { DuelInsightsModel } from "@cs2dak/contract";
import type { DuelPageState } from "./analysis-theme-state";
import { filteredDuelRows, groupDuelMechanics } from "./duel-export-projection";
import { captureAnalysisResult, type AnalysisExportSource, type AnalysisResultSection } from "./analysis-export";

export function buildDuelAnalysisResult(source: AnalysisExportSource, model: DuelInsightsModel, state: DuelPageState, teamRenames: Record<string, string>) {
  const sections: AnalysisResultSection[] = [];
  if (state.tab === "records" || state.tab === "opening") {
    const counts = new Map<string, number>();
    for (const row of model.openingRows) counts.set(row.mapName, (counts.get(row.mapName) ?? 0) + 1);
    const names = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    const map = state.openingMapName && names.includes(state.openingMapName) ? state.openingMapName : names[0] ?? "de_mirage";
    const rows = state.tab === "records" ? filteredDuelRows(model.duelRows, state.evidenceFilter, state.weaponCategory) : model.openingRows.filter(row => row.mapName === map);
    sections.push({ title: state.tab === "records" ? "交火证据" : `首次交火 · ${map}`, text: [], sampleDescription: `${rows.length} 行 · 全部筛选结果`, limitations: state.tab === "opening" ? ["图像未包含。"] : [], columns: [{ key: "match", label: "比赛", unit: null }, { key: "map", label: "地图", unit: null }, { key: "round", label: "回合", unit: null }, { key: "tick", label: "Tick", unit: null }, { key: "killer", label: "击杀者", unit: null }, { key: "victim", label: "受害者", unit: null }, { key: "weapon", label: "武器", unit: null }, { key: "class", label: "分类", unit: null }, { key: "ttk", label: "击杀耗时", unit: "ms" }, { key: "thirdParty", label: "第三方", unit: null }], rows: rows.map(row => ({ match: row.matchId, map: row.mapName, round: row.roundNumber, tick: row.tick, killer: row.killerName, victim: row.victimName, weapon: displayWeaponName(row.weapon), class: duelClassificationLabel(row.classification), ttk: row.ttkMs, thirdParty: row.thirdParty })) });
  } else {
    // The page groups and orders all players before paginating, showing at most three weapons per player.
    const players = groupDuelMechanics(model.mechanicsRows, model.duelRows);
    const rows = players.flatMap(player => player.rows.slice(0, 3).flatMap(row => row.metrics.map(metric => ({ player: row.playerName, team: displayTeamName(row.teamName, teamRenames), weapon: displayWeaponName(row.weapon), kills: row.killCount, shots: row.shotCount, metric: metric.label, value: metric.value, unit: metric.unit ?? null, successes: metric.successes ?? null, attempts: metric.attempts ?? null, sample: metric.sampleSize ?? null, detail: metric.detail ?? null }))));
    sections.push({ title: "枪法机制", text: model.notes, sampleDescription: `${players.length} 名选手 · 全部筛选结果；每人页面显示最多三种武器`, limitations: [], columns: [{ key: "player", label: "选手", unit: null }, { key: "team", label: "队伍", unit: null }, { key: "weapon", label: "武器", unit: null }, { key: "kills", label: "击杀", unit: null }, { key: "shots", label: "发数", unit: null }, { key: "metric", label: "指标", unit: null }, { key: "value", label: "数值", unit: null }, { key: "unit", label: "单位", unit: null }, { key: "successes", label: "分子", unit: null }, { key: "attempts", label: "分母", unit: null }, { key: "sample", label: "样本", unit: null }, { key: "detail", label: "说明", unit: null }], rows });
  }
  return captureAnalysisResult({ ...source, title: "交火与配合", page: "duel", conditions: [...source.conditions, `子页：${state.tab}`, ...(state.tab === "records" ? [`证据筛选：${state.evidenceFilter}`, `武器：${state.weaponCategory}`] : state.tab === "opening" ? [`地图：${sections[0]?.title ?? "未知"}`] : [])], sections, limitations: [] });
}
