import type { BracketCell, ElimModel, SwissModel } from "@cs2dak/contract";

// ── 内部接口 ──────────────────────────────────────────────────────────────

interface CellHandlers {
  onOpenMatch?: (entryId: string) => void;
  onSelectCell?: (key: string) => void;
  selectedKey?: string | null;
}

// ── MatchBox（DOM 模式） ──────────────────────────────────────────────────

function MatchBox({ cell, onOpenMatch, onSelectCell, selectedKey }: { cell: BracketCell } & CellHandlers) {
  if (cell.empty) {
    return (
      <button type="button" className={`dak-eb-box dak-eb-box-empty${selectedKey === cell.key ? " dak-eb-box-sel" : ""}`} onClick={() => onSelectCell?.(cell.key)}>
        + 附加 demo
      </button>
    );
  }
  const openId = cell.entryIds?.[0];
  const onClick = () => (openId && onOpenMatch ? onOpenMatch(openId) : onSelectCell?.(cell.key));
  const interactive = Boolean((openId && onOpenMatch) || onSelectCell);
  return (
    <div
      className={`dak-eb-box${selectedKey === cell.key ? " dak-eb-box-sel" : ""}${interactive ? " dak-eb-box-click" : ""}`}
      role={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
    >
      <div className={`dak-eb-team${cell.winner === "A" ? " dak-eb-win" : cell.winner === "B" ? " dak-eb-lose" : ""}`}>
        <span>{cell.teamA ?? "—"}</span>
        <b>{cell.scoreA ?? (cell.teamA ? "" : "")}</b>
      </div>
      <div className={`dak-eb-team${cell.winner === "B" ? " dak-eb-win" : cell.winner === "A" ? " dak-eb-lose" : ""}`}>
        <span>{cell.teamB ?? "—"}</span>
        <b>{cell.scoreB ?? ""}</b>
      </div>
      {cell.date && <div className="dak-eb-date">{new Date(cell.date).toLocaleDateString("zh-CN")}</div>}
    </div>
  );
}

// ── SwissBracket ──────────────────────────────────────────────────────────

/** 瑞士轮 Buchholz 图：按轮次成列，列内按战绩组（高战绩在上），右侧晋级（绿）/ 淘汰（红）终列。 */
export function SwissBracket({
  model,
  onAddToGroup,
  ...handlers
}: { model: SwissModel; onAddToGroup?: (slotId: string) => void } & CellHandlers) {
  return (
    <div className="dak-eb dak-eb-swiss">
      {model.columns.map((col, colIndex) => (
        <div key={`col-${colIndex}-${col.round}`} className="dak-eb-col">
          <div className="dak-eb-col-head">第 {col.round} 轮</div>
          <div className="dak-eb-col-body">
          {col.groups.map((group) => (
            <div key={`${col.round}-${group.record}`} className="dak-eb-group">
              <div className="dak-eb-group-head">{group.record}</div>
              {group.matches.map((cell) => <MatchBox key={cell.key} cell={cell} {...handlers} />)}
              {group.addSlotId && (
                <button type="button" className="dak-eb-add" onClick={() => onAddToGroup?.(group.addSlotId!)}>+ 添加比赛</button>
              )}
            </div>
          ))}
          </div>
        </div>
      ))}
      {(model.advanced.length > 0 || model.eliminated.length > 0) && (
        <div className="dak-eb-col dak-eb-outcomes">
          <div className="dak-eb-col-head">结果</div>
          {model.advanced.length > 0 && (
            <div className="dak-eb-outcome dak-eb-advanced">
              <div className="dak-eb-group-head">晋级 ({model.advanced.length})</div>
              {model.advanced.map((row, index) => <div key={`adv-${index}-${row.team}`} className="dak-eb-outcome-row"><span>{row.team}</span><b>{row.record}</b></div>)}
            </div>
          )}
          {model.eliminated.length > 0 && (
            <div className="dak-eb-outcome dak-eb-eliminated">
              <div className="dak-eb-group-head">淘汰 ({model.eliminated.length})</div>
              {model.eliminated.map((row, index) => <div key={`eli-${index}-${row.team}`} className="dak-eb-outcome-row"><span>{row.team}</span><b>{row.record}</b></div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ElimBracket ───────────────────────────────────────────────────────────

const laneLabels = { single: "淘汰赛", winner: "胜者组", loser: "败者组", grand: "总决赛" } as const;

/**
 * 淘汰赛 bracket。
 * - 无 nodes（单败 / 制作器）：DOM 列布局，MatchBox 可点击。
 * - 有 nodes（双败 / GSL）：SVG lane-aware 布局 + 晋级连线，节点可点击。
 */
export function ElimBracket({ model, ...handlers }: { model: ElimModel } & CellHandlers) {
  const { nodes } = model;

  // ── SVG lane-aware 模式（双败 / GSL，有 bracketNodes） ──────────────────
  if (nodes && nodes.length > 0) {
    const rounds = [...new Set(nodes.map((node) => node.round))].sort((a, b) => a - b);
    const roundIndex = new Map(rounds.map((round, index) => [round, index]));
    const lanes = (["winner", "loser", "grand", "single"] as const).filter((lane) => nodes.some((node) => node.lane === lane));
    // 预分组：O(N) 建 Map，替代嵌套循环中 O(L*R*N) 的 nodes.filter()
    const nodesByLaneRound = new Map<string, typeof nodes>();
    const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
    for (const node of nodes) {
      const key = `${node.lane}|${node.round}`;
      const group = nodesByLaneRound.get(key);
      if (group) group.push(node);
      else nodesByLaneRound.set(key, [node]);
    }
    const maxPerRound = Math.max(1, ...rounds.map((round) => {
      let count = 0;
      for (const lane of lanes) count += (nodesByLaneRound.get(`${lane}|${round}`)?.length ?? 0);
      return count;
    }));
    const laneMode = lanes.length > 1;
    const laneHeight = Math.max(150, maxPerRound * 52);
    const width = Math.max(520, rounds.length * 260 + (laneMode ? 86 : 0));
    const height = laneMode ? lanes.length * laneHeight : Math.max(180, maxPerRound * 82);
    const positions = new Map<string, { x: number; y: number }>();
    for (const [laneIndex, lane] of lanes.entries()) {
      for (const round of rounds) {
        const rows = nodesByLaneRound.get(`${lane}|${round}`) ?? [];
        rows.forEach((node, index) => positions.set(node.id, {
          x: (roundIndex.get(round) ?? 0) * 260 + (laneMode ? 86 : 12),
          y: laneMode ? laneIndex * laneHeight + ((index + 0.5) * laneHeight) / rows.length : ((index + 0.5) * height) / rows.length,
        }));
      }
    }
    // 按 node id 查找对应的 BracketCell（已在 columns 中）
    const cellById = new Map<string, BracketCell>();
    for (const col of model.columns) {
      for (const cell of col.matches) cellById.set(cell.key, cell);
    }
    const label = model.columns.length > 0 ? model.columns.map((c) => c.label).join(" · ") : "淘汰赛";

    return <div className="dak-bracket-diagram" role="img" aria-label={`${label} 胜败晋级关系`}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {laneMode && lanes.map((lane, index) => <g key={lane}>
          {index > 0 && <line className="dak-bracket-lane-separator" x1="0" x2={width} y1={index * laneHeight} y2={index * laneHeight} />}
          <text className="dak-bracket-lane-label" x="12" y={index * laneHeight + 24}>{laneLabels[lane]}</text>
        </g>)}
        {/* 晋级连线 */}
        {nodes.flatMap((node) => {
          const from = positions.get(node.id)!;
          return ([{ target: node.nextWinNodeId, loss: false }, { target: node.nextLossNodeId, loss: true }] as const).flatMap(({ target, loss }) => {
            const to = target ? positions.get(target) : null;
            if (!to) return [];
            const startX = from.x + 210;
            const endX = to.x;
            const midX = (startX + endX) / 2;
            return <path key={`${node.id}-${target}-${loss ? "loss" : "win"}`} className={loss ? "dak-bracket-edge dak-bracket-edge-loss" : "dak-bracket-edge"} d={`M ${startX} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${endX} ${to.y}`}><title>{`${node.label} ${loss ? "败者" : "胜者"}进入 ${nodeById.get(target!)?.label ?? target}`}</title></path>;
          });
        })}
        {/* 节点 */}
        {nodes.map((node) => {
          const position = positions.get(node.id)!;
          const cell = cellById.get(node.id);
          const openId = cell?.entryIds?.[0];
          const interactive = Boolean((openId && handlers.onOpenMatch) || handlers.onSelectCell);
          const score = cell
            ? (cell.teamA || cell.teamB) ? `${cell.teamA ?? "—"} ${cell.scoreA ?? ""} : ${cell.teamB ?? "—"} ${cell.scoreB ?? ""}` : "待导入"
            : "待导入";
          const isSelected = handlers.selectedKey === node.id;
          return <g
            key={node.id}
            transform={`translate(${position.x} ${position.y - 25})`}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            style={{ cursor: interactive ? "pointer" : undefined }}
            onClick={interactive ? () => {
              if (openId && handlers.onOpenMatch) handlers.onOpenMatch(openId);
              else handlers.onSelectCell?.(node.id);
            } : undefined}
          >
            <rect className="dak-bracket-box" width="210" height="50" rx="4" />
            <rect className={`dak-bracket-box${isSelected ? " dak-eb-box-sel" : ""}`} width="210" height="50" rx="4" fill="transparent" />
            <text className="dak-bracket-box-title" x="10" y="19">{node.label}</text>
            <text className="dak-bracket-box-match" x="10" y="38">{score}</text>
          </g>;
        })}
      </svg>
    </div>;
  }

  // ── DOM 列模式（单败 / 制作器，无 nodes） ───────────────────────────────
  return (
    <div className="dak-eb dak-eb-elim">
      {model.columns.map((col) => (
        <div key={col.round} className="dak-eb-col dak-eb-elim-col">
          <div className="dak-eb-col-head">{col.label}</div>
          <div className="dak-eb-col-body dak-eb-elim-matches">
            {col.matches.map((cell) => <MatchBox key={cell.key} cell={cell} {...handlers} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
