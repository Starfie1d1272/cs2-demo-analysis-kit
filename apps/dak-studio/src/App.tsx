import { Crosshair, Film, LibraryBig, Trophy, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { importDemoFile, listDemoEntries, removeDemo, type StudioDemoEntry } from "./lib/library";
import { EMPTY_SCOPE, applyScope, type CohortScopeState } from "./components/CohortScope";
import { LibraryView } from "./views/LibraryView";
import { MatchView } from "./views/MatchView";
import { PlayersView } from "./views/PlayersView";
import { LeaderboardView } from "./views/LeaderboardView";
import sampleZipUrl from "../../../fixtures/input/sample-match.zip?url";

type StudioView = "library" | "match" | "players" | "leaderboard";

const NAV: { key: StudioView; label: string; hint: string; icon: typeof LibraryBig }[] = [
  { key: "library", label: "资料库", hint: "导入与管理 Demo", icon: LibraryBig },
  { key: "match", label: "比赛工作台", hint: "回合 / 地图 / 回放", icon: Film },
  { key: "players", label: "选手档案", hint: "个人打法复盘", icon: UserRound },
  { key: "leaderboard", label: "排行榜", hint: "跨场指标对比", icon: Trophy }
];

export function App() {
  const [entries, setEntries] = useState<StudioDemoEntry[]>([]);
  const [view, setView] = useState<StudioView>("library");
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null);
  const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scope, setScope] = useState<CohortScopeState>(EMPTY_SCOPE);
  // 稳定数组标识：避免 App 无关重渲染触发档案/排行榜重新聚合
  const scopedEntries = useMemo(() => applyScope(entries, scope), [entries, scope]);

  useEffect(() => {
    listDemoEntries()
      .then(setEntries)
      .catch((err) => setNotice(`读取本地资料库失败：${err instanceof Error ? err.message : String(err)}`));
  }, []);

  const importFiles = useCallback(async (files: Iterable<File>) => {
    const zips = [...files].filter((file) => file.name.toLowerCase().endsWith(".zip"));
    if (zips.length === 0) {
      setNotice("请选择 cs2-demo-format/2.0 ZIP 文件");
      return;
    }
    setImporting(true);
    setNotice(null);
    let imported = 0;
    let duplicates = 0;
    const errors: string[] = [];
    for (const file of zips) {
      try {
        const result = await importDemoFile(file);
        if (result.duplicate) duplicates += 1;
        else imported += 1;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    setEntries(await listDemoEntries());
    const parts: string[] = [];
    if (imported > 0) parts.push(`导入 ${imported} 场`);
    if (duplicates > 0) parts.push(`跳过重复 ${duplicates} 场`);
    if (errors.length > 0) parts.push(`失败 ${errors.length} 场（${errors[0]}）`);
    setNotice(parts.join("，") || null);
    setImporting(false);
  }, []);

  const loadSample = useCallback(async () => {
    setImporting(true);
    setNotice(null);
    try {
      const response = await fetch(sampleZipUrl);
      const blob = await response.blob();
      await importFiles([new File([blob], "sample-match.zip", { type: "application/zip" })]);
    } catch (err) {
      setNotice(`示例加载失败：${err instanceof Error ? err.message : String(err)}`);
      setImporting(false);
    }
  }, [importFiles]);

  const openDemo = useCallback((id: string) => {
    setSelectedDemoId(id);
    setView("match");
  }, []);

  const openPlayer = useCallback((playerKey: string) => {
    setSelectedPlayerKey(playerKey);
    setView("players");
  }, []);

  const handleRemove = useCallback(
    async (id: string) => {
      await removeDemo(id);
      setEntries(await listDemoEntries());
      setSelectedDemoId((current) => (current === id ? null : current));
    },
    []
  );

  return (
    <div
      className="stu-app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) void importFiles(e.dataTransfer.files);
      }}
    >
      <aside className="stu-sidebar">
        <div className="stu-brand">
          <div className="stu-brand-mark">
            <Crosshair size={18} />
          </div>
          <div>
            <b>DAK Studio</b>
            <small>战术分析 · 打法复盘</small>
          </div>
        </div>
        <nav className="stu-nav">
          {NAV.map(({ key, label, hint, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={view === key ? "stu-nav-item stu-nav-item-active" : "stu-nav-item"}
              onClick={() => setView(key)}
            >
              <Icon size={16} />
              <span>
                <b>{label}</b>
                <small>{hint}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="stu-sidebar-foot">
          <span>{entries.length} 场 demo</span>
          <small>v2 ZIP · 本地存储</small>
        </div>
      </aside>

      <main className="stu-main">
        {notice && (
          <div className="stu-notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)}>
              ✕
            </button>
          </div>
        )}
        {view === "library" && (
          <LibraryView
            entries={entries}
            importing={importing}
            onImportFiles={importFiles}
            onLoadSample={loadSample}
            onOpenDemo={openDemo}
            onRemoveDemo={handleRemove}
          />
        )}
        {view === "match" && (
          <MatchView entries={entries} demoId={selectedDemoId} onSelectDemo={setSelectedDemoId} onGoLibrary={() => setView("library")} />
        )}
        {view === "players" && (
          <PlayersView
            allEntries={entries}
            entries={scopedEntries}
            scope={scope}
            onScopeChange={setScope}
            selectedPlayerKey={selectedPlayerKey}
            onSelectPlayer={setSelectedPlayerKey}
            onOpenMatch={openDemo}
            onGoLibrary={() => setView("library")}
          />
        )}
        {view === "leaderboard" && (
          <LeaderboardView
            allEntries={entries}
            entries={scopedEntries}
            scope={scope}
            onScopeChange={setScope}
            onPlayerClick={openPlayer}
            onGoLibrary={() => setView("library")}
          />
        )}
      </main>
    </div>
  );
}
