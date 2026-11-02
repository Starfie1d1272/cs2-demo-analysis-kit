import { PLAYBOOK_KIND_LABELS } from "../../lib/playbook-labels";
import { DataTable, EmptyState, type DataTableColumn } from "@cs2dak/react";
import type { MaterialsPageState } from "../../lib/material-page-state";
import { STUDIO_TABLE_CLASSES } from "../../components/table-styles";
import type { MaterialSummary } from "../../lib/study-materials";

export function PlaybookList({ rows, state, onStateChange, onOpen }: { rows: MaterialSummary[]; state: MaterialsPageState; onStateChange: (state: MaterialsPageState) => void; onOpen: (row: MaterialSummary) => void }) {
  const { playbookSide: side, playbookKind: kind, playbookTable: table } = state;
  const filtered = rows.filter(row => (!side || row.side === side) && (!kind || row.playKind === kind));
  const columns: DataTableColumn<MaterialSummary>[] = [
    { key: "title", label: "标题", render: row => <button className="stu-button-sm" onClick={() => onOpen(row)}>{row.title}</button> },
    { key: "map", label: "地图", format: row => row.mapName ?? "—" },
    { key: "kind", label: "阵营 / 种类", format: row => row.kindLabel },
    { key: "updated", label: "更新", format: row => row.updatedAt === null ? "—" : new Date(row.updatedAt).toLocaleString() },
  ];
  return <section><h2>战术本</h2><label>阵营<select className="stu-input" value={side ?? ""} onChange={e => onStateChange({ ...state, playbookSide: (e.target.value || null) as MaterialsPageState["playbookSide"], playbookTable: { ...table, page: 0 } })}><option value="">全部阵营</option><option value="t">T</option><option value="ct">CT</option></select></label><label>种类<select className="stu-input" value={kind ?? ""} onChange={e => onStateChange({ ...state, playbookKind: (e.target.value || null) as MaterialsPageState["playbookKind"], playbookTable: { ...table, page: 0 } })}><option value="">全部种类</option>{Object.entries(PLAYBOOK_KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{filtered.length ? <DataTable state={table} onStateChange={playbookTable => onStateChange({ ...state, playbookTable })} classes={STUDIO_TABLE_CLASSES} rows={filtered} rowKey={row => row.ref.id} columns={columns} /> : <EmptyState variant="insufficient" title="没有匹配的战术" />}</section>;
}
