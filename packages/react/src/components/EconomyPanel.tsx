import type { EconomyPoint } from "@cs2dak/contract";

export interface EconomyPanelProps {
  points: EconomyPoint[];
  teamAName: string;
  teamBName: string;
}

const width = 760;
const height = 260;
const pad = { left: 48, right: 18, top: 24, bottom: 34 };
const economyLabels = {
  pistol: "手枪",
  eco: "Eco",
  semi: "半起",
  force: "强起",
  full: "长枪",
  conversion: "长枪"
} as const;
const economyColors = {
  pistol: "rgba(255, 198, 77, 0.18)",
  eco: "rgba(104, 115, 129, 0.18)",
  semi: "rgba(73, 182, 255, 0.16)",
  force: "rgba(255, 122, 33, 0.18)",
  full: "rgba(83, 215, 126, 0.16)",
  conversion: "rgba(83, 215, 126, 0.16)"
} as const;

export function EconomyPanel({ points, teamAName, teamBName }: EconomyPanelProps) {
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.teamA, point.teamB]));
  const xFor = (index: number) => pad.left + (index / Math.max(points.length - 1, 1)) * (width - pad.left - pad.right);
  const yFor = (value: number) => pad.top + (1 - value / maxValue) * (height - pad.top - pad.bottom);
  const pathFor = (team: "teamA" | "teamB") =>
    points.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index)},${yFor(point[team])}`).join(" ");

  return (
    <div style={{ overflowX: "auto" }}>
      <svg className="dak-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="经济走势">
        {points.map((point, index) => (
          <g key={point.roundNumber}>
            <rect
              x={xFor(index) - 8}
              y={pad.top}
              width={16}
              height={(height - pad.top - pad.bottom) / 2}
              fill={economyColors[point.teamAEconomy]}
            />
            <rect
              x={xFor(index) - 8}
              y={pad.top + (height - pad.top - pad.bottom) / 2}
              width={16}
              height={(height - pad.top - pad.bottom) / 2}
              fill={economyColors[point.teamBEconomy]}
            />
            <text x={xFor(index)} y={height - 10} textAnchor="middle" fill="var(--dak-fg-dim)" fontSize="10">
              R{point.roundNumber}
            </text>
          </g>
        ))}
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yFor(maxValue * ratio)}
              y2={yFor(maxValue * ratio)}
              stroke="var(--dak-border)"
            />
            <text x={pad.left - 8} y={yFor(maxValue * ratio) + 4} textAnchor="end" fill="var(--dak-fg-dim)" fontSize="10">
              {Math.round(maxValue * ratio)}
            </text>
          </g>
        ))}
        <path d={pathFor("teamA")} fill="none" stroke="var(--dak-accent)" strokeWidth="3" />
        <path d={pathFor("teamB")} fill="none" stroke="var(--dak-accent-b)" strokeWidth="3" />
      </svg>
      <div className="dak-muted">
        <span style={{ color: "var(--dak-accent)" }}>{teamAName}</span>
        {" / "}
        <span style={{ color: "var(--dak-accent-b)" }}>{teamBName}</span>
        {" 每回合装备价值；背景色为每队经济类型"}
      </div>
      <div className="dak-economy-legend" aria-label="经济类型图例">
        {(Object.keys(economyLabels) as Array<keyof typeof economyLabels>).map((type) => (
          <span key={type}><i style={{ background: economyColors[type] }} />{economyLabels[type]}</span>
        ))}
      </div>
      <div className="dak-economy-rounds">
        {points.map((point) => (
          <div className="dak-economy-round" key={point.roundNumber}>
            <b>R{point.roundNumber}</b>
            <span className={point.winnerTeamKey === "teamA" ? "dak-economy-winner" : undefined}>{teamAName}: {economyLabels[point.teamAEconomy]}</span>
            <span className={point.winnerTeamKey === "teamB" ? "dak-economy-winner" : undefined}>{teamBName}: {economyLabels[point.teamBEconomy]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
