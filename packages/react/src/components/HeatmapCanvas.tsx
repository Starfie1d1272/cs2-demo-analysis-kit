/**
 * Canvas-based heatmap renderer.
 *
 * Two-pass algorithm adapted from simpleheat (BSD-2-Clause) and CS Demo Manager:
 *   1. Stamp blurred grayscale circles at each event point — dense areas accumulate
 *      higher alpha values.
 *   2. Colorize: map each pixel's accumulated alpha through a gradient LUT.
 *
 * This replaces the previous DOM-span approach which could not render true density.
 */
import type { DemoViewModel, GrenadeType, HeatmapPoint, Side, TeamKey } from "@cs2dak/contract";
import { getMapCalibration, worldToRadar, hasLowerLevel, levelAt, type MapLevel } from "@cs2dak/maps";
import { useEffect, useMemo, useRef, useState } from "react";

// ── HeatmapRenderer (adapted from simpleheat / CS Demo Manager, BSD-2-Clause) ─

class HeatmapRenderer {
  private ctx: CanvasRenderingContext2D;
  private stamp: HTMLCanvasElement;
  private gradient = new Uint8ClampedArray(256 * 4);
  private radius = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    this.stamp = document.createElement("canvas");
  }

  setRadius(r: number, blur = 15) {
    const ctx = this.stamp.getContext("2d") as CanvasRenderingContext2D;
    this.radius = r + blur;
    this.stamp.width = this.radius * 2;
    this.stamp.height = this.radius * 2;
    ctx.clearRect(0, 0, this.stamp.width, this.stamp.height);
    // Draw the circle off-canvas; only its shadow falls within bounds.
    ctx.shadowOffsetX = ctx.shadowOffsetY = this.radius * 2;
    ctx.shadowBlur = blur;
    ctx.shadowColor = "black";
    ctx.beginPath();
    ctx.arc(-this.radius, -this.radius, r, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
  }

  setGradient(stops: Record<number, string>) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 256;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    for (const [stop, color] of Object.entries(stops)) {
      grad.addColorStop(Number(stop), color);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1, 256);
    this.gradient = ctx.getImageData(0, 0, 1, 256).data;
  }

  draw(points: Array<[number, number]>, stampAlpha: number, finalAlpha: number) {
    const { ctx } = this;
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);

    for (const [x, y] of points) {
      ctx.globalAlpha = stampAlpha;
      ctx.drawImage(this.stamp, x - this.radius, y - this.radius);
    }

    if (width > 0 && height > 0) {
      const image = ctx.getImageData(0, 0, width, height);
      this.colorize(image.data, finalAlpha);
      ctx.putImageData(image, 0, 0);
    }
  }

  private colorize(pixels: Uint8ClampedArray, alpha: number) {
    const { gradient } = this;
    for (let i = 0; i < pixels.length; i += 4) {
      const j = pixels[i + 3] * 4;
      if (j) {
        pixels[i]     = gradient[j];
        pixels[i + 1] = gradient[j + 1];
        pixels[i + 2] = gradient[j + 2];
        pixels[i + 3] = pixels[i + 3] * alpha;
      }
    }
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_SIZE = 1024;

// Classic heat-map gradient, matching CS Demo Manager's default palette.
const HEAT_GRADIENT: Record<number, string> = {
  0.4: "blue",
  0.6: "cyan",
  0.7: "lime",
  0.8: "yellow",
  1.0: "red",
};

type HeatmapMode = HeatmapPoint["kind"];

const MODE_LABELS: Record<HeatmapMode, string> = {
  death:   "死亡位置",
  kill:    "击杀位置",
  grenade: "道具落点",
};

const LEGEND_COLORS: Record<HeatmapMode, string> = {
  death:   "var(--dak-danger)",
  kill:    "var(--dak-ok)",
  grenade: "var(--dak-warn)",
};

// ── Grenade filter ────────────────────────────────────────────────────────────

// Exclude "incendiary" from the user-facing filter — it is grouped with "molotov"
// (CT side fires incendiary, T side fires molotov; they are the same weapon class).
type GrenadeFilter = "all" | Exclude<GrenadeType, "incendiary">;

const GRENADE_FILTER_OPTIONS: Array<{ value: GrenadeFilter; label: string }> = [
  { value: "all",       label: "全部" },
  { value: "flashbang", label: "闪光" },
  { value: "smoke",     label: "烟雾" },
  { value: "hegrenade", label: "手雷" },
  { value: "molotov",   label: "燃烧" },
  { value: "decoy",     label: "诱饵" },
];

function matchesGrenadeFilter(grenadeType: GrenadeType | null, filter: GrenadeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "molotov") return grenadeType === "molotov" || grenadeType === "incendiary";
  return grenadeType === filter;
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface HeatmapCanvasProps {
  map: DemoViewModel["map"];
  points: HeatmapPoint[];
  /** Player roster for per-player filtering. When omitted the filter UI is hidden. */
  players?: Array<{ steamId64: string; name: string; teamKey: TeamKey }>;
  mode?: HeatmapMode;
  onModeChange?: (mode: HeatmapMode) => void;
}

export function HeatmapCanvas({ map, points, players, mode: controlledMode, onModeChange }: HeatmapCanvasProps) {
  const [internalMode, setInternalMode] = useState<HeatmapMode>("death");
  const [radius, setRadius] = useState(25);
  const [blur, setBlur]     = useState(15);
  const [opacity, setOpacity] = useState(0.72);
  const [grenadeFilter, setGrenadeFilter] = useState<GrenadeFilter>("all");
  const [sideFilter, setSideFilter] = useState<Side | "all">("all");
  // Empty set = all players shown.
  const [selectedSteamIds, setSelectedSteamIds] = useState<ReadonlySet<string>>(new Set());

  const mode = controlledMode ?? internalMode;
  const setMode = (next: HeatmapMode) => {
    setInternalMode(next);
    onModeChange?.(next);
  };

  const togglePlayer = (steamId64: string) => {
    setSelectedSteamIds((prev) => {
      const next = new Set(prev);
      if (next.has(steamId64)) next.delete(steamId64);
      else next.add(steamId64);
      return next;
    });
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calibration = getMapCalibration(map.name);
  // de_nuke / de_vertigo 双层：按 z 高度把点位拆到上下层分别渲染
  const dualLevel = !!(calibration && hasLowerLevel(calibration) && map.lowerRadarImageUrl);
  const [level, setLevel] = useState<MapLevel>("upper");

  const counts = useMemo(() => ({
    death:   points.filter((p) => p.kind === "death").length,
    kill:    points.filter((p) => p.kind === "kill").length,
    grenade: points.filter((p) => p.kind === "grenade").length,
  }), [points]);

  const scaledPoints = useMemo<Array<[number, number]>>(() => {
    if (!calibration) return [];
    const cal = calibration;
    return points
      .filter((p) => {
        if (p.x === 0 && p.y === 0) return false;
        if (p.kind !== mode) return false;
        if (sideFilter !== "all" && p.side !== sideFilter) return false;
        if (mode === "grenade" && !matchesGrenadeFilter(p.grenadeType, grenadeFilter)) return false;
        if (selectedSteamIds.size > 0 && p.steamId64 && !selectedSteamIds.has(p.steamId64)) return false;
        if (dualLevel && levelAt(p.z, cal) !== level) return false;
        return true;
      })
      .flatMap((p) => {
        const radar = worldToRadar(p, cal);
        if (radar.outOfBounds) return [];
        return [[
          (radar.x / cal.radarSize) * CANVAS_SIZE,
          (radar.y / cal.radarSize) * CANVAS_SIZE,
        ] as [number, number]];
      });
  }, [points, mode, sideFilter, grenadeFilter, selectedSteamIds, calibration, dualLevel, level]);

  // Per-point stamp alpha following CS Demo Manager's approach: target ~10 overlapping
  // events to fully saturate a spot. Floor at 0.1 so isolated events are faintly visible.
  const stampAlpha = useMemo(() => {
    const n = scaledPoints.length;
    return Math.min(1.0, Math.max(0.1, 10 / Math.max(1, n)));
  }, [scaledPoints.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Always set dimensions; resetting width also clears the canvas.
    canvas.width  = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    if (!calibration || scaledPoints.length === 0) return;

    const renderer = new HeatmapRenderer(canvas);
    renderer.setGradient(HEAT_GRADIENT);
    renderer.setRadius(radius, blur);
    renderer.draw(scaledPoints, stampAlpha, opacity);
  }, [scaledPoints, stampAlpha, radius, blur, opacity, calibration]);

  const hasData = scaledPoints.length > 0;

  return (
    <div className="dak-heatmap-wrap" aria-label={`${map.name} heatmap`}>
      {/* ── Filter toolbar (outside the radar image) ── */}
      <div className="dak-heatmap-filters">
        <div className="dak-heatmap-controls" role="radiogroup" aria-label="热力图类型">
          {(Object.keys(MODE_LABELS) as HeatmapMode[]).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={mode === kind}
              className={mode === kind ? "dak-mode dak-mode-active" : "dak-mode"}
              onClick={() => setMode(kind)}
            >
              {MODE_LABELS[kind]} <span>{counts[kind]}</span>
            </button>
          ))}
          {dualLevel && (
            <div className="dak-heatmap-side-filter" role="radiogroup" aria-label="地图层级">
              {(["upper", "lower"] as const).map((nextLevel) => (
                <button
                  key={nextLevel}
                  type="button"
                  role="radio"
                  aria-checked={level === nextLevel}
                  className={level === nextLevel ? "dak-sf-chip dak-sf-chip-active" : "dak-sf-chip"}
                  onClick={() => setLevel(nextLevel)}
                >
                  {nextLevel === "upper" ? "上层" : "下层"}
                </button>
              ))}
            </div>
          )}
          <div className="dak-heatmap-side-filter" role="radiogroup" aria-label="阵营">
            {(["all", "ct", "t"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sideFilter === s}
                className={sideFilter === s ? "dak-sf-chip dak-sf-chip-active" : "dak-sf-chip"}
                onClick={() => setSideFilter(s)}
              >
                {s === "all" ? "全部" : s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {mode === "grenade" && (
          <div className="dak-heatmap-grenade-filter" role="radiogroup" aria-label="道具类型">
            {GRENADE_FILTER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={grenadeFilter === value}
                className={grenadeFilter === value ? "dak-gf-chip dak-gf-chip-active" : "dak-gf-chip"}
                onClick={() => setGrenadeFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {players && players.length > 0 && (
          <div className="dak-heatmap-player-filter" aria-label="按选手筛选">
            <button
              type="button"
              className={selectedSteamIds.size === 0 ? "dak-pf-chip dak-pf-all dak-pf-chip-active" : "dak-pf-chip dak-pf-all"}
              onClick={() => setSelectedSteamIds(new Set())}
            >
              全部选手
            </button>
            {players.map((p) => (
              <button
                key={p.steamId64}
                type="button"
                className={[
                  "dak-pf-chip",
                  `dak-pf-chip-${p.teamKey}`,
                  selectedSteamIds.has(p.steamId64) ? "dak-pf-chip-active" : "",
                ].join(" ").trim()}
                onClick={() => togglePlayer(p.steamId64)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Radar image + canvas ── */}
      <div
        className="dak-heatmap"
        style={(() => {
          const url = dualLevel && level === "lower" ? map.lowerRadarImageUrl : map.radarImageUrl;
          return url ? { backgroundImage: `url(${url})` } : undefined;
        })()}
      >
        {!map.radarImageUrl && <SchematicRadar mapName={map.name} />}
        <canvas ref={canvasRef} className="dak-heatmap-canvas" aria-hidden="true" />
        {!calibration && <div className="dak-heatmap-empty">该地图暂无雷达标定</div>}
        {calibration && !hasData && <div className="dak-heatmap-empty">当前筛选条件下暂无位置数据</div>}
        <div className="dak-heatmap-legend">
          <span>
            <i style={{ background: LEGEND_COLORS[mode] }} />
            {MODE_LABELS[mode]}
            {scaledPoints.length > 0 && <small> · {scaledPoints.length} 个事件</small>}
          </span>
          <span className="dak-heatmap-legend-scale">
            <i className="dak-legend-cold" />冷
            <i className="dak-legend-warm" />热
          </span>
        </div>
      </div>

      {/* ── Tuning sliders (outside the radar image) ── */}
      <div className="dak-heatmap-tuning" aria-label="热力图参数">
        <label>半径 <input type="range" min={10} max={60} value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></label>
        <label>虚化 <input type="range" min={2}  max={30} value={blur}   onChange={(e) => setBlur(Number(e.target.value))} /></label>
        <label>强度 <input type="range" min={20} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} /></label>
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
