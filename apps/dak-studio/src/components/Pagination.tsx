/** 分页控件：页码按钮 + 前后翻页 + 可选信息文字。 */
export function Pagination({
  page,
  totalPages,
  onChange,
  maxButtons = 8,
  info,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  maxButtons?: number;
  info?: string;
}) {
  if (totalPages <= 1) return null;
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const radius = Math.floor((maxButtons - 1) / 2);
  const start = Math.max(0, Math.min(safePage - radius, totalPages - maxButtons));
  return (
    <nav className="stu-pagination" aria-label="分页">
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
      {info && <span className="stu-pagination-info">{info}</span>}
    </nav>
  );
}
