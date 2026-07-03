/**
 * RadarFieldCanvas —— 雷达覆盖场渲染（描述性，不上评分）。
 *
 * 吃聚合后的 RadarField（赛事基线或单队），逐秒 scrubber + 模式切换 + 队伍−基线差分。
 * 渲染移植自已验证原型（coverage-render）：每格柔化径向 blob，顺序场叠加成热力、
 * 差分场红↑/蓝↓。合成/归一化在 @cs2dak/presentation（react 不跑分析），这里只画。
 *
 * 复用 dak-heatmap-* 设计语言与 worldToRadar / 双层处理，与 HeatmapCanvas 视觉一致。
 */
import type { RadarField } from "@cs2dak/contract";
import { RADAR_FIELD_MODES, radarModeFrame, type RadarFieldMode } from "@cs2dak/presentation";
import {
  getMapCalibration,
  worldToRadar,
  hasLowerLevel,
  levelAt,
  type MapLevel,
} from "@cs2dak/maps";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const CANVAS_SIZE = 1024;
const PLAYBACK_INTERVAL_MS = 250;
const MIN_VISIBLE_MAG = 0.005;
const MIN_VISIBLE_PRESENCE_MAG = 0.003;
const WEAK_ZONE_MAX = 0.06;

type Band = [number, string];
type BandKind = "screen" | "aim" | "presence" | "sound" | "contested";

// 按去 0 后的真实 decile 分档；低频边界是控图的主要信息。
const BAND_COLORS = [
  "52,67,154",
  "71,94,180",
  "54,139,210",
  "45,190,205",
  "82,218,158",
  "184,214,94",
  "255,196,77",
  "255,132,68",
  "255,90,114",
  "255,54,94",
] as const;

function band(...limits: number[]): Band[] {
  return limits.map((limit, index) => [limit, BAND_COLORS[Math.min(index, BAND_COLORS.length - 1)]!]);
}

