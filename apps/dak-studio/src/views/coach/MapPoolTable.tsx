import { useEffect, useState } from "react";
import type { ObservedMapPoolRow } from "@cs2dak/analytics";
import { listMapPoolNotes, saveMapPoolNote } from "../../lib/series.js";

export interface MapPoolTableProps { rows: ObservedMapPoolRow[]; hasOwn: boolean; hasOpponent: boolean }
function pct(value: number | null): string { return value == null ? "—" : `${value.toFixed(1)}%`; }
export function MapPoolTable({ rows: maps, hasOwn, hasOpponent }: MapPoolTableProps) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => { void listMapPoolNotes().then(setNotes); }, []);

  if (!hasOpponent) {
    return <div className="stu-card stu-empty">在上方「对手队伍」里选择即将交手的对手，这里会把它（与我的队伍）各自跨所有对手聚合后按地图比较。</div>;
  }

  if (maps.length === 0) {
    return <div className="stu-card stu-empty">暂无地图数据，请导入 demo。</div>;
  }

  return (
    <div className="stu-card">
      <h3>地图池比较</h3>
      <table className="stu-mini-table stu-map-pool-table">
        <thead>
          <tr>
            <th>地图</th>
            {hasOwn && <th className="stu-num">我方场次</th>}
            {hasOwn && <th className="stu-num">我方回合</th>}
            {hasOwn && <th className="stu-num">我方胜率</th>}
            <th className="stu-num">对手场次</th>
            <th className="stu-num">对手回合</th>
            <th className="stu-num">对手胜率</th>
            <th>对手高频打法</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {maps.map((row) => (
            <tr key={row.mapName}>
              <td>{row.mapName.replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase())}</td>
              {hasOwn && <td className="stu-num">{row.own.matchCount}</td>}
              {hasOwn && <td className="stu-num">{row.own.roundCount}</td>}
              {hasOwn && <td className="stu-num">{pct(row.own.winRatePercent)}</td>}
              <td className="stu-num">{row.opponent.matchCount}</td>
              <td className="stu-num">{row.opponent.roundCount}</td>
              <td className="stu-num">{pct(row.opponent.winRatePercent)}</td>
              <td>
                {row.topOpponentPatternNames.length > 0
                  ? row.topOpponentPatternNames.map((p, i) => <div key={i}>{p}</div>)
                  : "—"}
              </td>
              <td>
                <input
                  className="stu-input stu-input-sm"
                  value={notes[row.mapName] ?? ""}
                  placeholder="备注…"
                  onChange={(e) => {
                    const note = e.target.value;
                    setNotes((n) => ({ ...n, [row.mapName]: note }));
                    void saveMapPoolNote(row.mapName, note);
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
