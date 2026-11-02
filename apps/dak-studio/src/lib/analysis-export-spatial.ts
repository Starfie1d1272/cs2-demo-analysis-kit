import type { OpeningTrailRound, RadarField } from "@cs2dak/tactics";
import type { OpeningPageState, ControlPageState } from "./spatial-view-state";
import {
  captureAnalysisResult,
  type AnalysisExportSource,
} from "./analysis-export";

export function buildOpeningAnalysisResult(
  source: AnalysisExportSource,
  rounds: OpeningTrailRound[],
  player: string,
  state: OpeningPageState,
  missingReplay: string[],
) {
  const visible = rounds.filter(
    (row) =>
      !state.hiddenRoundKeys.includes(`${row.matchId}#R${row.roundNumber}`),
  );
  return captureAnalysisResult({
    ...source,
    title: `${player} · 开局动线`,
    page: "opening",
    conditions: [
      ...source.conditions,
      `地图：${state.mapName ?? "未知"}`,
      `阵营：${state.side}`,
      `场次：${state.recentMatchCount ? `最近 ${state.recentMatchCount} 场（仅有日期）` : "全部"}`,
      `经济：长枪局`,
      `时间：${state.timeSeconds}s / 30s`,
      `轨迹：${state.showTrails ? "显示" : "隐藏"}；道具：${state.showGrenades ? "显示" : "隐藏"}`,
    ],
    sections: [
      {
        title: "样本回合",
        text: missingReplay.length
          ? [`缺少回放：${missingReplay.join("、")}`]
          : [],
        sampleDescription: `${visible.length} 个显示回合`,
        limitations: ["图像和回放帧未包含。"],
        columns: [
          { key: "match", label: "比赛", unit: null },
          { key: "round", label: "回合", unit: null },
          { key: "side", label: "阵营", unit: null },
          { key: "economy", label: "经济", unit: null },
        ],
        rows: visible.map((row) => ({
          match: row.matchId,
          round: row.roundNumber,
          side: row.side,
          economy: row.economyType,
        })),
      },
    ],
    limitations: ["图像和回放帧未包含。"],
  });
}
export function buildControlAnalysisResult(
  source: AnalysisExportSource,
  field: RadarField,
  baseline: RadarField | null,
  state: ControlPageState,
) {
  return captureAnalysisResult({
    ...source,
    title: "控图覆盖场",
    page: "control",
    conditions: [
      ...source.conditions,
      ...(source.context.focus.kind === "player" ||
      source.context.focus.kind === "self"
        ? ["覆盖场按比赛范围计算，未按个人筛选。"]
        : []),
      `地图：${field.mapName}`,
      `对象：${field.scope.team ?? "赛事地图基线"}`,
      `经济：${field.scope.economy}`,
      `模式：${state.mode}`,
      `时间：${state.second}s`,
      `层：${state.level}`,
    ],
    sections: [
      {
        title: "覆盖样本",
        text: [
          `当前样本 ${field.scope.matchIds.length} 场、${field.scope.roundCount} 回合。`,
          ...(baseline
            ? [
                `比较基线 ${baseline.scope.matchIds.length} 场、${baseline.scope.roundCount} 回合。`,
              ]
            : []),
          `遮挡数据：${field.triAvailability}`,
        ],
        columns: [
          { key: "scope", label: "范围", unit: null },
          { key: "matches", label: "场次", unit: null },
          { key: "rounds", label: "回合", unit: null },
        ],
        rows: [
          {
            scope: field.scope.team ?? "赛事地图基线",
            matches: field.scope.matchIds.length,
            rounds: field.scope.roundCount,
          },
          ...(baseline
            ? [
                {
                  scope: "比较基线",
                  matches: baseline.scope.matchIds.length,
                  rounds: baseline.scope.roundCount,
                },
              ]
            : []),
        ],
        sampleDescription: `${field.scope.roundCount} 回合`,
        limitations: ["覆盖格不提供回合反查；图像未包含。"],
      },
    ],
    limitations: ["图像未包含；覆盖结果仅为描述性观察。"],
  });
}