const SCREEN_BANDS = band(0.005, 0.011, 0.017, 0.027, 0.04, 0.057, 0.08, 0.114, 0.176, 1.01);
const AIM_BANDS = band(0.004, 0.008, 0.013, 0.02, 0.03, 0.042, 0.059, 0.084, 0.133, 1.01);
const CONTESTED_BANDS = band(0.003, 0.006, 0.009, 0.013, 0.02, 0.028, 0.041, 0.057, 0.083, 1.01);
const PRESENCE_BANDS = band(0.001, 0.002, 0.003, 0.004, 0.006, 0.008, 0.011, 0.016, 0.026, 1.01);
const SOUND_BANDS = band(0.029, 0.068, 0.137, 0.219, 0.306, 0.392, 0.484, 0.584, 0.722, 1.01);
const DEFAULT_BANDS: Record<BandKind, Band[]> = {
  screen: SCREEN_BANDS,
  aim: AIM_BANDS,
  presence: PRESENCE_BANDS,
  sound: SOUND_BANDS,
  contested: CONTESTED_BANDS,
};
const MAP_BANDS: Partial<Record<string, Partial<Record<BandKind, Band[]>>>> = {
  de_ancient: {
    screen: band(0.007, 0.014, 0.023, 0.035, 0.05, 0.068, 0.087, 0.113, 0.156, 1.01),
    aim: band(0.005, 0.011, 0.018, 0.027, 0.038, 0.051, 0.067, 0.089, 0.123, 1.01),
    presence: band(0.002, 0.003, 0.004, 0.005, 0.006, 0.008, 0.011, 0.016, 0.025, 1.01),
    sound: band(0.043, 0.091, 0.179, 0.247, 0.315, 0.368, 0.43, 0.514, 0.64, 1.01),
    contested: band(0.004, 0.008, 0.012, 0.017, 0.025, 0.034, 0.048, 0.065, 0.092, 1.01),
  },
  de_anubis: {
    screen: band(0.005, 0.01, 0.016, 0.024, 0.036, 0.052, 0.073, 0.109, 0.182, 1.01),
    aim: band(0.004, 0.008, 0.013, 0.019, 0.028, 0.04, 0.056, 0.083, 0.139, 1.01),
    presence: band(0.002, 0.003, 0.004, 0.005, 0.007, 0.009, 0.012, 0.017, 0.027, 1.01),
    sound: band(0.023, 0.054, 0.115, 0.193, 0.289, 0.382, 0.482, 0.591, 0.742, 1.01),
    contested: band(0.004, 0.006, 0.01, 0.014, 0.02, 0.028, 0.039, 0.055, 0.077, 1.01),
  },
  de_dust2: {
    screen: band(0.007, 0.012, 0.019, 0.029, 0.049, 0.075, 0.103, 0.145, 0.214, 1.01),
    aim: band(0.005, 0.009, 0.014, 0.022, 0.035, 0.052, 0.072, 0.101, 0.159, 1.01),
    presence: band(0.001, 0.002, 0.003, 0.004, 0.005, 0.007, 0.009, 0.014, 0.024, 1.01),
    sound: band(0.019, 0.044, 0.095, 0.169, 0.256, 0.343, 0.436, 0.536, 0.689, 1.01),
    contested: band(0.003, 0.006, 0.01, 0.015, 0.022, 0.033, 0.048, 0.067, 0.093, 1.01),
  },
  de_inferno: {
    screen: band(0.003, 0.006, 0.012, 0.023, 0.035, 0.052, 0.081, 0.121, 0.191, 1.01),
    aim: band(0.002, 0.005, 0.009, 0.017, 0.027, 0.04, 0.059, 0.088, 0.146, 1.01),
    presence: band(0.001, 0.002, 0.003, 0.004, 0.005, 0.007, 0.011, 0.017, 0.03, 1.01),
    sound: band(0.017, 0.044, 0.103, 0.192, 0.272, 0.362, 0.457, 0.567, 0.737, 1.01),
    contested: band(0.002, 0.003, 0.005, 0.007, 0.012, 0.022, 0.036, 0.055, 0.085, 1.01),
  },
  de_mirage: {
    screen: band(0.006, 0.012, 0.019, 0.031, 0.044, 0.06, 0.081, 0.116, 0.182, 1.01),
    aim: band(0.005, 0.009, 0.015, 0.022, 0.033, 0.044, 0.061, 0.088, 0.139, 1.01),
    presence: band(0.001, 0.002, 0.003, 0.004, 0.005, 0.007, 0.01, 0.014, 0.023, 1.01),
    sound: band(0.047, 0.092, 0.188, 0.272, 0.35, 0.421, 0.491, 0.573, 0.697, 1.01),
    contested: band(0.003, 0.006, 0.009, 0.013, 0.019, 0.028, 0.041, 0.057, 0.09, 1.01),
  },
  de_nuke: {
    screen: band(0.004, 0.008, 0.013, 0.02, 0.029, 0.04, 0.053, 0.074, 0.122, 1.01),
    aim: band(0.003, 0.006, 0.009, 0.014, 0.02, 0.028, 0.037, 0.051, 0.083, 1.01),
    presence: band(0.001, 0.002, 0.003, 0.005, 0.006, 0.009, 0.012, 0.017, 0.027, 1.01),
    sound: band(0.022, 0.092, 0.196, 0.311, 0.424, 0.528, 0.624, 0.719, 0.819, 1.01),
    contested: band(0.003, 0.005, 0.008, 0.012, 0.017, 0.024, 0.033, 0.045, 0.064, 1.01),
  },
  de_overpass: {
    screen: band(0.005, 0.011, 0.018, 0.026, 0.038, 0.053, 0.076, 0.11, 0.17, 1.01),
    aim: band(0.004, 0.008, 0.013, 0.02, 0.028, 0.04, 0.058, 0.083, 0.131, 1.01),
    presence: band(0.002, 0.003, 0.004, 0.005, 0.006, 0.008, 0.011, 0.015, 0.024, 1.01),
    sound: band(0.035, 0.066, 0.109, 0.179, 0.264, 0.36, 0.475, 0.593, 0.724, 1.01),
    contested: band(0.003, 0.006, 0.01, 0.015, 0.021, 0.029, 0.039, 0.053, 0.077, 1.01),
  },
};
const WEAK_RGB = "255,90,114"; // --dak-danger
const DIFF_POS_RGB = "255,90,114"; // --dak-danger
const DIFF_NEG_RGB = "73,182,255"; // --dak-accent-b

function bandKind(mode: RadarFieldMode): BandKind {
  if (mode === "ctAim" || mode === "tAim") return "aim";
  if (mode === "ctPres" || mode === "tPres") return "presence";
  if (mode === "ctSound" || mode === "tSound") return "sound";
  if (mode === "contested") return "contested";
  return "screen";
}

