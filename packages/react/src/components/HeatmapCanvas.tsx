import type { DemoViewModel, HeatmapPoint } from "@cs2dak/contract";
import { getMapCalibration, worldToRadar } from "@cs2dak/maps";
import { useMemo, useState } from "react";

export interface HeatmapCanvasProps {
  map: DemoViewModel["map"];
  points: HeatmapPoint[];
  mode?: HeatmapMode;
  onModeChange?: (mode: HeatmapMode) => void;
}

type HeatmapMode = HeatmapPoint["kind"];

const MODE_LABELS: Record<HeatmapMode, string> = {
  death: "死亡位置",
  kill: "击杀位置",
  grenade: "道具落点"
};

export function HeatmapCanvas({ map, points, mode: controlledMode, onModeChange }: HeatmapCanvasProps) {
  const [internalMode, setInternalMode] = useState<HeatmapMode>("death");
  const [radius, setRadius] = useState(52);
  const [blur, setBlur] = useState(2);
  const [opacity, setOpacity] = useState(54);
  const mode = controlledMode ?? internalMode;
  const setMode = (nextMode: HeatmapMode) => {
    setInternalMode(nextMode);
    onModeChange?.(nextMode);
  };
  const calibration = getMapCalibration(map.name);
  const counts = useMemo(
    () => ({
      death: points.filter((point) => point.kind === "death").length,
      kill: points.filter((point) => point.kind === "kill").length,
      grenade: points.filter((point) => point.kind === "grenade").length
    }),
    [points]
  );
  const renderable = calibration
    ? points
        .filter((point) => point.kind === mode)
        .map((point) => ({ source: point, radar: worldToRadar(point, calibration) }))
        .filter((point) => !point.radar.outOfBounds)
    : [];

  return (
    <div
      className="dak-heatmap"
      aria-label={`${map.name} heatmap preview`}
      style={map.radarImageUrl ? { backgroundImage: `url(${map.radarImageUrl})` } : undefined}
    >
      <div className="dak-heatmap-controls" role="radiogroup" aria-label="热力图类型">
        {(Object.keys(MODE_LABELS) as HeatmapMode[]).map((kind) => (
          <button
            key={kind}
            type="button"
            className={mode === kind ? "dak-mode dak-mode-active" : "dak-mode"}
            onClick={() => setMode(kind)}
            aria-checked={mode === kind}
            role="radio"
          >
            {MODE_LABELS[kind]} <span>{counts[kind]}</span>
          </button>
        ))}
      </div>
      <div className="dak-heatmap-tuning" aria-label="热力图参数">
        <label>半径 <input type="range" min="18" max="96" value={radius} onChange={(event) => setRadius(Number(event.target.value))} /></label>
        <label>虚化 <input type="range" min="0" max="16" value={blur} onChange={(event) => setBlur(Number(event.target.value))} /></label>
        <label>强度 <input type="range" min="18" max="90" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
      </div>
      {!map.radarImageUrl && <SchematicRadar mapName={map.name} />}
      {renderable.map((point, index) => (
        <span
          key={`${point.source.kind}-${point.source.roundNumber}-${index}`}
          className="dak-heatmap-point"
          style={{
            left: `${(point.radar.x / (calibration?.radarSize ?? 1024)) * 100}%`,
            top: `${(point.radar.y / (calibration?.radarSize ?? 1024)) * 100}%`,
            width: `${radius}px`,
            height: `${radius}px`,
            filter: `blur(${blur}px)`,
            background:
              point.source.kind === "death"
                ? `radial-gradient(circle, rgba(255,84,112,${opacity / 100}), rgba(255,84,112,0))`
                : point.source.kind === "grenade"
                  ? `radial-gradient(circle, rgba(255,196,77,${opacity / 100}), rgba(255,196,77,0))`
                  : `radial-gradient(circle, rgba(77,212,122,${opacity / 100}), rgba(77,212,122,0))`
          }}
        />
      ))}
      <div className="dak-heatmap-legend">
        <span><i className={mode === "death" ? "dak-legend-death" : mode === "kill" ? "dak-legend-kill" : "dak-legend-grenade"} /> {MODE_LABELS[mode]}</span>
      </div>
    </div>
  );
}

function SchematicRadar({ mapName }: { mapName: string }) {
  return (
    <div className="dak-radar-schematic" aria-hidden="true">
      <div className="dak-radar-grid" />
      <span className="dak-site dak-site-a">A</span>
      <span className="dak-site dak-site-b">B</span>
      <span className="dak-radar-label dak-radar-label-mid">MID</span>
      <span className="dak-radar-label dak-radar-label-name">{mapName}</span>
      <span className="dak-lane dak-lane-main" />
      <span className="dak-lane dak-lane-side" />
      <span className="dak-lane dak-lane-mid" />
    </div>
  );
}
