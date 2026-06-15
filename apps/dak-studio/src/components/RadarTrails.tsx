import { useMemo } from "react";
import { getMapCalibration, worldToRadar } from "@cs2dak/maps";

export const GRENADE_COLOR: Record<string, string> = {
  flashbang: "var(--dak-grenade-flashbang)",
  smoke: "var(--dak-grenade-smoke)",
  molotov: "var(--dak-grenade-molotov)",
  incendiary: "var(--dak-grenade-incendiary)",
  hegrenade: "var(--dak-grenade-hegrenade)",
  decoy: "var(--dak-grenade-decoy)",
};

/** 烟/火的近似作用半径（游戏单位），只服务视觉示意。 */
export const EFFECT_RADIUS_UNITS: Partial<Record<string, number>> = {
  smoke: 144,
  molotov: 120,
  incendiary: 120,
};

export interface RadarTrail {
  id: string;
  /** World-space points；RadarTrails 内部投影到 radar 坐标。 */
  points: Array<{ x: number; y: number }>;
  color: string;
  opacity?: number;
}

export interface RadarGrenadeOverlay {
  trailId: string;
  type: string;
  /** 投掷位置（world-space）。 */
  x: number;
  y: number;
  /** 落点/生效位置（world-space）。 */
  ex: number;
  ey: number;
  showEffect: boolean;
  effectActive: boolean;
}

export interface RadarTrailsProps {
  mapName: string;
  trails: RadarTrail[];
  grenades?: RadarGrenadeOverlay[];
  showTrails?: boolean;
  showGrenades?: boolean;
  trailOpacity?: number;
  className?: string;
}

export function RadarTrails({
  mapName,
  trails,
  grenades = [],
  showTrails = true,
  showGrenades = true,
  trailOpacity = 0.5,
  className = "stu-trail-stage",
}: RadarTrailsProps) {
  const calibration = useMemo(() => getMapCalibration(mapName), [mapName]);
  const size = calibration?.radarSize ?? 1024;

  const project = useMemo(
    () =>
      (point: { x: number; y: number }) => {
        if (!calibration) return { x: size / 2 + point.x / 10, y: size / 2 - point.y / 10 };
        const radar = worldToRadar(point, calibration);
        return { x: radar.x, y: radar.y };
      },
    [calibration, size]
  );

  const projectedTrails = useMemo(
    () =>
      trails.map((trail) => ({
        ...trail,
        pts: trail.points.map((p) => project(p)),
      })),
    [trails, project]
  );

  const projectedGrenades = useMemo(
    () =>
      grenades.map((g) => ({
        ...g,
        throwPt: project({ x: g.x, y: g.y }),
        effectPt: project({ x: g.ex, y: g.ey }),
      })),
    [grenades, project]
  );

  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${mapName} 雷达图`}>
      <image href={`./maps/radars/${mapName}.png`} width={size} height={size} opacity={0.85} />
      {projectedTrails.map((trail) => {
        if (trail.pts.length === 0) return null;
        const head = trail.pts[trail.pts.length - 1]!;
        const opacity = trail.opacity ?? trailOpacity;
        return (
          <g key={trail.id}>
            {showTrails && trail.pts.length > 1 && (
              <polyline
                points={trail.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={trail.color}
                strokeWidth={size / 340}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={opacity}
              />
            )}
            <circle
              cx={head.x}
              cy={head.y}
              r={size / 110}
              fill={trail.color}
              stroke="#0b0e10"
              strokeWidth={size / 512}
              opacity={Math.min(1, opacity + 0.3)}
            />
          </g>
        );
      })}
      {showGrenades &&
        projectedGrenades.map((g, i) => {
          const scale = calibration?.scale ?? 10;
          const effectRadius = EFFECT_RADIUS_UNITS[g.type];
          return (
            <g key={`${g.trailId}-g${i}`}>
              {g.showEffect && (
                <line
                  x1={g.throwPt.x}
                  y1={g.throwPt.y}
                  x2={g.effectPt.x}
                  y2={g.effectPt.y}
                  stroke={GRENADE_COLOR[g.type] ?? "#fff"}
                  strokeWidth={size / 1024}
                  strokeDasharray={`${size / 256} ${size / 256}`}
                  opacity={0.55}
                />
              )}
              {g.effectActive && effectRadius != null && (
                <circle
                  cx={g.effectPt.x}
                  cy={g.effectPt.y}
                  r={effectRadius / scale}
                  fill={GRENADE_COLOR[g.type] ?? "#fff"}
                  opacity={0.22}
                  stroke={GRENADE_COLOR[g.type] ?? "#fff"}
                  strokeOpacity={0.5}
                  strokeWidth={size / 1024}
                />
              )}
              {g.showEffect && (
                <circle
                  cx={g.effectPt.x}
                  cy={g.effectPt.y}
                  r={size / 170}
                  fill={GRENADE_COLOR[g.type] ?? "#fff"}
                  opacity={0.95}
                  stroke="#0b0e10"
                  strokeWidth={size / 680}
                />
              )}
              <circle
                cx={g.throwPt.x}
                cy={g.throwPt.y}
                r={size / 240}
                fill="none"
                stroke={GRENADE_COLOR[g.type] ?? "#fff"}
                strokeWidth={size / 768}
                opacity={0.8}
              />
            </g>
          );
        })}
    </svg>
  );
}
