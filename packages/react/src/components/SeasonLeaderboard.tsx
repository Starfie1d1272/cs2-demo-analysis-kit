import { useMemo, useState } from "react";
import type {
  LeaderboardFormat,
  LeaderboardMetricKey,
  LeaderboardViewKey,
  SeasonLeaderboardModel
} from "@cs2dak/contract";

export interface SeasonLeaderboardProps {
  model: SeasonLeaderboardModel;
  /**
   * 提供后每行可点击（鼠标 + 键盘），回报该选手的 playerKey。
   * 让嵌入产品（RivalHub）接导航而不必 fork 本组件。
   */
  onPlayerClick?: (playerKey: string) => void;
}

/** 按 format 把原始值渲染为展示文本；缺失统一显示 “—”（不伪造 0）。 */
function formatMetric(value: number | null | undefined, format: LeaderboardFormat): string {
  if (value == null) return "—";
  switch (format) {
    case "integer":
      return String(Math.round(value));
    case "rating":
    case "ratio":
      return value.toFixed(2);
    case "adr":
      return value.toFixed(1);
    case "percent":
      return `${value.toFixed(1)}%`;
  }
}

export function SeasonLeaderboard({ model, onPlayerClick }: SeasonLeaderboardProps) {
  const [viewKey, setViewKey] = useState<LeaderboardViewKey>(model.views[0]?.key ?? "core");
  const view = model.views.find((v) => v.key === viewKey) ?? model.views[0];
  const [sortKey, setSortKey] = useState<LeaderboardMetricKey>(view.defaultSort);

  function selectView(next: LeaderboardViewKey) {
    setViewKey(next);
    const nextView = model.views.find((v) => v.key === next);
    if (nextView) setSortKey(nextView.defaultSort);
  }

  // 排序在客户端：降序，缺失（null）始终排在最后。
  const rows = useMemo(() => {
    return [...model.rows].sort((a, b) => {
      const va = a.metrics[sortKey];
      const vb = b.metrics[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return vb - va;
    });
  }, [model.rows, sortKey]);

  return (
    <div className="dak-leaderboard">
      <div className="dak-tabs" role="tablist">
        {model.views.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={v.key === viewKey}
            className={v.key === viewKey ? "dak-tab dak-tab-active" : "dak-tab"}
            onClick={() => selectView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <table className="dak-table">
        <thead>
          <tr>
            <th>#</th>
            <th>选手</th>
            {view.columns.map((col) => (
              <th
                key={col.key}
                title={col.description ?? undefined}
                aria-sort={col.key === sortKey ? "descending" : undefined}
                className={col.key === sortKey ? "dak-col-sorted" : "dak-col-sortable"}
                onClick={() => setSortKey(col.key)}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.playerKey}
              className={onPlayerClick ? "dak-row-clickable" : undefined}
              onClick={onPlayerClick ? () => onPlayerClick(row.playerKey) : undefined}
              onKeyDown={
                onPlayerClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPlayerClick(row.playerKey);
                      }
                    }
                  : undefined
              }
              tabIndex={onPlayerClick ? 0 : undefined}
              role={onPlayerClick ? "button" : undefined}
              aria-label={onPlayerClick ? `查看 ${row.name} 详情` : undefined}
            >
              <td className="dak-mono">{i + 1}</td>
              <td>{row.name}</td>
              {view.columns.map((col) => (
                <td
                  key={col.key}
                  className={col.key === sortKey ? "dak-mono dak-col-sorted" : "dak-mono"}
                >
                  {formatMetric(row.metrics[col.key], col.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
