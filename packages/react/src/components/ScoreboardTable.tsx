import type { PlayerScoreboardRow, TeamKey } from "@cs2dak/contract";

export interface ScoreboardTableProps {
  rows: PlayerScoreboardRow[];
  /**
   * When provided, each player row becomes clickable (mouse + keyboard) and
   * reports the clicked player's steamId64. Lets an embedding app (RivalHub,
   * CS2-insight-agent) wire up navigation without forking this component.
   */
  onPlayerClick?: (steamId64: string) => void;
}

function teamColor(teamKey: TeamKey): string {
  return teamKey === "teamA" ? "var(--dak-accent)" : "var(--dak-accent-b)";
}

export function ScoreboardTable({ rows, onPlayerClick }: ScoreboardTableProps) {
  return (
    <table className="dak-table">
      <thead>
        <tr>
          <th>选手</th>
          <th>V2 RR</th>
          <th>RR</th>
          <th>K</th>
          <th>D</th>
          <th>A</th>
          <th>ADR</th>
          <th>KAST</th>
          <th>HS</th>
          <th>首杀</th>
          <th>补枪</th>
          <th>AWP</th>
          <th>道具伤害</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.steamId64}
            className={onPlayerClick ? "dak-row-clickable" : undefined}
            onClick={onPlayerClick ? () => onPlayerClick(row.steamId64) : undefined}
            onKeyDown={
              onPlayerClick
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPlayerClick(row.steamId64);
                    }
                  }
                : undefined
            }
            tabIndex={onPlayerClick ? 0 : undefined}
            role={onPlayerClick ? "button" : undefined}
            aria-label={onPlayerClick ? `查看 ${row.name} 详情` : undefined}
          >
            <td>
              <span className="dak-team-chip">
                <span className="dak-team-dot" style={{ background: teamColor(row.teamKey) }} />
                <span>{row.name}</span>
              </span>
            </td>
            <td className="dak-mono dak-rr">{row.accountRR.toFixed(3)}</td>
            <td className="dak-mono dak-rr">{row.rr.toFixed(2)}</td>
            <td className="dak-mono">{row.kills}</td>
            <td className="dak-mono">{row.deaths}</td>
            <td className="dak-mono">{row.assists}</td>
            <td className="dak-mono">{row.adr.toFixed(1)}</td>
            <td className="dak-mono">{row.kast.toFixed(1)}%</td>
            <td className="dak-mono">{row.headshotPercent.toFixed(0)}%</td>
            <td className="dak-mono">{row.entryKills}</td>
            <td className="dak-mono">{row.tradeKills}</td>
            <td className="dak-mono">{row.awpKills}</td>
            <td className="dak-mono">{row.utilityDamage}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
