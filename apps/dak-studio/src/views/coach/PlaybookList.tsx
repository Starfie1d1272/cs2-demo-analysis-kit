import { useState } from "react";
import { DataTable, EmptyState, type DataTableColumn } from "@cs2dak/react";
import type { TableState } from "@cs2dak/presentation";
import { STUDIO_TABLE_CLASSES } from "../../components/table-styles";
import type { MaterialSummary } from "../../lib/study-materials";

export function PlaybookList({ rows, onOpen }: { rows: MaterialSummary[]; onOpen: (row: MaterialSummary) => void }) {
  const [side, setSide] = useState("");
  const [kind, setKind] = useState("");
  const [table, setTable] = useState<TableState>({ sort: { key: null, direction: "desc" }, page: 0 });
  const filtered = rows.filter(row => (!side || row.kindLabel.includes(` · ${side} · `)) && (!kind || row.kindLabel.endsWith(` · ${kind}`)));
  const columns: DataTableColumn<MaterialSummary>[] = [
    { key: "title", label: "标题", render: row => <button className="stu-button-sm" onClick={() => onOpen(row)}>{row.title}</button> },
    { key: "map", label: "地图", format: row => row.mapName ?? "—" },
    { key: "kind", label: "阵营 / 种类", format: row => row.kindLabel },
    { key: "updated", label: "更新", format: row => row.updatedAt === null ? "—" : new Date(row.updatedAt).toLocaleString() },
  ];
  return <section><h2>战术本</h2><label>阵营<select className="stu-input" value={side} onChange={e => setSide(e.target.value)}><option value="">全部阵营</option><option>T</option><option>CT</option></select></label><label>种类<select className="stu-input" value={kind} onChange={e => setKind(e.target.value)}><option value="">全部种类</option><option>default</option><option>protocol</option><option>play</option></select></label>{filtered.length ? <DataTable state={table} onStateChange={setTable} classes={STUDIO_TABLE_CLASSES} rows={filtered} rowKey={row => row.ref.id} columns={columns} /> : <EmptyState variant="insufficient" title="没有匹配的战术" />}</section>;
}
