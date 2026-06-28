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
import { useEffect, useRef, useState } from "react";

const CANVAS_SIZE = 1024;

// 顺序色阶：品牌双 accent（深蓝 → accent-b 蓝 → 青 → 琥珀 → accent 橙），6 档离散分层。
// 避开彩虹 jet，贴合 Tactical Slate；分档让「核心架点 vs 偶尔扫一眼」的层次可读。
const HEAT_BANDS: Array<[number, string]> = [
  [0.06, "23,58,94"],
  [0.18, "47,127,181"],
  [0.34, "73,182,255"],
  [0.54, "98,216,196"],
  [0.76, "255,198,77"],
  [1.01, "255,122,33"],
];
const REVEAL_RGB = "73,182,255"; // accent-b 青蓝
const DIFF_POS_RGB = "255,90,114"; // --dak-danger
const DIFF_NEG_RGB = "73,182,255"; // --dak-accent-b

function heatBand(t: number): string {
  for (const [hi, rgb] of HEAT_BANDS) if (t <= hi) return rgb;
  return "255,122,33";
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
  // 照亮模式：压暗底图、视野覆盖发青光，暗处即盲区（读负空间最直观）。
  const [reveal, setReveal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const calibration = getMapCalibration(map.name);
  const dualLevel = !!(calibration && hasLowerLevel(calibration) && map.lowerRadarImageUrl);
  const [level, setLevel] = useState<MapLevel>("upper");

  const isDiff = !!baseline;

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

    // 照亮模式只对顺序场（视野/位置）生效；差分/信息差分仍用发散色。
    const useReveal = reveal && !frame.signed;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (useReveal) {
      // 压暗 CSS 底图（canvas 在底图之上），让覆盖区发光、未覆盖区变暗 = 盲区。
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(8,11,16,0.8)";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }
    ctx.globalCompositeOperation = frame.signed ? "source-over" : "lighter";

    for (let g = 0; g < cells.length; g++) {
      const v = frame.values[g]!;
      const mag = Math.abs(v);
      if (mag < 0.03) continue;
      const cell = cells[g]!;
      if (dualLevel && levelAt(cell[2], cal) !== level) continue;
      const radar = worldToRadar({ x: cell[0], y: cell[1] }, cal);
      if (radar.outOfBounds) continue;
      const x = radar.x * px2canvas;
      const y = radar.y * px2canvas;
      const t = Math.min(1, mag / frame.cap);
      const op = (useReveal ? 0.3 : 0.32) + 0.5 * t;
      const rgb = useReveal ? REVEAL_RGB : frame.signed ? (v > 0 ? DIFF_POS_RGB : DIFF_NEG_RGB) : heatBand(t);
      const grd = ctx.createRadialGradient(x, y, 0, x, y, blobR);
      grd.addColorStop(0, `rgba(${rgb},${op.toFixed(2)})`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, blobR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }, [field, baseline, mode, sec, level, reveal, calibration, dualLevel]);

  const bgUrl = dualLevel && level === "lower" ? map.lowerRadarImageUrl : map.radarImageUrl;
  const sequential = mode !== "info-diff" && !isDiff;
  const legend = reveal && sequential
    ? "亮 = 有视线覆盖 · 暗 = 盲区（空虚区）"
    : isDiff
      ? "红 = 高于赛事基线 · 蓝 = 低于基线"
      : mode === "info-diff"
        ? "暖 = T 信息优势 · 冷 = CT 预警"
        : mode === "contested"
          ? "双方都看到 = 对拼线 / 交火点"
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
            aria-pressed={reveal}
            className={reveal ? "dak-sf-chip dak-sf-chip-active" : "dak-sf-chip"}
            title="压暗底图、覆盖区发光，暗处即盲区"
            onClick={() => setReveal((r) => !r)}
          >
            照亮
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
            <small> · {field.scope.roundCount} 长枪局{isDiff ? ` vs 联赛 ${baseline!.scope.roundCount}` : ""}</small>
          </span>
          <span className="dak-heatmap-legend-scale">{legend}</span>
        </div>
      </div>

      <div className="dak-heatmap-tuning" aria-label="时间轴">
        <label>
          freeze 后 {sec}s
          <input type="range" min={0} max={field.maxSec - 1} value={sec} onChange={(e) => setSec(Number(e.target.value))} />
        </label>
      </div>
    </div>
  );
}
