import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, DataTable, STUDIO_TABLE_CLASSES, type DataTableColumn } from "@cs2dak/react";
import { displayTeamName, teamRenameGroups } from "../lib/identity";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { getFactsStore, TACTICAL_FACT_VERSION, type TacticalRoundFact } from "../lib/facts";
import { buildTacticalClusters, autoName, withTacticalTeamIdentities, type TacticalCluster } from "../lib/tactics";
import { playlistToMarkdown, type PlaylistItem } from "../lib/playlist";
import {
  listPlaybookNames,
  listPlaylist,
  loadCoachSettings,
  removePlaylistItem,
  saveCoachSettings,
  savePlaylistItem,
  savePlaybookName,
  type CoachSettings
} from "../lib/series";
import { PatternExplorer } from "./coach/PatternExplorer";
import { MapPoolTable } from "./coach/MapPoolTable";

type CoachTab = "patterns" | "playbook" | "playlist" | "anti";

export interface CoachViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  teamRenames?: Record<string, string>;
}

const TABS: Array<{ key: CoachTab; label: string }> = [
  { key: "patterns", label: "开局模式" },
  { key: "playbook", label: "战术本" },
  { key: "playlist", label: "备战清单" },
  { key: "anti", label: "备战报告" }
];

const SIDE_LABEL: Record<string, string> = { t: "T 方", ct: "CT 方" };

