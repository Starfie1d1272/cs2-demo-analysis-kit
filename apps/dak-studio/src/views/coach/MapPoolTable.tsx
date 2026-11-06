import type { ObservedMapPoolRow } from '@cs2dak/analytics';

export interface MapPoolTableProps {
  rows: ObservedMapPoolRow[];
  hasOwn: boolean;
  hasOpponent: boolean;
  notes: Record<string, string>;
  onNotesChange: (mapName: string, note: string) => void;
  onSave: (mapName: string) => void;
  saving: Record<string, boolean>;
  errors: Record<string, string>;
  ready: boolean;
}
function pct(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}
export function MapPoolTable({
  rows: maps,
  hasOwn,
  hasOpponent,
  notes,
  onNotesChange,
  onSave,
  saving,
  errors,
  ready,
}: MapPoolTableProps) {
  if (!hasOpponent) {
    return (
      <div className="stu-card stu-empty">
        在上方「对手队伍」里选择即将交手的对手，这里会把它（与我的队伍）各自跨所有对手聚合后按地图比较。
      </div>
    );
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
              <td>{row.mapName.replace(/^de_/, '').replace(/^\w/, (c) => c.toUpperCase())}</td>
              {hasOwn && <td className="stu-num">{row.own.matchCount}</td>}
              {hasOwn && <td className="stu-num">{row.own.roundCount}</td>}
              {hasOwn && <td className="stu-num">{pct(row.own.winRatePercent)}</td>}
              <td className="stu-num">{row.opponent.matchCount}</td>
              <td className="stu-num">{row.opponent.roundCount}</td>
              <td className="stu-num">{pct(row.opponent.winRatePercent)}</td>
              <td>
                {row.topOpponentPatternNames.length > 0
                  ? row.topOpponentPatternNames.map((p, i) => <div key={i}>{p}</div>)
                  : '—'}
              </td>
              <td>
                <input
                  className="stu-input stu-input-sm"
                  disabled={!ready}
                  value={notes[row.mapName] ?? ''}
                  placeholder={ready ? '备注…' : '备注尚未读取'}
                  onChange={(e) => onNotesChange(row.mapName, e.target.value)}
                />
                {saving[row.mapName] && <span role="status">保存中…</span>}
                {errors[row.mapName] && (
                  <button
                    type="button"
                    className="stu-button-sm"
                    onClick={() => onSave(row.mapName)}
                  >
                    重试保存
                  </button>
                )}
                {errors[row.mapName] && (
                  <div role="alert">保存失败，备注仍保留在此页面：{errors[row.mapName]}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
