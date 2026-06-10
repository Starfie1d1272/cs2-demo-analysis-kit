import { FolderOpen, Play, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import { matchDateFromFileName, type StudioDemoEntry } from "../lib/library";

export interface LibraryViewProps {
  entries: StudioDemoEntry[];
  importing: boolean;
  onImportFiles: (files: Iterable<File>) => void;
  onLoadSample: () => void;
  onOpenDemo: (id: string) => void;
  onRemoveDemo: (id: string) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatImportedAt(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function LibraryView({ entries, importing, onImportFiles, onLoadSample, onOpenDemo, onRemoveDemo }: LibraryViewProps) {
  const [search, setSearch] = useState("");
  const [mapFilter, setMapFilter] = useState<string | null>(null);

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
      if (!term) return true;
      return [entry.fileName, entry.meta.mapName, entry.meta.teamAName, entry.meta.teamBName]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [entries, search, mapFilter]);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onImportFiles(e.target.files);
    e.target.value = "";
  };

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>资料库</h1>
          <p>导入 cs2-demo-format/2.0 ZIP，本地管理、检索并进入分析。支持拖拽到窗口任意位置。</p>
        </div>
        <div className="stu-header-actions">
          <button type="button" className="stu-button stu-button-ghost" onClick={onLoadSample} disabled={importing}>
            <Sparkles size={15} /> 加载示例
          </button>
          <label className={importing ? "stu-button stu-button-disabled" : "stu-button"}>
            <FolderOpen size={15} /> {importing ? "导入中…" : "导入 ZIP"}
            <input type="file" accept=".zip" multiple hidden onChange={onPick} disabled={importing} />
          </label>
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

      {entries.length > 0 && (
        <div className="stu-toolbar">
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
        </div>
      )}

      {entries.length === 0 ? (
        <div className="stu-empty">
          <div className="stu-empty-mark">⌖</div>
          <h2>资料库为空</h2>
          <p>把 v2 ZIP 拖进窗口，或点右上角「导入 ZIP」。还没有导出包？先用「加载示例」体验完整工作台。</p>
        </div>
      ) : (
        <div className="stu-table-wrap">
          <table className="stu-table">
            <thead>
              <tr>
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
                    </div>
                    <small className="stu-filename">{entry.fileName}</small>
                  </td>
                  <td className="stu-dim">{matchDateFromFileName(entry.fileName) ?? "—"}</td>
                  <td className="stu-num">{entry.meta.roundCount}</td>
                  <td className="stu-num">{formatDuration(entry.meta.durationSeconds)}</td>
                  <td>{entry.meta.hasReplay ? <span className="stu-tag stu-tag-ok">8Hz</span> : <span className="stu-tag">无</span>}</td>
                  <td className="stu-dim">{formatImportedAt(entry.importedAt)}</td>
                  <td className="stu-row-actions" onClick={(e) => e.stopPropagation()}>
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
                  <td colSpan={8} className="stu-dim" style={{ textAlign: "center" }}>
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
