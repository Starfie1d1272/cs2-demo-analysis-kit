import type { TeamComparisonModel } from "@cs2dak/presentation";

/**
 * 队伍对比（赛前侦察）：选 A/B 两队 → 各自跨全部己方比赛的状态对比。
 * 两队**无需互相交手**。纯展示：选队与跳回放都通过回调上报，由容器接数据。
 */
export function TeamComparisonPanel({
  model,
  onSelectPair,
  onOpenMatch
}: {
  model: TeamComparisonModel;
  /** 选定 A/B 两队（触发重新聚合）；不传则下拉只读。 */
  onSelectPair?: (a: string, b: string) => void;
  /** 打开某场比赛回放。 */
  onOpenMatch?: (matchId: string) => void;
}) {
  if (model.availableTeams.length < 2) {
    return <div className="dak-empty">至少需要两个队伍的比赛才能生成对比。</div>;
  }
  const selectedA = model.teams[0]?.teamName ?? "";
  const selectedB = model.teams[1]?.teamName ?? "";

  const picker = (
    <div className="dak-team-picker">
      <TeamSelect
        value={selectedA}
        teams={model.availableTeams}
        exclude={selectedB}
        disabled={!onSelectPair}
        onChange={(next) => onSelectPair?.(next, selectedB)}
      />
      <span className="dak-team-picker-vs">VS</span>
      <TeamSelect
        value={selectedB}
        teams={model.availableTeams}
        exclude={selectedA}
        disabled={!onSelectPair}
        onChange={(next) => onSelectPair?.(selectedA, next)}
      />
    </div>
  );

  if (model.teams.length !== 2) {
    return (
      <div className="dak-team-compare">
        {picker}
        <div className="dak-empty">选择两个不同的队伍生成对比。</div>
      </div>
    );
  }
  const [a, b] = model.teams;
  return (
    <div className="dak-team-compare">
      {picker}
      <div className="dak-team-compare-grid">
        <TeamSide side={a} onOpenMatch={onOpenMatch} />
        <section className="dak-team-radar" aria-label="队伍差异">
          {model.radar.map((row) => (
            <div key={row.metric} className="dak-team-radar-row">
              <span>{row.label}</span>
              <b>{row.a == null ? "—" : row.a}</b>
              <i />
              <b>{row.b == null ? "—" : row.b}</b>
              <em>{row.delta == null ? "—" : row.delta > 0 ? `+${row.delta}` : row.delta}</em>
            </div>
          ))}
        </section>
        <TeamSide side={b} onOpenMatch={onOpenMatch} />
      </div>
    </div>
  );
}

function TeamSelect({
  value,
  teams,
  exclude,
  disabled,
  onChange
}: {
  value: string;
  teams: TeamComparisonModel["availableTeams"];
  exclude: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <select
      className="dak-team-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label="选择对比队伍"
    >
      {teams.map((team) => (
        <option key={team.name} value={team.name} disabled={team.name === exclude}>
          {team.name}（{team.matches} 场）
        </option>
      ))}
    </select>
  );
}

function TeamSide({
  side,
  onOpenMatch
}: {
  side: TeamComparisonModel["teams"][number];
  onOpenMatch?: (matchId: string) => void;
}) {
  return (
    <section className="dak-team-side">
      <h3>
        {side.teamName} <small className="dak-muted">{side.matchCount} 场</small>
      </h3>
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
      {side.matches.length > 0 && (
        <div className="dak-team-matches">
          {side.matches.map((match) => (
            <button
              key={match.matchId}
              type="button"
              className="dak-team-match"
              disabled={!onOpenMatch}
              onClick={() => onOpenMatch?.(match.matchId)}
              title={`${match.mapName} · vs ${match.opponent} · ${match.roundsWon}-${match.roundsLost}`}
            >
              <span className={match.won ? "dak-team-match-win" : "dak-team-match-loss"}>{match.won ? "胜" : "负"}</span>
              <span className="dak-team-match-opp">vs {match.opponent}</span>
              <small>{match.mapName} · {match.roundsWon}-{match.roundsLost}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function fmt(value: number | null): string {
  return value == null ? "—" : value.toFixed(value >= 10 ? 1 : 2);
}
