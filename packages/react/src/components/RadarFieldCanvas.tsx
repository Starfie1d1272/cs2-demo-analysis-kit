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

// 按真实频率分档，而不是按 cap 后透明度硬撑；低频边界也必须可读。
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
] as const;

function band(...limits: number[]): Band[] {
  return limits.map((limit, index) => [limit, BAND_COLORS[Math.min(index, BAND_COLORS.length - 1)]!]);
}

const SCREEN_BANDS = band(0.005, 0.015, 0.04, 0.08, 0.14, 0.23, 0.31, 0.5, 1.01);
const AIM_BANDS = band(0.005, 0.01, 0.03, 0.07, 0.12, 0.2, 0.27, 0.42, 1.01);
const CONTESTED_BANDS = band(0.005, 0.01, 0.02, 0.06, 0.09, 0.12, 0.15, 0.2, 1.01);
const PRESENCE_BANDS = band(0.005, 0.01, 0.015, 0.045, 0.065, 0.105, 0.14, 0.25, 1.01);
const SOUND_BANDS = band(0.05, 0.1, 0.28, 0.35, 0.56, 0.75, 0.85, 0.95, 1.01);
const DEFAULT_BANDS: Record<BandKind, Band[]> = {
  screen: SCREEN_BANDS,
  aim: AIM_BANDS,
  presence: PRESENCE_BANDS,
  sound: SOUND_BANDS,
  contested: CONTESTED_BANDS,
};
const MAP_BANDS: Partial<Record<string, Partial<Record<BandKind, Band[]>>>> = {
  de_ancient: {
    screen: band(0.005, 0.02, 0.05, 0.085, 0.13, 0.185, 0.23, 0.405, 1.01),
    aim: band(0.005, 0.015, 0.04, 0.07, 0.11, 0.155, 0.185, 0.325, 1.01),
    presence: band(0.005, 0.01, 0.015, 0.045, 0.065, 0.11, 0.16, 0.255, 1.01),
    sound: band(0.05, 0.14, 0.315, 0.335, 0.48, 0.655, 0.77, 0.955, 1.01),
    contested: band(0.005, 0.01, 0.025, 0.065, 0.09, 0.115, 0.13, 0.16, 1.01),
  },
  de_anubis: {
    screen: band(0.005, 0.015, 0.04, 0.085, 0.155, 0.24, 0.31, 0.475, 1.01),
    aim: band(0.005, 0.01, 0.03, 0.075, 0.13, 0.2, 0.26, 0.4, 1.01),
    presence: band(0.005, 0.01, 0.015, 0.045, 0.065, 0.1, 0.125, 0.24, 1.01),
    sound: band(0.05, 0.08, 0.29, 0.35, 0.57, 0.77, 0.855, 0.98, 1.01),
    contested: band(0.005, 0.01, 0.02, 0.06, 0.08, 0.11, 0.125, 0.155, 1.01),
  },
  de_dust2: {
    screen: band(0.005, 0.015, 0.05, 0.105, 0.175, 0.265, 0.34, 0.51, 1.01),
    aim: band(0.005, 0.015, 0.035, 0.085, 0.14, 0.215, 0.28, 0.41, 1.01),
    presence: band(0.005, 0.01, 0.015, 0.045, 0.065, 0.105, 0.135, 0.205, 1.01),
    sound: band(0.05, 0.065, 0.26, 0.33, 0.515, 0.71, 0.795, 0.95, 1.01),
    contested: band(0.005, 0.01, 0.025, 0.065, 0.095, 0.12, 0.135, 0.19, 1.01),
  },
  de_inferno: {
    screen: band(0.005, 0.01, 0.035, 0.095, 0.17, 0.27, 0.345, 0.59, 1.01),
    aim: band(0.005, 0.01, 0.03, 0.08, 0.135, 0.22, 0.28, 0.485, 1.01),
    presence: band(0.005, 0.01, 0.015, 0.05, 0.07, 0.115, 0.145, 0.245, 1.01),
    sound: band(0.05, 0.07, 0.275, 0.345, 0.56, 0.775, 0.885, 0.89, 1.01),
    contested: band(0.005, 0.01, 0.015, 0.065, 0.095, 0.13, 0.155, 0.195, 1.01),
  },
  de_mirage: {
    screen: band(0.005, 0.015, 0.045, 0.085, 0.145, 0.225, 0.29, 0.475, 1.01),
    aim: band(0.005, 0.015, 0.035, 0.07, 0.12, 0.19, 0.235, 0.385, 1.01),
    presence: band(0.005, 0.01, 0.015, 0.045, 0.065, 0.105, 0.135, 0.245, 1.01),
    sound: band(0.05, 0.14, 0.35, 0.375, 0.545, 0.71, 0.805, 0.93, 1.01),
    contested: band(0.005, 0.01, 0.02, 0.06, 0.095, 0.135, 0.165, 0.21, 1.01),
  },
  de_nuke: {
    screen: band(0.005, 0.01, 0.03, 0.065, 0.11, 0.2, 0.275, 0.575, 1.01),
    aim: band(0.005, 0.01, 0.02, 0.055, 0.09, 0.165, 0.225, 0.465, 1.01),
    presence: band(0.005, 0.01, 0.015, 0.045, 0.06, 0.1, 0.14, 0.275, 1.01),
    sound: band(0.05, 0.145, 0.425, 0.49, 0.705, 0.84, 0.92, 0.925, 1.01),
    contested: band(0.005, 0.01, 0.02, 0.05, 0.07, 0.095, 0.11, 0.155, 1.01),
  },
  de_overpass: {
    screen: band(0.005, 0.015, 0.04, 0.085, 0.145, 0.23, 0.31, 0.48, 1.01),
    aim: band(0.005, 0.015, 0.03, 0.075, 0.12, 0.185, 0.24, 0.39, 1.01),
    presence: band(0.005, 0.01, 0.015, 0.045, 0.065, 0.11, 0.14, 0.24, 1.01),
    sound: band(0.05, 0.085, 0.265, 0.31, 0.56, 0.74, 0.845, 0.965, 1.01),
    contested: band(0.005, 0.01, 0.025, 0.055, 0.08, 0.105, 0.12, 0.155, 1.01),
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
