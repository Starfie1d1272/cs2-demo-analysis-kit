import { useMemo, useState, type ReactNode } from "react";
import { Pagination } from "./Pagination";

/**
 * 产品中立的通用数据表：列配置 → 客户端排序（升/降切换）→ 可选分页 → 渲染。
 *
 * 设计目标：取代仓库里 4 套各自为政的排序实现（stu-col-sortable / stu-sort-header /
 * dak-col-sortable / 一堆静态表）。**只下沉逻辑与结构，样式靠 classes 预设注入**——
 * 这样 DAK Studio 的表保留 `stu-*` 长相（STUDIO_TABLE_CLASSES），React 原生用法走
 * `dak-*`（DAK_TABLE_CLASSES），两套设计语言不互相污染。
 *
 * 纯展示：不查数据库、不跑分析，只吃 rows + 列配置。复杂单元格（按钮/证据链/着色）
 * 通过列的 `render(row)` 自定义；行级交互通过 `onRowClick` / `rowClassName` /
 * `rowProps`（hover 联动等特例）。
 */

export type SortDirection = "asc" | "desc";

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
  heat?: (row: T) => "high" | "mid" | "low" | "neutral";
  /** 单元格附加 class。 */
  cellClassName?: (row: T) => string | undefined;
}

export interface DataTableClasses {
  table: string;
  numeric: string;
  sortable: string;
  sortableActive: string;
  rowClickable?: string;
  /** 热力单元格 class 生成器（可选）。 */
  heatCell?: (tone: "high" | "mid" | "low" | "neutral") => string;
  /** 内部分页控件 class。 */
  pagination?: string;
}

/** DAK Studio 表（Tactical Slate / stu-*）。CSS 在 studio.css。 */
export const STUDIO_TABLE_CLASSES: DataTableClasses = {
  table: "stu-mini-table",
  numeric: "stu-num",
  sortable: "stu-col-sortable",
  sortableActive: "stu-col-sortable",
  rowClickable: "stu-row-clickable",
  heatCell: (tone) => `stu-heat-cell stu-heat-${tone}`,
  pagination: "stu-pagination",
};

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
  /** 初始排序列 key；缺省不排序（保留 rows 原序）。 */
  initialSortKey?: string;
  initialSortDirection?: SortDirection;
  /** 设置后启用分页。 */
  pageSize?: number;
  /** 受控分页：外部指定当前页（用于 hover 联动等场景）。缺省走内部 state。 */
  page?: number;
  onPageChange?: (page: number) => void;
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

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  classes = DAK_TABLE_CLASSES,
  initialSortKey,
  initialSortDirection = "desc",
  pageSize,
  page,
  onPageChange,
  paginationMaxButtons = 8,
  paginationInfo,
  onRowClick,
  rowClassName,
  rowProps,
  showRank = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(initialSortKey ?? null);
  const [sortDesc, setSortDesc] = useState(initialSortDirection === "desc");
  const [internalPage, setInternalPage] = useState(0);
  const controlled = page !== undefined;
  const currentPage = controlled ? page : internalPage;
  const setPage = controlled ? (onPageChange ?? (() => {})) : setInternalPage;

  function handleSort(key: string) {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
    setPage(0);
  }

  const sortedRows = useMemo(() => {
    if (sortKey == null) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const dir = sortDesc ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // null 始终末尾
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * dir;
      }
      return (vb - va) * dir;
    });
  }, [rows, columns, sortKey, sortDesc]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(sortedRows.length / pageSize)) : 1;
  const safePage = Math.min(currentPage, totalPages - 1);
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
          onChange={setPage}
          maxButtons={paginationMaxButtons}
          info={paginationInfo?.(sortedRows.length)}
          className={classes.pagination}
        />
      )}
      <table className={classes.table}>
        <thead>
          <tr>
            {showRank && <th className={classes.numeric}>#</th>}
            {columns.map((col) => {
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
                  aria-sort={active ? (sortDesc ? "descending" : "ascending") : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  {col.label}
                  {col.sortable ? arrow(col.key) : ""}
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
