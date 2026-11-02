import { normalizeTableState, type TableState } from "@cs2dak/presentation";
import { useCallback, useEffect, useMemo, useState, useId, type ReactNode } from "react";
import { Pagination } from "./Pagination";

/**
 * 产品中立的通用数据表：列配置 → 客户端排序（升/降切换）→ 可选分页 → 渲染。
 *
 * 设计目标：取代仓库里 4 套各自为政的排序实现（stu-col-sortable / stu-sort-header /
 * dak-col-sortable / 一堆静态表）。**只下沉逻辑与结构，样式靠 classes 预设注入**——
 * 宿主可注入自己的样式，React 原生用法走
 * `dak-*`（DAK_TABLE_CLASSES），两套设计语言不互相污染。
 *
 * 纯展示：不查数据库、不跑分析，只吃 rows + 列配置。复杂单元格（按钮/证据链/着色）
 * 通过列的 `render(row)` 自定义；行级交互通过 `onRowClick` / `rowClassName` /
 * `rowProps`（hover 联动等特例）。
 */

export type SortDirection = "asc" | "desc";

/** 热力图色调：供列 `heat` 回调返回，由 classes.heatCell 映射为 CSS class。 */
export type HeatTone = "high" | "mid" | "low" | "neutral";

export interface DataTableColumn<T> {
  key: string;
  /** 表头内容（可含 ⓘ 等节点）。 */
  label: ReactNode;
  /** 数字列右对齐 + 等宽。默认 false（左对齐文本列）。 */
  numeric?: boolean;
  /** 该列可点排序。需配 `sortValue`。 */
  sortable?: boolean;
  /** 排序取值；返回 null 始终排在末尾。 */
  sortValue?: (row: T) => number | string | null;
  /** 自定义单元格渲染；优先于 `format`。 */
  render?: (row: T) => ReactNode;
  /** 简单文本单元格。 */
  format?: (row: T) => ReactNode;
  /** 表头 title 提示。 */
  title?: string;
  /** 可选热力着色：返回色阶名，套用 classes.heatCell。 */
  heat?: (row: T) => HeatTone | undefined;
  /** 单元格附加 class。 */
  cellClassName?: (row: T) => string | undefined;
}

/** Sort the full filtered result using the same column semantics as DataTable. */
export function sortTableRows<T>(rows: T[], columns: DataTableColumn<T>[], sort: TableState["sort"]): T[] {
  const col = columns.find(c => c.key === sort.key && c.sortable && c.sortValue);
  if (!col?.sortValue) return [...rows];
  const value = col.sortValue;
  const dir = sort.direction === "desc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string" || typeof vb === "string") return String(vb).localeCompare(String(va)) * dir;
    return (vb - va) * dir;
  });
}

export interface DataTableClasses {
  table: string;
  numeric: string;
  sortable: string;
  sortableActive: string;
  rowClickable?: string;
  /** 热力单元格 class 生成器（可选）。 */
  heatCell?: (tone: HeatTone) => string;
  /** 内部分页控件 class。 */
  pagination?: string;
}

/** React 包原生表（dak-*）。CSS 在 theme.css。 */
export const DAK_TABLE_CLASSES: DataTableClasses = {
  table: "dak-table",
  numeric: "dak-mono",
  sortable: "dak-col-sortable",
  sortableActive: "dak-col-sorted",
  rowClickable: "dak-row-clickable",
  pagination: "dak-pagination",
};

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  classes?: DataTableClasses;
  state: TableState;
  onStateChange: (next: TableState) => void;
  pageSize?: number;
  paginationMaxButtons?: number;
  /** 分页信息文字生成器（接收行总数）。 */
  paginationInfo?: (total: number) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** 行级额外属性（hover 联动等特例）。 */
  rowProps?: (row: T) => React.HTMLAttributes<HTMLTableRowElement>;
  /** 首列前置一个序号列（如排行榜的 #）。 */
  showRank?: boolean;
}

/**
 * 通用排序切换 hook：同 key 切换升/降，换 key 默认降序。
 * DataTable、SeasonLeaderboard、RoundRobinStage 共用同一模式。
 */
