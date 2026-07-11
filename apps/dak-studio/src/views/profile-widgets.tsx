import { useState } from "react";
import type { PlayerStyle } from "@cs2dak/contract";
import type { PlayerSeasonInsights } from "@cs2dak/presentation";
import { formatMatchLabel, type StudioDemoEntry } from "../lib/library";

/**
 * 选手档案共享展示组件：个人实验室与「我的主页」复用同一套渲染，
 * 避免雷达/趋势两套实现（见 docs/design/studio-components.md）。纯展示、零数据依赖。
 */

/** PRISM 八维打法画像：形状表示行为倾向，第二层轮廓表示执行效率，主色由 RR 档位决定。 */
export function FingerprintRadar({ style }: { style: PlayerStyle }) {
  const { axes, rrPercentile } = style;
  const size = 220;
  const center = size / 2;
  const radius = size / 2 - 34;
  const point = (index: number, fraction: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    return [center + Math.cos(angle) * radius * fraction, center + Math.sin(angle) * radius * fraction] as const;
  };
  const ringPath = (fraction: number) =>
    axes.map((_, i) => point(i, fraction).join(",")).join(" ");
  const pathFor = (field: "involvementPercentile" | "efficiencyPercentile") => axes
    .map((axis, i) => point(i, Math.max(0.04, (axis[field] ?? 0) / 100)).join(","))
    .join(" ");
  const rrTone = rrPercentile >= 75 ? "high" : rrPercentile >= 40 ? "mid" : "low";

  return (
    <div className={`stu-prism-radar stu-prism-radar-${rrTone}`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="stu-radar" role="img" aria-label={`PRISM 八维打法画像，RR 样本内 P${rrPercentile.toFixed(0)}`}>
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <polygon key={fraction} className="stu-radar-ring" points={ringPath(fraction)} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, 1);
          return <line key={i} className="stu-radar-spoke" x1={center} y1={center} x2={x} y2={y} />;
        })}
        <polygon className="stu-radar-value" points={pathFor("involvementPercentile")} />
        <polygon className="stu-radar-efficiency" points={pathFor("efficiencyPercentile")} />
        {axes.map((axis, i) => {
          const [x, y] = point(i, 1.16);
          return (
            <text key={axis.key} className={axis.status === "ready" ? "stu-radar-label" : "stu-radar-label stu-radar-label-muted"} x={x} y={y} textAnchor="middle" dominantBaseline="middle">
              {axis.label}
            </text>
          );
        })}
      </svg>
      <div className="stu-prism-legend" aria-label="图例">
        <span><i className="stu-prism-key stu-prism-key-involvement" />行为倾向</span>
        <span><i className="stu-prism-key stu-prism-key-efficiency" />执行效率</span>
        <b>RR · 样本内 P{rrPercentile.toFixed(0)}</b>
      </div>
    </div>
  );
}

export const TREND_METRICS = [
  { key: "adr", label: "ADR", format: (v: number) => v.toFixed(1) },
  { key: "kast", label: "KAST%", format: (v: number) => v.toFixed(1) },
  { key: "fkMinusFd", label: "首杀差(FK-FD)", format: (v: number) => v.toFixed(0) },
  { key: "utilityDamagePerRound", label: "Util/R", format: (v: number) => v.toFixed(2) }
] as const;
export type TrendMetricKey = (typeof TREND_METRICS)[number]["key"];

/** 个人趋势柱状图，指标可切换；点击柱进入对应比赛。 */
export function TrendChart({
  trend,
  entryByMatchId,
  onOpenMatch
}: {
  trend: PlayerSeasonInsights["trend"];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string) => void;
}) {
  const [metric, setMetric] = useState<TrendMetricKey>("adr");
  const spec = TREND_METRICS.find((m) => m.key === metric)!;
  const values = trend.map((point) => point[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - Math.min(min, 0), 0.0001);
  const baseline = Math.min(min, 0);

  return (
    <div>
      <div className="stu-trend-tabs" role="radiogroup" aria-label="趋势指标">
        {TREND_METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={metric === m.key}
            className={metric === m.key ? "stu-subtab stu-subtab-active" : "stu-subtab"}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="stu-trend-bars" role="list" aria-label={`${spec.label} 趋势`}>
        {trend.map((point) => {
          const entry = entryByMatchId.get(point.matchId);
          const value = point[metric];
          const height = Math.max(6, ((value - baseline) / span) * 100);
          const title = entry
            ? `${formatMatchLabel(entry)} · ${spec.label} ${spec.format(value)}`
            : `${point.matchId} · ${spec.label} ${spec.format(value)}`;
          return (
            <button
              key={point.matchId}
              type="button"
              className="stu-trend-col"
              disabled={!entry}
              title={title}
              onClick={() => entry && onOpenMatch(entry.id)}
            >
              <span className="stu-trend-bar" style={{ height: `${height}%` }} />
              <small>{spec.format(value)}</small>
            </button>
          );
        })}
      </div>
      <div className="stu-trend-range stu-dim">
        <small>{spec.label}：{spec.format(min)} – {spec.format(max)} · {trend.length} 场</small>
      </div>
    </div>
  );
}