export function CoachView({
  allEntries,
  entries,
  onOpenMatch,
  onWatchDemo,
  onGoLibrary,
  teamRenames = {}
}: CoachViewProps) {
  const [tab, setTab] = useState<CoachTab>("patterns");
  const [allFacts, setAllFacts] = useState<TacticalRoundFact[]>([]);
  const [hasValidFacts, setHasValidFacts] = useState(false);
  // loading=true 初始值：防止首帧渲染时 clusters=[] && !loading 导致闪出空态
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<CoachSettings>({ myTeamName: null, opponentTeamName: null });
  // 视角：己方复盘（主体=我的队伍）/ 敌方侦察（主体=对手队伍）。两者复用同一套分析。
  const [mode, setMode] = useState<"own" | "scout">("own");
  const [playbook, setPlaybook] = useState<Record<string, string>>({});
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);
  const teamGroups = useMemo(
    () => teamRenameGroups(allEntries.map((entry) => ({ teamA: entry.meta.teamAName, teamB: entry.meta.teamBName })), teamRenames),
    [allEntries, teamRenames]
  );
  const subjectTeam = mode === "own" ? settings.myTeamName : settings.opponentTeamName;

  // facts：filterBySubjectTeam 过滤后的子集（给开局模式/战术本）；allFacts：全量（给备战报告，两支队伍各自跨对手聚合）。
  const facts = useMemo(
    () => filterBySubjectTeam(allFacts, subjectTeam, teamRenames),
    [allFacts, subjectTeam, teamRenames]
  );
  const clusters = useMemo(
    () => facts.length > 0 ? buildTacticalClusters(withTacticalTeamIdentities(facts, teamRenames)) : [],
    [facts, teamRenames]
  );

  useEffect(() => {
    void loadCoachSettings().then(setSettings);
    void listPlaybookNames().then(setPlaybook);
    void listPlaylist().then(setPlaylist);
  }, []);

  useEffect(() => {
    if (entries.length === 0) {
      setAllFacts([]);
      setHasValidFacts(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFactsStore().getTacticalRounds({ matchIds: entries.map(matchIdForEntry) })
      .then((rows) => {
        if (!cancelled) {
          const validRows = rows.filter(isCurrentTacticalRoundFact);
          setHasValidFacts(validRows.length > 0);
          setAllFacts(validRows);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [entries, teamRenames]); // subjectTeam 变化时不回库——useMemo 派生即可

  async function setMyTeam(teamName: string) {
    const next = await saveCoachSettings({ ...settings, myTeamName: teamName || null });
    setSettings(next);
  }

  async function setOpponentTeam(teamName: string) {
    const next = await saveCoachSettings({ ...settings, opponentTeamName: teamName || null });
    setSettings(next);
  }

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有教练数据"
          hint="先导入多场 demo，再沉淀开局模式、战术本和备战报告。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  const antiMarkdown = useMemo(
    () => (tab === "anti" ? buildAntiStratMarkdown(clusters, subjectTeam) : ""),
    [tab, clusters, subjectTeam],
  );

  return (
    <div className="stu-view stu-coach-view">
      <header className="stu-view-header">
        <div>
          <h1>教练工作台</h1>
          <p>把多场 demo 里的开局站位、道具顺序和系列赛 BP 整理成教练能直接阅读的备战视图。</p>
        </div>
        <div className="stu-coach-filter-row">
          <div className="stu-subtabs stu-coach-mode-toggle" role="tablist" aria-label="分析视角">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "own"}
              className={mode === "own" ? "stu-subtab stu-subtab-active" : "stu-subtab"}
              onClick={() => setMode("own")}
              title="复盘我的队伍：跨所有对手聚合其打法"
            >
              己方复盘
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "scout"}
              className={mode === "scout" ? "stu-subtab stu-subtab-active" : "stu-subtab"}
              onClick={() => setMode("scout")}
              title="侦察即将交手的对手：跨所有对手聚合其打法（不限是否与我方交手过）"
            >
              敌方侦察
            </button>
          </div>
          <label className={mode === "own" ? "stu-coach-team-picker stu-coach-team-picker-active" : "stu-coach-team-picker"}>
            我的队伍
            <select value={settings.myTeamName ?? ""} onChange={(event) => void setMyTeam(event.target.value)}>
              <option value="">全部队伍</option>
              {teamGroups.map((team) => <option key={team.displayName} value={team.displayName}>{team.displayName}</option>)}
            </select>
          </label>
          <label className={mode === "scout" ? "stu-coach-team-picker stu-coach-team-picker-active" : "stu-coach-team-picker"}>
            对手队伍
            <select value={settings.opponentTeamName ?? ""} onChange={(event) => void setOpponentTeam(event.target.value)}>
              <option value="">未选择</option>
              {teamGroups.map((team) => <option key={team.displayName} value={team.displayName}>{team.displayName}</option>)}
            </select>
          </label>
        </div>
      </header>
      <div className="stu-subtabs" role="tablist" aria-label="教练工作台">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? "stu-subtab stu-subtab-active" : "stu-subtab"}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
      {!error && loading && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的开局 pattern…</div>}
      {!error && !loading && clusters.length === 0 && entries.length > 0 && hasValidFacts && (
        <EmptyState
          variant="insufficient"
          title="该队伍在当前范围内无战术回合"
          hint={subjectTeam
            ? `「${subjectTeam}」在当前聚合范围内没有可用回合（可能这些场次里没有该队，或该队未打这些地图）。调整上方聚合范围或在「${mode === "own" ? "我的队伍" : "对手队伍"}」里换一支队。`
            : `请在上方${mode === "own" ? "「我的队伍」" : "「对手队伍」"}里选择要分析的队伍。`}
        />
      )}
      {!error && !loading && clusters.length === 0 && entries.length > 0 && !hasValidFacts && (
        <EmptyState
          variant="insufficient"
          title="需要重建教练事实"
          hint="当前资料库里的教练 facts 是旧口径，请重新导入或重建这些 demo 后再查看战术聚类。"
        />
      )}
      {!loading && clusters.length > 0 && tab === "patterns" && (
        <PatternExplorer
          clusters={clusters}
          facts={facts}
          entryByMatchId={entryByMatchId}
          onOpenMatch={onOpenMatch}
          onWatchDemo={onWatchDemo}
          onAddToPlaylist={async (cluster, fact) => {
            const entry = entryByMatchId.get(fact.matchId);
            const item: PlaylistItem = {
              id: `${cluster.id}:${fact.matchId}:${fact.roundNumber}`,
              group: autoName(cluster) || `${cluster.mapName} ${cluster.side.toUpperCase()}`,
              matchId: fact.matchId,
              mapName: fact.mapName,
              roundNumber: fact.roundNumber,
              clusterId: cluster.id,
              patternFingerprint: patternFingerprint(cluster),
              note: entry ? `${entry.meta.teamAName} ${entry.meta.teamAScore}:${entry.meta.teamBScore} ${entry.meta.teamBName}` : "",
            };
            await savePlaylistItem(item);
            setPlaylist(await listPlaylist());
          }}
        />
      )}
      {!loading && clusters.length > 0 && tab === "playbook" && (
        <PlaybookTable
          clusters={clusters}
          playbook={playbook}
          onRename={async (patternKey, name) => {
            await savePlaybookName(patternKey, name);
            setPlaybook(await listPlaybookNames());
          }}
        />
      )}
      {tab === "playlist" && (
        <PlaylistTable
          items={playlist}
          entryByMatchId={entryByMatchId}
          onUpdate={async (item) => {
            await savePlaylistItem(item);
            setPlaylist(await listPlaylist());
          }}
          onRemove={async (id) => {
            await removePlaylistItem(id);
            setPlaylist(await listPlaylist());
          }}
          onOpenMatch={(matchId, roundNumber) => {
            const entry = entryByMatchId.get(matchId);
            if (entry) onOpenMatch(entry.id, { roundNumber });
          }}
          onWatchDemo={onWatchDemo}
        />
      )}
      {!loading && clusters.length > 0 && tab === "anti" && (
        <>
          <MapPoolTable
            facts={allFacts}
            myTeamName={settings.myTeamName}
            opponentTeamName={settings.opponentTeamName}
            teamRenames={teamRenames}
          />
          <details className="stu-card stu-coach-report-details">
            <summary>备战报告 Markdown</summary>
            <textarea className="stu-coach-report" readOnly value={antiMarkdown} />
          </details>
        </>
      )}
    </div>
  );
}

function patternFingerprint(cluster: TacticalCluster): string {
  return [cluster.mapName, cluster.side, cluster.teamIdentity, cluster.economyEntry, cluster.openingSignature].join(":");
}

function normalizeTeamName(name: string | null | undefined, teamRenames: Record<string, string>): string {
  return displayTeamName(name ?? "", teamRenames).trim().toLowerCase();
}

/**
 * 按"分析主体队伍"过滤——只看该队的回合，跨其所有对手聚合（对手是抽象维度）。
 * subjectTeam 为 null 时返回全部（"全部队伍"概览）。绝不做 head-to-head 对手限制。
 */
function filterBySubjectTeam(
  rows: TacticalRoundFact[],
  subjectTeam: string | null,
  teamRenames: Record<string, string>,
): TacticalRoundFact[] {
  if (!subjectTeam) return rows;
  const subject = normalizeTeamName(subjectTeam, teamRenames);
  return rows.filter((row) => normalizeTeamName(row.teamName, teamRenames) === subject);
}

/** 验证 site entry 子字段包含扩展口径（trajectory / entryChokeId / routeFamilyId）。 */
function hasExtendedEntryFields(entry: object): boolean {
  return Array.isArray((entry as Record<string, unknown>).trajectory) && "entryChokeId" in entry && "routeFamilyId" in entry;
}

function isCurrentTacticalRoundFact(row: TacticalRoundFact): boolean {
  // 口径版本不符（旧 facts 无 analysisVersion / 缺 c4Route 等新字段）→ 需重建。
  if (row.analysisVersion !== TACTICAL_FACT_VERSION) return false;
  if (!row.openingPattern || typeof row.openingPattern.coarseSignature !== "string") return false;
  if (typeof row.openingPattern.detailedSignature !== "string" || !Array.isArray(row.openingPattern.evidence)) return false;
  if (!Array.isArray(row.openingPressure)) return false;
  if (!row.siteEntries?.a || !row.siteEntries.b) return false;
  if (typeof row.opponentEconomy !== "string") return false;
  if (![...row.siteEntries.a.order, ...row.siteEntries.b.order].every(hasExtendedEntryFields)) return false;
  if (!Array.isArray(row.grenades) || !Array.isArray(row.grenadeOccurrenceIds)) return false;
  if (typeof row.teamName !== "string" || typeof row.opponentName !== "string") return false;
  return row.openingPressure.every((event) =>
    event &&
    typeof event.callout === "string" &&
    typeof event.calloutLabel === "string" &&
    (event.kind === "forward" || event.kind === "deep")
  );
}

function PlaybookTable({
  clusters,
  playbook,
  onRename
}: {
  clusters: TacticalCluster[];
  playbook: Record<string, string>;
  onRename: (clusterId: string, name: string) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // ref 持有 drafts 最新值，避免按键时 columns useMemo 失效重建
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  // 预计算 fingerprint，避免 name/action 两列重复计算
  const fingerprints = useMemo(
    () => new Map(clusters.map((c) => [c.id, patternFingerprint(c)] as const)),
    [clusters],
  );

  const columns = useMemo<DataTableColumn<TacticalCluster>[]>(() => [
    {
      key: "name", label: "战术名",
      render: (cluster) => {
        const key = fingerprints.get(cluster.id)!;
        const value = draftsRef.current[key] ?? playbook[key] ?? "";
        return <input className="stu-input stu-input-sm" value={value} placeholder="命名战术" onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} />;
      }
    },
    { key: "pattern", label: "打法模式", format: (c) => `${c.mapName} · ${SIDE_LABEL[c.side]} · ${autoName(c)}` },
    { key: "rounds", label: "样本", numeric: true, sortable: true, sortValue: (c) => c.roundCount, format: (c) => c.roundCount },
    {
      key: "action", label: "",
      render: (cluster) => {
        const key = fingerprints.get(cluster.id)!;
        const value = draftsRef.current[key] ?? playbook[key] ?? "";
        return <button type="button" className="stu-button-sm" onClick={() => void onRename(key, value)}>保存</button>;
      }
    },
  ], [fingerprints, playbook, onRename]);

  return (
    <div className="stu-card">
      <h3>战术本</h3>
      <DataTable
        classes={STUDIO_TABLE_CLASSES}
        rows={clusters}
        rowKey={(c) => c.id}
        pageSize={20}
        paginationInfo={(total) => `${total} 个打法模式`}
        columns={columns}
      />
    </div>
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
  items: PlaylistItem[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onUpdate: (item: PlaylistItem) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onOpenMatch: (matchId: string, roundNumber: number) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
}) {
  const markdown = playlistToMarkdown("备战清单", items);
  if (items.length === 0) {
    return <EmptyState variant="insufficient" title="备战清单为空" hint="在开局模式的证据回合里点击加入。" />;
  }

  const columns = useMemo<DataTableColumn<PlaylistItem>[]>(() => [
    { key: "group", label: "分组", format: (item) => item.group },
    { key: "source", label: "来源", render: (item) => <span title={item.matchId}>{item.mapName ? `${item.mapName} · ${item.matchId}` : item.matchId}</span> },
    { key: "round", label: "回合", numeric: true, format: (item) => `R${item.roundNumber}` },
    {
      key: "note", label: "备注",
      render: (item) => <input className="stu-input stu-input-sm" value={item.note} onChange={(event) => void onUpdate({ ...item, note: event.target.value })} />
    },
    {
      key: "actions", label: "",
      render: (item) => {
        const entry = entryByMatchId.get(item.matchId);
        return <>
          <button type="button" className="stu-button-sm" onClick={() => onOpenMatch(item.matchId, item.roundNumber)}>回放</button>
          {entry?.sourceDemPath && onWatchDemo && <button type="button" className="stu-button-sm" onClick={() => onWatchDemo(entry.id, { roundNumber: item.roundNumber })}>进游戏</button>}
          <button type="button" className="stu-button-sm" onClick={() => void onRemove(item.id)}>删除</button>
        </>;
      }
    },
  ], [entryByMatchId, onUpdate, onOpenMatch, onWatchDemo, onRemove]);

  return (
    <div className="stu-card">
      <h3>备战清单</h3>
      <DataTable
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

function buildAntiStratMarkdown(clusters: TacticalCluster[], myTeamName: string | null): string {
  const mapPool = [...new Set(clusters.map((c) => c.mapName))].sort();
  const sections = mapPool.map((map) => {
    const mapClusters = clusters.filter((c) => c.mapName === map);
    const tPatterns = mapClusters.filter((c) => c.side === "t").slice(0, 5);
    const ctPatterns = mapClusters.filter((c) => c.side === "ct").slice(0, 5);
    const fmt = (cs: TacticalCluster[]) =>
      cs.map((c) => `- ${autoName(c)}（${c.roundCount} 回合，胜率 ${c.winRatePercent?.toFixed(1) ?? "—"}%）`).join("\n");
    return `## ${map}\n\n### T 方\n${fmt(tPatterns) || "暂无数据"}\n\n### CT 方\n${fmt(ctPatterns) || "暂无数据"}`;
  });
  const header = `# 备战报告${myTeamName ? `（${myTeamName}）` : ""}\n`;
  return sections.length > 0 ? `${header}\n${sections.join("\n\n")}` : `${header}\n暂无聚类数据。`;
}
