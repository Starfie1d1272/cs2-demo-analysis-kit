import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DataTable, EmptyState, type DataTableColumn } from "@cs2dak/react";
import type { TacticalRoundFact } from "@cs2dak/tactics";
import { STUDIO_TABLE_CLASSES } from "../../components/table-styles";
import type { StudioDemoEntry } from "../../lib/demo-entry";
import { listPrepItems, savePrepItem, removePrepItem, prepItemsToMarkdown, type PrepItem } from "../../lib/prep-items";

const SIDE_LABEL: Record<string, string> = { t: "T 方", ct: "CT 方" };

export function PrepItemsPanel({ facts, entryByMatchId, onOpenMatch, onWatchDemo, revision = 0 }: {
  facts: TacticalRoundFact[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (matchId: string, roundNumber: number) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  revision?: number;
}) {
  const [items, setItems] = useState<PrepItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setItems(await listPrepItems()); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, []);
  useEffect(() => { void load(); }, [load, revision]);
  const save = async (item: PrepItem) => {
    try { await savePrepItem(item); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); throw reason; }
  };
  const remove = async (id: string) => {
    try { await removePrepItem(id); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  return <>
    {error && <p role="alert">读取或保存备战材料失败：{error} <button type="button" className="stu-button-sm" onClick={() => void load()}>重试</button></p>}
    <UserPrepItemForm facts={facts} onSave={save} /><PlaylistTable items={items} entryByMatchId={entryByMatchId} onUpdate={save} onRemove={remove} onOpenMatch={onOpenMatch} onWatchDemo={onWatchDemo} />
  </>;
}

function UserPrepItemForm({ facts, onSave }: { facts: TacticalRoundFact[]; onSave: (item: PrepItem) => Promise<void> }) {
  const [factKey, setFactKey] = useState("");
  const [group, setGroup] = useState("用户判断");
  const [note, setNote] = useState("");
  const evidenceFacts = facts.slice(0, 100);
  const selected = evidenceFacts.find((fact) => `${fact.matchId}:${fact.roundNumber}` === factKey) ?? evidenceFacts[0] ?? null;

  return (
    <section className="stu-card">
      <h3>记录用户判断</h3>
      <p className="stu-muted">从描述性观察进入备战时，写下自己的判断并附上一条已有回合证据；它不会伪装成系统 Finding。</p>
      {selected ? (
        <div className="stu-form-row">
          <label>分组<input className="stu-input" value={group} onChange={(event) => setGroup(event.target.value)} /></label>
          <label>证据回合<select className="stu-input" value={factKey || `${selected.matchId}:${selected.roundNumber}`} onChange={(event) => setFactKey(event.target.value)}>
            {evidenceFacts.map((fact) => <option key={`${fact.matchId}:${fact.roundNumber}`} value={`${fact.matchId}:${fact.roundNumber}`}>{fact.mapName} · R{fact.roundNumber} · {SIDE_LABEL[fact.side]}</option>)}
          </select></label>
          <label className="stu-form-row-wide">判断 / 备注<input className="stu-input" value={note} placeholder="例如：B 区 1:00 后覆盖偏低，需在下次对局复核" onChange={(event) => setNote(event.target.value)} /></label>
          <button type="button" className="stu-button-sm" disabled={!note.trim()} onClick={() => {
            const evidence = evidenceFacts.find((fact) => `${fact.matchId}:${fact.roundNumber}` === factKey) ?? selected;
            void onSave({
              id: `user:${evidence.matchId}:${evidence.roundNumber}:${Date.now()}`,
              group: group.trim() || "用户判断",
              matchId: evidence.matchId,
              mapName: evidence.mapName,
              roundNumber: evidence.roundNumber,
              source: "user",
              coverage: `用户判断 · ${facts.length} 个可用战术回合 · ${evidence.mapName}`,
              note: note.trim(),
            }).then(() => setNote("")).catch(() => {});
          }}>加入备战清单</button>
        </div>
      ) : <p className="stu-muted">当前没有可附入的战术回合；重建教练 facts 后可记录用户判断。</p>}
    </section>
  );
}

function PlaylistTable({
  items,
  entryByMatchId,
  onUpdate,
  onRemove,
  onOpenMatch,
  onWatchDemo,
}: {
  items: PrepItem[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onUpdate: (item: PrepItem) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onOpenMatch: (matchId: string, roundNumber: number) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
}) {
  const [tableState, setTableState] = useState<import("@cs2dak/presentation").TableState>({ sort: { key: null, direction: "desc" }, page: 0 });
  const markdown = prepItemsToMarkdown("备战清单", items);
  const columns = useMemo<DataTableColumn<PrepItem>[]>(() => [
    { key: "group", label: "分组", format: (item) => item.group },
    { key: "source", label: "来源", render: (item) => <span title={item.coverage ?? item.matchId}>{item.source === "user" ? "用户判断" : item.mapName ? `${item.mapName} · ${item.matchId}` : item.matchId}</span> },
    { key: "round", label: "回合", numeric: true, format: (item) => `R${item.roundNumber}` },
    {
      key: "note", label: "备注",
      render: (item) => <input className="stu-input stu-input-sm" value={item.note} onChange={(event) => void onUpdate({ ...item, note: event.target.value }).catch(() => {})} />
    },
    {
      key: "actions", label: "",
      render: (item) => {
        const entry = entryByMatchId.get(item.matchId);
        return <>
          <button type="button" className="stu-button-sm" disabled={!entry} onClick={() => onOpenMatch(item.matchId, item.roundNumber)}>回放</button>
          {entry?.sourceDemPath && onWatchDemo && <button type="button" className="stu-button-sm" onClick={() => onWatchDemo(entry.id, { roundNumber: item.roundNumber })}>进游戏</button>}
          <button type="button" className="stu-button-sm" onClick={() => void onRemove(item.id)}>删除</button>
        </>;
      }
    },
  ], [entryByMatchId, onUpdate, onOpenMatch, onWatchDemo, onRemove]);

  if (items.length === 0) return <EmptyState variant="insufficient" title="备战清单为空" hint="在开局模式的证据回合里点击加入。" />;

  return (
    <div className="stu-card">
      <h3>备战清单</h3>
      <DataTable
        state={tableState} onStateChange={setTableState}
        classes={STUDIO_TABLE_CLASSES}
        rows={items}
        rowKey={(item) => item.id}
        columns={columns}
      />
      <details className="stu-coach-report-details">
        <summary>Markdown 导出</summary>
        <textarea className="stu-coach-report" readOnly value={markdown} />
      </details>
    </div>
  );
}


export type PrepItemDraft = Pick<PrepItem, "group" | "note">;
export async function savePrepItemDraft(record: PrepItem, draft: PrepItemDraft): Promise<void> {
  await savePrepItem({ ...record, ...draft });
}
export const deletePrepItem = removePrepItem;

export function PrepItemEditor({ record, draft, onChange, renderEvidence }: {
  record: PrepItem;
  draft: PrepItemDraft;
  onChange: (draft: PrepItemDraft) => void;
  renderEvidence: (record: PrepItem) => ReactNode;
}) {
  return <><h1>备战条目</h1>
    <label>分组<input className="stu-input" value={draft.group} onChange={(event) => onChange({ ...draft, group: event.target.value })} /></label>
    <label>备注<input className="stu-input" value={draft.note} onChange={(event) => onChange({ ...draft, note: event.target.value })} /></label>
    <p>{record.mapName ?? "—"} · R{record.roundNumber} · 来源版本未知 {renderEvidence(record)}</p>
    <details><summary>Markdown 导出</summary><textarea className="stu-input" readOnly value={prepItemsToMarkdown("备战清单", [{ ...record, ...draft }])} /></details>
  </>;
}