export function useSortable<K extends string>(initialKey: K, initialDesc = true) {
  const [sortKey, setSortKey] = useState<K>(initialKey);
  const [sortDesc, setSortDesc] = useState(initialDesc);

  const handleSort = useCallback((key: K) => {
    setSortKey((prev) => {
      if (key === prev) setSortDesc((d) => !d);
      else setSortDesc(true);
      return key;
    });
  }, []);

  /** 外部重置排序列（如切换 view 时）。 */
  const resetSort = useCallback((key: K) => {
    setSortKey(key);
    setSortDesc(true);
  }, []);

  return { sortKey, sortDesc, handleSort, resetSort };
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  classes = DAK_TABLE_CLASSES,
  state,
  onStateChange,
  pageSize,
  paginationMaxButtons = 8,
  paginationInfo,
  onRowClick,
  rowClassName,
  rowProps,
  showRank = false,
}: DataTableProps<T>) {
  const tableId = useId();
  const normalized = normalizeTableState(state, { sortableKeys: columns.filter(c => c.sortable && c.sortValue).map(c => c.key), totalRows: rows.length, pageSize });
  const { key: sortKey, direction } = normalized.sort;
  const sortDesc = direction === "desc";
  useEffect(() => {
    if (normalized.sort.key !== state.sort.key || normalized.sort.direction !== state.sort.direction || normalized.page !== state.page) onStateChange(normalized);
  }, [normalized.sort.key, normalized.sort.direction, normalized.page, state.sort.key, state.sort.direction, state.page, onStateChange]);
  function handleSort(key: string) {
    onStateChange({ sort: { key, direction: sortKey === key && sortDesc ? "asc" : "desc" }, page: 0 });
  }

  const sortedRows = useMemo(() => sortTableRows(rows, columns, normalized.sort), [rows, columns, sortKey, sortDesc]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(sortedRows.length / pageSize)) : 1;
  const safePage = normalized.page;
  const pageRows = pageSize
    ? sortedRows.slice(safePage * pageSize, (safePage + 1) * pageSize)
    : sortedRows;

  const arrow = (key: string) => (sortKey === key ? (sortDesc ? " ↓" : " ↑") : "");

  return (
    <>
      {pageSize != null && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          onChange={(page) => onStateChange({ ...normalized, page })}
          maxButtons={paginationMaxButtons}
          info={paginationInfo?.(sortedRows.length)}
          className={classes.pagination}
        />
      )}
      <span id={`${tableId}-sort-label`} className="dak-table-sort-label">排序</span>
      <table className={classes.table}>
        <thead>
          <tr>
            {showRank && <th className={classes.numeric}>#</th>}
            {columns.map((col, columnIndex) => {
              const active = sortKey === col.key;
              const thClass = [
                col.numeric ? classes.numeric : "",
                col.sortable ? classes.sortable : "",
                col.sortable && active ? classes.sortableActive : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <th
                  key={col.key}
                  className={thClass || undefined}
                  title={col.title}
                  scope="col"
                  aria-sort={active ? (sortDesc ? "descending" : "ascending") : undefined}
                >
                  {col.sortable && col.sortValue ? <>
                    <label id={`${tableId}-column-${columnIndex}`} htmlFor={`${tableId}-button-${columnIndex}`}>{col.label}</label>
                    <button id={`${tableId}-button-${columnIndex}`} type="button" className="dak-table-sort-button" aria-labelledby={`${tableId}-column-${columnIndex} ${tableId}-sort-label`} onClick={() => handleSort(col.key)}>{active ? arrow(col.key) : " ↕"}</button>
                  </> : col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row, i) => {
            const extra = rowProps?.(row) ?? {};
            return (
              <tr
                key={rowKey(row)}
                {...extra}
                className={[onRowClick ? classes.rowClickable : "", rowClassName?.(row) ?? "", extra.className ?? ""]
                  .filter(Boolean)
                  .join(" ") || undefined}
                onClick={onRowClick ? () => onRowClick(row) : extra.onClick}
                tabIndex={onRowClick ? 0 : extra.tabIndex}
                role={onRowClick ? "button" : extra.role}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : extra.onKeyDown
                }
              >
                {showRank && <td className={classes.numeric}>{safePage * (pageSize ?? 0) + i + 1}</td>}
                {columns.map((col) => {
                  const tone = col.heat?.(row);
                  const cellClass = [
                    col.numeric ? classes.numeric : "",
                    tone && classes.heatCell ? classes.heatCell(tone) : "",
                    col.cellClassName?.(row) ?? "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <td key={col.key} className={cellClass || undefined}>
                      {col.render ? col.render(row) : col.format ? col.format(row) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
