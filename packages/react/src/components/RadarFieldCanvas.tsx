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

// 按真实频率分档，而不是按 cap 后透明度硬撑；低频边界也必须可读。
const HEAT_BANDS: Array<[number, string]> = [
  [0.005, "52,67,154"],
  [0.01, "71,94,180"],
  [0.02, "54,139,210"],
  [0.04, "45,190,205"],
  [0.07, "82,218,158"],
  [0.12, "184,214,94"],
  [0.2, "255,196,77"],
  [0.35, "255,132,68"],
  [1.01, "255,90,114"],
];
const CONTESTED_BANDS: Array<[number, string]> = [
  [0.005, "52,67,154"],
  [0.01, "71,94,180"],
  [0.02, "54,139,210"],
  [0.035, "45,190,205"],
  [0.05, "82,218,158"],
  [0.08, "184,214,94"],
  [0.12, "255,196,77"],
  [0.2, "255,132,68"],
  [1.01, "255,102,54"],
];
const PRESENCE_BANDS: Array<[number, string]> = [
  [0.005, "71,94,180"],
  [0.01, "54,139,210"],
  [0.02, "45,190,205"],
  [0.03, "82,218,158"],
  [0.05, "184,214,94"],
  [0.08, "255,196,77"],
  [0.12, "255,132,68"],
  [1.01, "255,90,114"],
];
const WEAK_RGB = "255,90,114"; // --dak-danger
const DIFF_POS_RGB = "255,90,114"; // --dak-danger
const DIFF_NEG_RGB = "73,182,255"; // --dak-accent-b

function heatBand(mode: RadarFieldMode, mag: number): string {
  const bands = mode === "ctPres" || mode === "tPres"
    ? PRESENCE_BANDS
    : mode === "contested"
      ? CONTESTED_BANDS
      : HEAT_BANDS;
  for (const [hi, rgb] of bands) if (mag <= hi) return rgb;
  return "255,102,54";
}

function minVisibleMag(mode: RadarFieldMode): number {
  return mode === "ctPres" || mode === "tPres" ? MIN_VISIBLE_PRESENCE_MAG : MIN_VISIBLE_MAG;
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

    const showWeakZones = weakZones && !frame.signed && (mode === "ctVis" || mode === "tVis");

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
      const rgb = showWeakZones ? WEAK_RGB : frame.signed ? (v > 0 ? DIFF_POS_RGB : DIFF_NEG_RGB) : heatBand(mode, mag);
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
  const canShowWeakZones = sequential && (mode === "ctVis" || mode === "tVis");
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
          : "冷 → 热 = 频率低 → 高";

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
            {legend}
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
          freeze 后 {sec}s
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
        <span className="dak-radar-time-meta">4x · 0-{maxSec}s</span>
      </div>
    </div>
  );
}
