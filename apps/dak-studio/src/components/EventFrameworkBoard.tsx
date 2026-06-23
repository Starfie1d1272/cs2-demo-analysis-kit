import type { EventStage } from "@cs2dak/contract";
import { frameworkSlots, type MakerSeriesDraft } from "../lib/event-maker";
import type { BracketCell, ElimModel, SwissModel } from "../lib/event-bracket";
import { ElimBracket, SwissBracket } from "./EventBracket";

export interface FrameworkSelection {
  stageKey: string;
  slotId: string;
}

interface EventFrameworkBoardProps {
  stages: EventStage[];
  series: MakerSeriesDraft[];
  selected: FrameworkSelection | null;
  onSelect: (selection: FrameworkSelection) => void;
  onAddMatch: (stageKey: string, slotId: string) => void;
}

const STAGE_TYPE_LABEL: Record<EventStage["type"], string> = {
  round_robin: "单循环",
  swiss: "瑞士轮",
  single_elim: "单败淘汰",
  double_elim: "双败淘汰",
  gsl_group: "GSL 双败小组",
};

/** lane 中文段标题；single 无标题（单败不分段）。 */
const LANE_LABEL: Record<string, string | null> = {
  single: null,
  winner: "胜者组",
  loser: "败者组",
  grand: "总决赛",
};

/** 槽位绑定的系列：淘汰赛节点按 bracketNodeId，瑞士轮/循环赛 bucket 按战绩组标签。 */
export function seriesInSlot(series: MakerSeriesDraft[], stageKey: string, slot: { id: string; kind: "node" | "bucket"; label: string }): MakerSeriesDraft[] {
  return series.filter((row) =>
    row.stage === stageKey &&
    (slot.kind === "node" ? row.bracketNodeId === slot.id : !row.bracketNodeId && row.entryRound === slot.label),
  );
}

function draftCell(row: MakerSeriesDraft, key: string): BracketCell {
  const hasTeams = Boolean(row.teamAName && row.teamBName);
  return {
    key,
    teamA: row.teamAName || null,
    teamB: row.teamBName || null,
    scoreA: null,
    scoreB: null,
    winner: null,
    date: row.resources[0]?.occurredAt ?? null,
    empty: !hasTeams && row.resources.length === 0,
  };
}

/** 淘汰赛格子 key 固定模板（空槽位）。 */
const EMPTY_CELL: BracketCell = { key: "", teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, date: null, empty: true };

/** 从框架槽位构造淘汰赛模型：按 round 去重排序，每 round 一列，匹配已绑定的系列。 */
function buildElimModel(
  laneSlots: ReturnType<typeof frameworkSlots>,
  series: MakerSeriesDraft[],
  stageKey: string,
): ElimModel {
  const rounds = [...new Set(laneSlots.map((slot) => slot.round))].sort((a, b) => a - b);
  const total = rounds.length;
  return {
    columns: rounds.map((round, index) => ({
      round,
      label: total === 1
        ? (LANE_LABEL[laneSlots[0]?.lane ?? "single"] ?? "决赛")
        : index === total - 1 ? "决赛" : index === total - 2 ? "半决赛" : `第 ${index + 1} 轮`,
      matches: laneSlots.filter((slot) => slot.round === round).map((slot) => {
        const bound = seriesInSlot(series, stageKey, slot)[0];
        return bound ? draftCell(bound, slot.id) : { ...EMPTY_CELL, key: slot.id };
      }),
    })),
  };
}

/**
 * 赛事框架板（制作器输入侧）：与观看侧共用 SwissBracket/ElimBracket 渲染——
 * 淘汰赛节点成 bracket、瑞士轮成战绩组，点击格子在下方编辑并附 demo，瑞士轮战绩组可"添加比赛"。
 */
export function EventFrameworkBoard({ stages, series, selected, onSelect, onAddMatch }: EventFrameworkBoardProps) {
  return (
    <>
      {stages.map((stage) => {
        const slots = frameworkSlots(stage);
        const head = (
          <div className="stu-fb-stage-head">
            <b>{stage.name}</b>
            <span className="stu-muted">{STAGE_TYPE_LABEL[stage.type]}</span>
          </div>
        );

        if (slots.some((slot) => slot.kind === "node")) {
          // 淘汰赛：每节点一格，cell.key = 节点 id（即槽位 id）。双败 / GSL 按 lane（胜者组 /
          // 败者组 / 总决赛）分段渲染，单败只有一条 single lane（保持原样）。
          const lanes = [...new Set(slots.map((slot) => slot.lane))];
          const multiLane = lanes.length > 1;
          return (
            <div key={stage.key} className="stu-card">
              {head}
              {lanes.map((lane) => {
                const laneSlots = slots.filter((slot) => slot.lane === lane);
                const laneLabel = multiLane ? LANE_LABEL[lane] : null;
                return (
                  <div key={lane} className="stu-fb-lane">
                    {laneLabel && <div className="stu-fb-lane-head">{laneLabel}</div>}
                    <ElimBracket model={buildElimModel(laneSlots, series, stage.key)} onSelectCell={(slotId) => onSelect({ stageKey: stage.key, slotId })} selectedKey={selected?.stageKey === stage.key ? selected.slotId : null} />
                  </div>
                );
              })}
            </div>
          );
        }

        // 瑞士轮 / 循环赛：战绩组（bucket），每组可加多场 + "添加比赛"。
        const rounds = [...new Set(slots.map((slot) => slot.round))].sort((a, b) => a - b);
        const cellToSlot = new Map<string, string>();
        const model: SwissModel = {
          columns: rounds.map((round) => ({
            round,
            groups: slots.filter((slot) => slot.round === round).map((slot) => {
              const matches = seriesInSlot(series, stage.key, slot).map((row) => {
                cellToSlot.set(row.key, slot.id);
                return draftCell(row, row.key);
              });
              return { record: slot.label, addSlotId: slot.id, matches };
            }),
          })),
          advanced: [],
          eliminated: [],
          winsTarget: 0,
          lossTarget: 0,
        };
        return (
          <div key={stage.key} className="stu-card">
            {head}
            <SwissBracket
              model={model}
              onAddToGroup={(slotId) => onAddMatch(stage.key, slotId)}
              onSelectCell={(cellKey) => onSelect({ stageKey: stage.key, slotId: cellToSlot.get(cellKey) ?? cellKey })}
            />
          </div>
        );
      })}
    </>
  );
}
