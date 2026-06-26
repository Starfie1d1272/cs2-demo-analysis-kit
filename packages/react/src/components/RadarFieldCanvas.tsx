/**
 * RadarFieldCanvas —— 雷达覆盖场渲染（描述性，不上评分）。
 *
 * 吃聚合后的 RadarField（联赛基线或单队），逐秒 scrubber + 模式切换 + 队伍−联赛差分。
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

export interface RadarFieldCanvasProps {
  field: RadarField;
  /** 非空 = 差分模式（队伍 − 联赛基线）：防守漏洞 / 进攻防守倾向。 */
  baseline?: RadarField | null;
  map: { name: string; radarImageUrl?: string | null; lowerRadarImageUrl?: string | null };
}

export function RadarFieldCanvas({ field, baseline = null, map }: RadarFieldCanvasProps) {
  const [mode, setMode] = useState<RadarFieldMode>("tPres");
  const [sec, setSec] = useState(20);
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

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
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
      const op = 0.2 + 0.7 * Math.min(1, mag / frame.cap);
      const hue = frame.signed ? (v > 0 ? 14 : 208) : Math.round(240 - 240 * Math.min(1, v / frame.cap));
      const grd = ctx.createRadialGradient(x, y, 0, x, y, blobR);
      grd.addColorStop(0, `hsla(${hue} 90% 56% / ${op.toFixed(2)})`);
      grd.addColorStop(1, `hsla(${hue} 90% 56% / 0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, blobR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }, [field, baseline, mode, sec, level, calibration, dualLevel]);

  const bgUrl = dualLevel && level === "lower" ? map.lowerRadarImageUrl : map.radarImageUrl;
  const blindMode = mode === "ct-blind" || mode === "t-blind";
  const legend = blindMode
    ? `红 = 几乎无${mode === "ct-blind" ? "CT" : "T"}视线覆盖（盲区）`
    : isDiff
      ? "红 = 高于联赛平均 · 蓝 = 低于平均"
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
            {field.scope.kind === "team" ? field.scope.team : "赛事基线"}
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
