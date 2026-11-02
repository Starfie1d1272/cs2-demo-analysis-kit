import type { LineupCluster } from "@cs2dak/maps";
import { sortTableRows, type DataTableColumn } from "@cs2dak/react";
import type { LineupsPageState } from "./analysis-theme-state";
import { captureAnalysisResult, type AnalysisExportSource, type AnalysisResultSection } from "./analysis-export";

/** Receives the exact map/side/type projection already displayed by LineupView. */
export function buildLineupsAnalysisResult(source: AnalysisExportSource, rows: LineupCluster[], state: LineupsPageState, columns: DataTableColumn<LineupCluster>[], selected: LineupCluster | null, practiceCommand: string | null) {
  const sorted = sortTableRows(rows, columns, state.table.sort);
  const sections: AnalysisResultSection[] = [{ title: "道具点位", text: [], sampleDescription: `${sorted.length} 行 · 全部筛选结果`, limitations: ["图像未包含；点位是否有效需在比赛证据中核对。"], columns: [{ key: "grenade", label: "道具", unit: null }, { key: "side", label: "阵营", unit: null }, { key: "throw", label: "投掷位", unit: null }, { key: "effect", label: "落点", unit: null }, { key: "time", label: "时间", unit: null }, { key: "rounds", label: "出现回合", unit: null }, { key: "count", label: "投掷次数", unit: null }, { key: "matches", label: "场次", unit: null }, { key: "winRate", label: "胜率", unit: "%" }], rows: sorted.map(row => ({ grenade: row.grenade, side: row.side, throw: row.throwerPlaceName, effect: row.effectCallout, time: row.throwTimeBucket, rounds: row.roundNumbers.join("、"), count: row.count, matches: row.demoCount, winRate: row.winRatePercent })) }];
  if (selected) sections.push({ title: "选中点位", text: [selected.throwerPlaceName ?? "投掷位未知", selected.effectCallout ?? "落点未知", ...(practiceCommand ? [`练习命令：${practiceCommand}`] : [])], sampleDescription: `${selected.count} 次 · ${selected.demoCount} 场`, limitations: [], columns: [{ key: "entry", label: "来源", unit: null }, { key: "round", label: "回合", unit: null }, { key: "tick", label: "Tick", unit: null }], rows: selected.throws.map(row => ({ entry: row.entryId, round: row.roundNumber, tick: row.tick })) });
  return captureAnalysisResult({ ...source, title: "道具点位", page: "lineups", conditions: [...source.conditions, `聚类：${state.mode}`, `地图：${rows[0]?.mapName ?? state.mapName ?? "未知"}`, `道具：${state.grenade ?? "全部"}`, `阵营：${state.side ?? "全部"}`, `雷达候选上限：${state.radarTopN}`], sections, limitations: ["图像未包含。"] });
}
