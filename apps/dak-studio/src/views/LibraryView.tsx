import { FolderOpen, Play, RotateCw, Tag as TagIcon, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { SeriesFormat, SeriesVeto } from "@cs2dak/contract";
import { matchDateFromFileName, type StudioDemoEntry } from "../lib/library";
import { parseTags } from "../lib/tags";
import {
  listSeriesRecords,
  saveSeriesRecord,
  suggestSeriesGroups,
  type SeriesSuggestion,
  type StudioSeriesRecord
} from "../lib/series";
import { EmptyState } from "../components/primitives";
import { VetoInputDialog } from "../components/VetoInputDialog";
import { BpView } from "./BpView";

export interface LibraryViewProps {
  entries: StudioDemoEntry[];
  importing: boolean;
  importTagsRaw: string;
  onImportTagsChange: (raw: string) => void;
  onImportFiles: (files: Iterable<File>, tags: string[]) => void;
  /** 桌面壳（pywebview）下提供：用原生对话框代替浏览器 file input */
  onNativeImport?: () => void;
  onLoadSample: () => void;
  onOpenDemo: (id: string) => void;
  onRemoveDemo: (id: string) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onBulkUpdateTags: (ids: string[], add: string[], remove: string[]) => void;
  onReexportDemo: (entry: StudioDemoEntry) => void;
  /** 批量重新导出所有有原始 .dem 路径的条目。 */
  onReexportAll?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatImportedAt(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function LibraryView({
  entries,
  importing,
  importTagsRaw,
  onImportTagsChange,
  onImportFiles,
  onNativeImport,
  onLoadSample,
  onOpenDemo,
  onRemoveDemo,
  onUpdateTags,
  onBulkUpdateTags,
  onReexportDemo,
  onReexportAll
}: LibraryViewProps) {
  const [search, setSearch] = useState("");
  const [mapFilter, setMapFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const allTags = useMemo(() => [...new Set(entries.flatMap((entry) => entry.tags))].sort(), [entries]);

  const editTags = (entry: StudioDemoEntry) => {
    const raw = window.prompt(`编辑「${entry.fileName}」的标签（逗号分隔）`, entry.tags.join(", "));
    if (raw != null) onUpdateTags(entry.id, parseTags(raw));
  };

  const maps = useMemo(
    () => [...new Set(entries.map((entry) => entry.meta.mapName))].sort(),
    [entries]
  );
  const playerCount = useMemo(() => {
    // 粗略口径：同名队伍跨场重复不去重，仅作资料库规模提示
    return entries.reduce((sum, entry) => sum + entry.meta.playerCount, 0);
  }, [entries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (mapFilter && entry.meta.mapName !== mapFilter) return false;
      if (tagFilter && !entry.tags.includes(tagFilter)) return false;
      if (!term) return true;
      return [entry.fileName, entry.meta.mapName, entry.meta.teamAName, entry.meta.teamBName, ...entry.tags]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [entries, search, mapFilter, tagFilter]);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onImportFiles(e.target.files, parseTags(importTagsRaw));
    e.target.value = "";
  };

  const selectedVisible = filtered.filter((entry) => selectedIds.has(entry.id));
  const allVisibleSelected = filtered.length > 0 && filtered.every((entry) => selectedIds.has(entry.id));
  const selectedTags = [...new Set(selectedVisible.flatMap((entry) => entry.tags))].sort();

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        filtered.forEach((entry) => next.delete(entry.id));
      } else {
        filtered.forEach((entry) => next.add(entry.id));
      }
      return next;
    });
  };

  const addBatchTags = () => {
    const raw = window.prompt(`给 ${selectedIds.size} 场 demo 添加标签（逗号分隔）`);
    const tags = parseTags(raw ?? "");
    if (tags.length > 0) onBulkUpdateTags([...selectedIds], tags, []);
  };

  const removeBatchTags = () => {
    const raw = window.prompt(
      `从 ${selectedIds.size} 场 demo 移除标签（逗号分隔）`,
      selectedTags.join(", ")
    );
    const tags = parseTags(raw ?? "");
    if (tags.length > 0) onBulkUpdateTags([...selectedIds], [], tags);
  };

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>资料库</h1>
          <p>
            导入 .dem（自动经 cs2df 转 v3 ZIP）或 cs2-demo-format/3.x ZIP，本地管理、检索并进入分析。支持拖拽到窗口任意位置。
          </p>
        </div>
        <div className="stu-header-actions">
          {onReexportAll && entries.some((entry) => entry.sourceDemPath) && (
            <button
              type="button"
              className="stu-button stu-button-ghost"
              onClick={onReexportAll}
              disabled={importing}
              title="逐场重新导出所有记录了原始 .dem 路径的条目（cs2df 升级后刷新数据）"
            >
              <RotateCw size={15} /> 全部重新导出
            </button>
          )}
          <input
            className="stu-search stu-import-tags"
            type="text"
            placeholder="导入标签（逗号分隔，如：NJU 赛季3）"
            value={importTagsRaw}
            onChange={(e) => onImportTagsChange(e.target.value)}
            title="本次导入的 demo 都会附加这些标签"
          />
          {onNativeImport && (
            <button type="button" className="stu-button" onClick={onNativeImport} disabled={importing}>
              <FolderOpen size={15} /> {importing ? "导入中…" : "导入 demo"}
            </button>
          )}
          {!onNativeImport && (
            <label className={importing ? "stu-button stu-button-disabled" : "stu-button"}>
              <FolderOpen size={15} /> {importing ? "导入中…" : "导入 demo"}
              <input type="file" accept=".zip,.dem" multiple hidden onChange={onPick} disabled={importing} />
            </label>
          )}
        </div>
      </header>

      <div className="stu-stat-strip">
        <div className="stu-stat">
          <b>{entries.length}</b>
          <span>场次</span>
        </div>
        <div className="stu-stat">
          <b>{maps.length}</b>
          <span>地图</span>
        </div>
        <div className="stu-stat">
          <b>{entries.filter((entry) => entry.meta.hasReplay).length}</b>
          <span>含 2D 回放</span>
        </div>
        <div className="stu-stat">
          <b>{playerCount}</b>
          <span>选手人次</span>
        </div>
      </div>

      {entries.length > 0 && <SeriesManager entries={entries} />}

      {entries.length > 0 && (
        <div className="stu-toolbar">
          {selectedIds.size > 0 ? (
            <>
              <span className="stu-bulk-count">{selectedIds.size} 场已选</span>
              <button type="button" className="stu-button stu-button-ghost" onClick={addBatchTags}>
                添加标签
              </button>
              <button type="button" className="stu-button stu-button-ghost" onClick={removeBatchTags} disabled={selectedTags.length === 0}>
                移除标签
              </button>
              <button type="button" className="stu-button stu-button-ghost" onClick={() => setSelectedIds(new Set())}>
                取消
              </button>
            </>
          ) : (
            <>
              <input
                className="stu-search"
                type="search"
                placeholder="搜索地图 / 队伍 / 文件名…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="stu-chip-row">
                <button
                  type="button"
                  className={mapFilter === null ? "stu-chip stu-chip-active" : "stu-chip"}
                  onClick={() => setMapFilter(null)}
                >
                  全部
                </button>
                {maps.map((map) => (
                  <button
                    key={map}
                    type="button"
                    className={mapFilter === map ? "stu-chip stu-chip-active" : "stu-chip"}
                    onClick={() => setMapFilter(mapFilter === map ? null : map)}
                  >
                    {map}
                  </button>
                ))}
              </div>
            </>
          )}
          {selectedIds.size === 0 && allTags.length > 0 && (
            <div className="stu-chip-row">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={tagFilter === tag ? "stu-chip stu-chip-active" : "stu-chip"}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          mark
          title="资料库为空"
          hint="把 .dem 或 v3 ZIP 拖进窗口，或点右上角「导入 demo」。"
          action={
            <button type="button" className="stu-button stu-button-ghost" onClick={onLoadSample} disabled={importing}>
              加载示例
            </button>
          }
        />
      ) : (
        <div className="stu-table-wrap">
          <table className="stu-table">
            <thead>
              <tr>
                <th aria-label="选择">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} />
                </th>
                <th>地图</th>
                <th>对阵</th>
                <th>日期</th>
                <th className="stu-num">回合</th>
                <th className="stu-num">时长</th>
                <th>回放</th>
                <th>导入时间</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} onClick={() => onOpenDemo(entry.id)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(entry.id)}
                      onChange={() => toggleSelected(entry.id)}
                      aria-label={`选择 ${entry.fileName}`}
                    />
                  </td>
                  <td>
                    <span className="stu-map-badge">{entry.meta.mapName}</span>
                  </td>
                  <td>
                    <div className="stu-matchup">
                      <span>{entry.meta.teamAName}</span>
                      <b>
                        {entry.meta.teamAScore} : {entry.meta.teamBScore}
                      </b>
                      <span>{entry.meta.teamBName}</span>
                      {entry.tags.map((tag) => (
                        <span key={tag} className="stu-tag stu-tag-label">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <small className="stu-filename">{entry.fileName}</small>
                  </td>
                  <td className="stu-dim">{matchDateFromFileName(entry.fileName) ?? "—"}</td>
                  <td className="stu-num">{entry.meta.roundCount}</td>
                  <td className="stu-num">{formatDuration(entry.meta.durationSeconds)}</td>
                  <td>{entry.meta.hasReplay ? <span className="stu-tag stu-tag-ok">8Hz</span> : <span className="stu-tag">无</span>}</td>
                  <td className="stu-dim">{formatImportedAt(entry.importedAt)}</td>
                  <td className="stu-row-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="stu-icon-button" title="编辑标签" onClick={() => editTags(entry)}>
                      <TagIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="stu-icon-button"
                      title={entry.sourceDemPath ? "重新导出并替换" : "未记录原始 .dem 路径"}
                      disabled={!entry.sourceDemPath || importing}
                      onClick={() => onReexportDemo(entry)}
                    >
                      <RotateCw size={14} />
                    </button>
                    <button type="button" className="stu-icon-button" title="打开工作台" onClick={() => onOpenDemo(entry.id)}>
                      <Play size={14} />
                    </button>
                    <button
                      type="button"
                      className="stu-icon-button stu-icon-button-danger"
                      title="从资料库删除"
                      onClick={() => onRemoveDemo(entry.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="stu-dim" style={{ textAlign: "center" }}>
                    没有匹配的 demo
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * 系列赛与 BP 管理（资料库为 owner）：自动按日期+两队建议分组，
 * 手动选 BO 格式、确认系列、录入 BP（VetoInputDialog）。工作台与教练页只消费。
 */
function SeriesManager({ entries }: { entries: StudioDemoEntry[] }) {
  const [records, setRecords] = useState<StudioSeriesRecord[]>([]);
  const [editing, setEditing] = useState<{ suggestion: SeriesSuggestion; format: SeriesFormat; veto: SeriesVeto | null } | null>(null);
  const suggestions = useMemo(() => suggestSeriesGroups(entries), [entries]);

  useEffect(() => {
    void listSeriesRecords().then(setRecords);
  }, []);

  const recordById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  async function persist(suggestion: SeriesSuggestion, format: SeriesFormat, veto: SeriesVeto | null) {
    const saved = await saveSeriesRecord({ ...suggestion, format, veto });
    setRecords((cur) => [saved, ...cur.filter((r) => r.id !== saved.id)]);
  }

  if (suggestions.length === 0) return null;

  return (
    <details className="stu-card stu-series-manager">
      <summary>系列赛与 BP（{records.length}/{suggestions.length} 已建）</summary>
      <table className="stu-mini-table">
        <thead>
          <tr><th>建议分组</th><th className="stu-num">图</th><th>赛制</th><th>BP</th><th /></tr>
        </thead>
        <tbody>
          {suggestions.map((suggestion) => {
            const record = recordById.get(suggestion.id);
            const format = record?.format ?? suggestion.format;
            return (
              <tr key={suggestion.id}>
                <td>{suggestion.name}</td>
                <td className="stu-num">{suggestion.entryIds.length}</td>
                <td>
                  <select
                    className="stu-select stu-select-sm"
                    value={format}
                    onChange={(e) => void persist(suggestion, e.target.value as SeriesFormat, record?.veto ?? null)}
                  >
                    <option value="bo1">BO1</option>
                    <option value="bo3">BO3</option>
                    <option value="bo5">BO5</option>
                  </select>
                </td>
                <td className="stu-muted">{record?.veto ? `${record.veto.steps.length} 步` : "未录入"}</td>
                <td>
                  <button
                    type="button"
                    className="stu-button-sm"
                    onClick={() => setEditing({ suggestion, format, veto: record?.veto ?? null })}
                  >
                    {record?.veto ? "编辑 BP" : "录入 BP"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {records.some((r) => r.veto) && (
        <div className="stu-series-bp-list">
          {records.filter((r) => r.veto).map((r) => (
            <div key={r.id} className="stu-series-bp-item">
              <strong>{r.name} · {r.format.toUpperCase()}</strong>
              {r.veto && <BpView veto={r.veto} />}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <VetoInputDialog
          seriesId={editing.suggestion.id}
          teamAName={editing.suggestion.teamAName}
          teamBName={editing.suggestion.teamBName}
          initialFormat={editing.format}
          initialVeto={editing.veto}
          onSave={(veto) => persist(editing.suggestion, veto.format, veto)}
          onClose={() => setEditing(null)}
        />
      )}
    </details>
  );
}
