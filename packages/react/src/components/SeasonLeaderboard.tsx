import { sortTableRows } from "./DataTable";
import { useMemo } from "react";
import type { TableState } from "@cs2dak/presentation";
import type {
  LeaderboardFormat,
  LeaderboardMetricKey,
  LeaderboardViewKey,
  SeasonLeaderboardModel
} from "@cs2dak/presentation";

export interface SeasonLeaderboardProps {
  model: SeasonLeaderboardModel;
  /**
   * 提供后每行可点击（鼠标 + 键盘），回报该选手的 playerKey。
   * 让嵌入产品（RivalHub）接导航而不必 fork 本组件。
   */
  onPlayerClick?: (playerKey: string) => void;
  viewKey: LeaderboardViewKey;
  tableState: TableState;
  onViewKeyChange: (key: LeaderboardViewKey) => void;
  onTableStateChange: (state: TableState) => void;
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

export function SeasonLeaderboard({ model, onPlayerClick, viewKey: controlledView, tableState: controlledTable, onViewKeyChange, onTableStateChange }: SeasonLeaderboardProps) {
  const viewKey = model.views.some(v => v.key === controlledView) ? controlledView : model.views[0]?.key ?? "core";
  const view = model.views.find(v => v.key === viewKey) ?? model.views[0];
  const sortKey = (controlledTable.sort.key ?? view.defaultSort) as LeaderboardMetricKey;
  const sortDesc = controlledTable.sort.direction === "desc";
  function selectView(next: LeaderboardViewKey) { onViewKeyChange(next); }
  function handleSort(key: LeaderboardMetricKey) {
    onTableStateChange({ sort: { key, direction: sortKey === key && sortDesc ? "asc" : "desc" }, page: 0 });
  }

  const rows = useMemo(() => sortTableRows(model.rows, [{ key: sortKey, label: sortKey, sortable: true, sortValue: row => row.metrics[sortKey] ?? null }], { key: sortKey, direction: sortDesc ? "desc" : "asc" }), [model.rows, sortKey, sortDesc]);

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
                aria-sort={col.key === sortKey ? (sortDesc ? "descending" : "ascending") : undefined}
                className={col.key === sortKey ? "dak-col-sorted" : "dak-col-sortable"}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                {col.key === sortKey ? (sortDesc ? " ↓" : " ↑") : ""}
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
