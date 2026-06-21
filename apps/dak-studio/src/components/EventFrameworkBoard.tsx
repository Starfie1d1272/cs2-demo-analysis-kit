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
          // 淘汰赛：每节点一格，cell.key = 节点 id（即槽位 id），点击直接选中该槽。
          const rounds = [...new Set(slots.map((slot) => slot.round))].sort((a, b) => a - b);
          const total = rounds.length;
          const model: ElimModel = {
            columns: rounds.map((round, index) => ({
              round,
              label: round === total ? "决赛" : round === total - 1 ? "半决赛" : `第 ${round} 轮`,
              matches: slots.filter((slot) => slot.round === round).map((slot) => {
                const bound = seriesInSlot(series, stage.key, slot)[0];
                return bound ? draftCell(bound, slot.id) : { key: slot.id, teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, date: null, empty: true };
              }),
            })),
          };
          return (
            <div key={stage.key} className="stu-card">
              {head}
              <ElimBracket model={model} onSelectCell={(slotId) => onSelect({ stageKey: stage.key, slotId })} selectedKey={selected?.stageKey === stage.key ? selected.slotId : null} />
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
