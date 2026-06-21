import type { BracketCell, ElimModel, SwissModel } from "../lib/event-bracket";

interface CellHandlers {
  onOpenMatch?: (entryId: string) => void;
  onSelectCell?: (key: string) => void;
  selectedKey?: string | null;
}

function MatchBox({ cell, onOpenMatch, onSelectCell, selectedKey }: { cell: BracketCell } & CellHandlers) {
  if (cell.empty) {
    return (
      <button type="button" className={`stu-eb-box stu-eb-box-empty${selectedKey === cell.key ? " stu-eb-box-sel" : ""}`} onClick={() => onSelectCell?.(cell.key)}>
        + 附加 demo
      </button>
    );
  }
  const openId = cell.entryIds?.[0];
  const onClick = () => (openId && onOpenMatch ? onOpenMatch(openId) : onSelectCell?.(cell.key));
  const interactive = Boolean((openId && onOpenMatch) || onSelectCell);
  return (
    <div
      className={`stu-eb-box${selectedKey === cell.key ? " stu-eb-box-sel" : ""}${interactive ? " stu-eb-box-click" : ""}`}
      role={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
    >
      <div className={`stu-eb-team${cell.winner === "A" ? " stu-eb-win" : cell.winner === "B" ? " stu-eb-lose" : ""}`}>
        <span>{cell.teamA ?? "—"}</span>
        <b>{cell.scoreA ?? (cell.teamA ? "" : "")}</b>
      </div>
      <div className={`stu-eb-team${cell.winner === "B" ? " stu-eb-win" : cell.winner === "A" ? " stu-eb-lose" : ""}`}>
        <span>{cell.teamB ?? "—"}</span>
        <b>{cell.scoreB ?? ""}</b>
      </div>
      {cell.date && <div className="stu-eb-date">{new Date(cell.date).toLocaleDateString("zh-CN")}</div>}
    </div>
  );
}

/** 瑞士轮 Buchholz 图：按轮次成列，列内按战绩组（高战绩在上），右侧晋级（绿）/ 淘汰（红）终列。 */
export function SwissBracket({
  model,
  onAddToGroup,
  ...handlers
}: { model: SwissModel; onAddToGroup?: (slotId: string) => void } & CellHandlers) {
  return (
    <div className="stu-eb stu-eb-swiss">
      {model.columns.map((col, colIndex) => (
        <div key={`col-${colIndex}-${col.round}`} className="stu-eb-col">
          <div className="stu-eb-col-head">第 {col.round} 轮</div>
          {col.groups.map((group) => (
            <div key={`${col.round}-${group.record}`} className="stu-eb-group">
              <div className="stu-eb-group-head">{group.record}</div>
              {group.matches.map((cell) => <MatchBox key={cell.key} cell={cell} {...handlers} />)}
              {group.addSlotId && (
                <button type="button" className="stu-eb-add" onClick={() => onAddToGroup?.(group.addSlotId!)}>+ 添加比赛</button>
              )}
            </div>
          ))}
        </div>
      ))}
      {(model.advanced.length > 0 || model.eliminated.length > 0) && (
        <div className="stu-eb-col stu-eb-outcomes">
          <div className="stu-eb-col-head">结果</div>
          {model.advanced.length > 0 && (
            <div className="stu-eb-outcome stu-eb-advanced">
              <div className="stu-eb-group-head">晋级 ({model.advanced.length})</div>
              {model.advanced.map((row, index) => <div key={`adv-${index}-${row.team}`} className="stu-eb-outcome-row"><span>{row.team}</span><b>{row.record}</b></div>)}
            </div>
          )}
          {model.eliminated.length > 0 && (
            <div className="stu-eb-outcome stu-eb-eliminated">
              <div className="stu-eb-group-head">淘汰 ({model.eliminated.length})</div>
              {model.eliminated.map((row, index) => <div key={`eli-${index}-${row.team}`} className="stu-eb-outcome-row"><span>{row.team}</span><b>{row.record}</b></div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 淘汰赛 bracket：按晋级轮次成列（决赛在右），列内居中排布，胜者高亮。 */
export function ElimBracket({ model, ...handlers }: { model: ElimModel } & CellHandlers) {
  return (
    <div className="stu-eb stu-eb-elim">
      {model.columns.map((col) => (
        <div key={col.round} className="stu-eb-col stu-eb-elim-col">
          <div className="stu-eb-col-head">{col.label}</div>
          <div className="stu-eb-elim-matches">
            {col.matches.map((cell) => <MatchBox key={cell.key} cell={cell} {...handlers} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
