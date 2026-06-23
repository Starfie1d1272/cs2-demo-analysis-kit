import { Pagination as BasePagination } from "@cs2dak/react";

/**
 * DAK Studio 分页：复用 @cs2dak/react 的产品中立 `Pagination`，
 * 固定 `stu-pagination` 样式（CSS 在 studio.css），保留 Studio 视觉。
 */
export function Pagination(props: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  maxButtons?: number;
  info?: string;
}) {
  return <BasePagination {...props} className="stu-pagination" />;
}
