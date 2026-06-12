import type { TeamComparisonModel } from "@cs2dak/presentation";

export function TeamComparisonPanel({
  model,
  onOpenEvidence
}: {
  model: TeamComparisonModel;
  onOpenEvidence?: (matchId: string, roundNumber: number, tick?: number) => void;
}) {
  if (model.teams.length !== 2) {
    return <div className="dak-empty">至少需要两个队伍才能生成对比。</div>;
  }
  const [a, b] = model.teams;
  return (
    <div className="dak-team-compare">
      <div className="dak-team-compare-grid">
        <TeamSide side={a} />
        <section className="dak-team-radar" aria-label="队伍差异">
          {model.radar.map((row) => (
            <div key={row.metric} className="dak-team-radar-row">
              <span>{row.label}</span>
              <b>{row.a == null ? "—" : row.a}</b>
              <i style={{ ["--dak-radar-a" as string]: `${scale(row.a)}%`, ["--dak-radar-b" as string]: `${scale(row.b)}%` }} />
              <b>{row.b == null ? "—" : row.b}</b>
              <em>{row.delta == null ? "—" : row.delta > 0 ? `+${row.delta}` : row.delta}</em>
            </div>
          ))}
        </section>
        <TeamSide side={b} />
      </div>
      {model.evidence.length > 0 && (
        <div className="dak-team-evidence">
          {model.evidence.slice(0, 8).map((item) => (
            <button
              key={`${item.matchId}-${item.roundNumber}-${item.tick ?? 0}`}
              type="button"
              onClick={() => onOpenEvidence?.(item.matchId, item.roundNumber, item.tick)}
              disabled={!onOpenEvidence}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamSide({ side }: { side: TeamComparisonModel["teams"][number] }) {
  return (
    <section className="dak-team-side">
      <h3>{side.teamName}</h3>
      <table>
        <thead>
          <tr><th>选手</th><th>RR</th><th>ADR</th><th>KAST</th><th>KPR</th><th>DPR</th></tr>
        </thead>
        <tbody>
          {side.players.slice(0, 8).map((row) => (
            <tr key={row.steamId64}>
              <td>{row.name}</td>
              <td>{fmt(row.rr)}</td>
              <td>{fmt(row.adr)}</td>
              <td>{fmt(row.kast)}</td>
              <td>{fmt(row.kpr)}</td>
              <td>{fmt(row.dpr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dak-team-weapons">
        {side.weaponPreference.slice(0, 5).map((weapon) => (
          <span key={weapon.weapon}>{weapon.label}<b>{weapon.sharePercent.toFixed(1)}%</b></span>
        ))}
      </div>
      <div className="dak-team-economy">
        {side.economyWinRate.map((row) => (
          <span key={row.economyType}>{row.economyType}<b>{row.winRatePercent == null ? "—" : `${row.winRatePercent.toFixed(1)}%`}</b></span>
        ))}
      </div>
    </section>
  );
}

function fmt(value: number | null): string {
  return value == null ? "—" : value.toFixed(value >= 10 ? 1 : 2);
}

function scale(value: number | null): number {
  if (value == null) return 0;
  return Math.max(4, Math.min(100, value >= 10 ? value : value * 40));
}

