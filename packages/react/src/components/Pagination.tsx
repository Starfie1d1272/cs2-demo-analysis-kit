/**
 * 分页控件（产品中立）：页码按钮 + 前后翻页 + 可选信息文字。
 *
 * 纯展示：只吃 page/totalPages，回报目标页。样式由 className 决定，
 * 默认 `dak-pagination`（theme.css）；DAK Studio 通过 `stu-pagination` 复用同一逻辑。
 */
export function Pagination({
  page,
  totalPages,
  onChange,
  maxButtons = 8,
  info,
  className = "dak-pagination",
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  maxButtons?: number;
  info?: string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const radius = Math.floor((maxButtons - 1) / 2);
  const start = Math.max(0, Math.min(safePage - radius, totalPages - maxButtons));
  return (
    <nav className={className} aria-label="分页">
      <button type="button" disabled={safePage === 0} onClick={() => onChange(safePage - 1)}>
        ‹
      </button>
      {Array.from({ length: Math.min(totalPages, maxButtons) }, (_, i) => {
        const p = start + i;
        return (
          <button
            key={p}
            type="button"
            className={safePage === p ? "active" : ""}
            onClick={() => onChange(p)}
          >
            {p + 1}
          </button>
        );
      })}
      <button
        type="button"
        disabled={safePage >= totalPages - 1}
        onClick={() => onChange(safePage + 1)}
      >
        ›
      </button>
      {info && <span className={`${className}-info`}>{info}</span>}
    </nav>
  );
}
