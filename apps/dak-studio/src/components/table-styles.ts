import type { DataTableClasses } from '@cs2dak/react';

/** DAK Studio 表（Tactical Slate / stu-*）。CSS 在 studio.css。 */
export const STUDIO_TABLE_CLASSES: DataTableClasses = {
  table: 'stu-mini-table',
  numeric: 'stu-num',
  sortable: 'stu-col-sortable',
  sortableActive: 'stu-col-sortable',
  rowClickable: 'stu-row-clickable',
  heatCell: (tone) => `stu-heat-cell stu-heat-${tone}`,
  pagination: 'stu-pagination',
};