function bandsForMode(mapName: string, mode: RadarFieldMode): Band[] {
  const kind = bandKind(mode);
  return MAP_BANDS[mapName]?.[kind] ?? DEFAULT_BANDS[kind];
}

function heatBand(mapName: string, mode: RadarFieldMode, mag: number): string {
  const bands = bandsForMode(mapName, mode);
  for (const [hi, rgb] of bands) if (mag <= hi) return rgb;
  return "255,102,54";
}

function minVisibleMag(mode: RadarFieldMode): number {
  return mode === "ctPres" || mode === "tPres" ? MIN_VISIBLE_PRESENCE_MAG : MIN_VISIBLE_MAG;
}

function formatPct(value: number): string {
  const pct = value * 100;
  return pct >= 10 ? `${Math.round(pct)}%` : `${Number(pct.toFixed(1))}%`;
}

function bandLegend(mapName: string, mode: RadarFieldMode): string {
  return bandsForMode(mapName, mode).slice(0, -1).map(([hi]) => formatPct(hi)).join(" / ");
}

function formatClock(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, "0")}`;
}

export interface RadarFieldCanvasProps {
  field: RadarField;
  /** 非空 = 差分模式（队伍 − 赛事地图基线）：防守漏洞 / 进攻防守倾向。 */
  baseline?: RadarField | null;
  map: { name: string; radarImageUrl?: string | null; lowerRadarImageUrl?: string | null };
}

export function RadarFieldCanvas({ field, baseline = null, map }: RadarFieldCanvasProps) {
  const [mode, setMode] = useState<RadarFieldMode>("ctVis");
  const [sec, setSec] = useState(20);
  const [playing, setPlaying] = useState(false);
  const [weakZones, setWeakZones] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const calibration = getMapCalibration(map.name);
  const dualLevel = !!(calibration && hasLowerLevel(calibration) && map.lowerRadarImageUrl);
  const [level, setLevel] = useState<MapLevel>("upper");

  const isDiff = !!baseline;
  const maxSec = Math.max(0, field.maxSec - 1);

  useEffect(() => {
    setSec((value) => Math.min(value, maxSec));
  }, [maxSec]);

  useEffect(() => {
    if (!playing || maxSec <= 0) return undefined;
    const timer = window.setInterval(() => {
      setSec((value) => {
        if (value >= maxSec) {
          setPlaying(false);
          return maxSec;
        }
        return value + 1;
      });
    }, PLAYBACK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing, maxSec]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx || !calibration) return;

    const cal = calibration;
    const frame = radarModeFrame(field, baseline, mode, sec);
    const cells = field.grid.cells;
    const px2canvas = CANVAS_SIZE / cal.radarSize;
    const blobR = (field.grid.cellSize / cal.scale) * 2.2 * px2canvas;

    const showWeakZones = weakZones && !frame.signed && (mode === "ctVis" || mode === "tVis" || mode === "ctAim" || mode === "tAim");

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (showWeakZones) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(8,11,16,0.72)";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }
    ctx.globalCompositeOperation = frame.signed || showWeakZones ? "source-over" : "lighter";

    for (let g = 0; g < cells.length; g++) {
      const v = frame.values[g]!;
      const mag = Math.abs(v);
      if (!showWeakZones && mag < minVisibleMag(mode)) continue;
      if (showWeakZones && mag > WEAK_ZONE_MAX) continue;
      const cell = cells[g]!;
      if (dualLevel && levelAt(cell[2], cal) !== level) continue;
      const radar = worldToRadar({ x: cell[0], y: cell[1] }, cal);
      if (radar.outOfBounds) continue;
      const x = radar.x * px2canvas;
      const y = radar.y * px2canvas;
      const t = Math.min(1, mag / frame.cap);
      const op = showWeakZones ? 0.72 - 0.42 * Math.min(1, mag / WEAK_ZONE_MAX) : 0.38 + 0.5 * Math.pow(t, 0.55);
      const rgb = showWeakZones ? WEAK_RGB : frame.signed ? (v > 0 ? DIFF_POS_RGB : DIFF_NEG_RGB) : heatBand(map.name, mode, mag);
      const grd = ctx.createRadialGradient(x, y, 0, x, y, blobR);
      grd.addColorStop(0, `rgba(${rgb},${op.toFixed(2)})`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, blobR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }, [field, baseline, mode, sec, level, weakZones, calibration, dualLevel]);

  const bgUrl = dualLevel && level === "lower" ? map.lowerRadarImageUrl : map.radarImageUrl;
  const sequential = mode !== "info-diff" && !isDiff;
  const signedLegend = isDiff || mode === "info-diff";
  const canShowWeakZones = sequential && (mode === "ctVis" || mode === "tVis" || mode === "ctAim" || mode === "tAim");
  const legend = weakZones && canShowWeakZones
    ? "红 = 低频 / 薄弱区（≤6%）"
    : isDiff
      ? "红 = 高于赛事基线 · 蓝 = 低于基线"
      : mode === "info-diff"
        ? "暖 = T 信息优势 · 冷 = CT 预警"
        : mode === "contested"
          ? "双方都看到 = 对拼线 / 交火点"
          : mode === "ctPres" || mode === "tPres"
            ? "冷 → 热 = 站人频率低 → 高"
            : mode === "ctAim" || mode === "tAim"
              ? "冷 → 热 = 准星覆盖低 → 高"
              : mode === "ctSound" || mode === "tSound"
                ? "冷 → 热 = 发声被对面听到概率低 → 高"
                : "冷 → 热 = 4:3 屏幕可见低 → 高";
  const legendText = signedLegend || (weakZones && canShowWeakZones) ? legend : `${legend} · 分档 ${bandLegend(map.name, mode)}`;
  const clock = formatClock(field.maxSec - sec);
  const endClock = formatClock(field.maxSec - maxSec);

  return (
    <div className="dak-heatmap-wrap" aria-label={`${map.name} radar field`}>
      <div className="dak-heatmap-filters">
        <div className="dak-heatmap-controls" role="radiogroup" aria-label="覆盖场模式">
          {RADAR_FIELD_MODES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={mode === opt.value}
              className={mode === opt.value ? "dak-mode dak-mode-active" : "dak-mode"}
              onClick={() => setMode(opt.value)}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={weakZones}
            disabled={!canShowWeakZones}
            className={weakZones && canShowWeakZones ? "dak-sf-chip dak-sf-chip-active" : "dak-sf-chip"}
            title={canShowWeakZones ? "压暗底图，只标出低频视野覆盖格" : "仅 CT/T 视野模式可用"}
            onClick={() => setWeakZones((r) => !r)}
          >
            薄弱区
          </button>
          {dualLevel && (
            <div className="dak-heatmap-side-filter" role="radiogroup" aria-label="地图层级">
              {(["upper", "lower"] as const).map((next) => (
                <button
                  key={next}
                  type="button"
                  role="radio"
                  aria-checked={level === next}
                  className={level === next ? "dak-sf-chip dak-sf-chip-active" : "dak-sf-chip"}
                  onClick={() => setLevel(next)}
                >
                  {next === "upper" ? "上层" : "下层"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dak-heatmap" style={bgUrl ? { backgroundImage: `url(${bgUrl})` } : undefined}>
        <canvas ref={canvasRef} className="dak-heatmap-canvas" aria-hidden="true" />
        {!calibration && <div className="dak-heatmap-empty">该地图暂无雷达标定</div>}
        <div className="dak-heatmap-legend">
          <span>
            {field.scope.kind === "team" ? field.scope.team : "赛事地图基线"}
            <small> · {field.scope.roundCount} 长枪局{isDiff ? ` vs 赛事基线 ${baseline!.scope.roundCount}` : ""}</small>
          </span>
          <span className="dak-heatmap-legend-scale">
            <i className={weakZones && canShowWeakZones ? "dak-legend-weak" : "dak-legend-radar-field"} />
            {legendText}
          </span>
        </div>
      </div>

      <div className="dak-heatmap-tuning dak-radar-timebar" aria-label="时间轴">
        <button
          type="button"
          className="dak-play-button dak-radar-play-button"
          aria-label={playing ? "暂停控图播放" : "播放控图变化"}
          onClick={() => {
            if (playing) {
              setPlaying(false);
              return;
            }
            if (sec >= maxSec) setSec(0);
            setPlaying(maxSec > 0);
          }}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <label className="dak-radar-time-slider">
          回合时间 {clock}
          <input
            type="range"
            min={0}
            max={maxSec}
            value={sec}
            onChange={(e) => {
              setPlaying(false);
              setSec(Number(e.target.value));
            }}
          />
        </label>
        <span className="dak-radar-time-meta">4x · 1:55-{endClock}</span>
      </div>
    </div>
  );
}
