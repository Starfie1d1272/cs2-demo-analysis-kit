import { economyLabelCn, type EconomyConversion } from "@cs2dak/presentation";

export interface EconomyConversionPanelProps {
  /** One team's per-economy-type conversion (from buildEconomyConversion). */
  stats: EconomyConversion;
  teamName: string;
}

export function EconomyConversionPanel({ stats, teamName }: EconomyConversionPanelProps) {
  const entries = Object.entries(stats).sort(([, a], [, b]) => b.winRate - a.winRate);

  if (entries.length === 0) {
    return (
      <div className="dak-econ-conv" aria-label={`${teamName} 经济转化率`}>
        <p className="dak-empty">暂无经济数据</p>
      </div>
    );
  }

  return (
    <div className="dak-econ-conv" aria-label={`${teamName} 经济转化率`}>
      <table className="dak-table">
        <thead>
          <tr>
            <th>经济类型</th>
            <th>回合</th>
            <th>胜</th>
            <th>胜率</th>
            <th className="dak-econ-conv-bar-col">胜率条</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([economy, s]) => (
            <tr key={economy}>
              <td>{economyLabelCn(economy)}</td>
              <td className="dak-mono">{s.played}</td>
              <td className="dak-mono">{s.won}</td>
              <td className="dak-mono">{(s.winRate * 100).toFixed(1)}%</td>
              <td className="dak-econ-conv-bar-col">
                <div className="dak-winrate-bar">
                  <div
                    className="dak-winrate-fill"
                    style={{ width: `${Math.round(s.winRate * 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
