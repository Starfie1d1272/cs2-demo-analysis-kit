import { listPatternNames, savePatternName } from "../lib/pattern-names";
import { savePrepItem } from "../lib/prep-items";
import { usePageReady } from "../lib/use-page-ready";
import { assertCurrentFacts } from "../lib/facts-readiness";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../lib/queries/query-cache";
import { getObservedMapPool } from "../lib/queries/spatial-queries";
import { STUDIO_TABLE_CLASSES } from "../components/table-styles";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { EmptyState, DataTable, type DataTableColumn } from "@cs2dak/react";
import { displayTeamName, teamRenameGroups } from "../lib/identity";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/demo-entry";
import { TACTICAL_FACT_VERSION } from "@cs2dak/tactics";
import { getFactsStore } from "../lib/facts-store";
import type { TacticalRoundFact } from "@cs2dak/tactics";
import { buildTacticalClusters, type TacticalCluster } from "@cs2dak/tactics";
import { formatTacticalClusterName as autoName } from "@cs2dak/presentation";
import { withTacticalDisplayGroupKeys } from "../lib/tactical-display-groups";
import type { PrepItem } from "../lib/prep-items";
import { PrepItemsPanel } from "./coach/PrepItemsPanel";
import {
  loadCoachSettings,
  saveCoachSettings,
} from "../lib/series";
import { PatternExplorer } from "./coach/PatternExplorer";
import { MapPoolTable } from "./coach/MapPoolTable";
import type { AnalysisContext, AnalysisRoleRef } from "../lib/analysis-context";

type CoachTab = "patterns" | "playlist" | "anti";

export interface CoachViewProps {
  initialTab?: CoachTab;
  onPageReady?: (keys: string[]) => void;
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  teamRenames?: Record<string, string>;
  analysisContext: AnalysisContext;
  onAnalysisContextChange: Dispatch<SetStateAction<AnalysisContext>>;
}

const TABS: Array<{ key: CoachTab; label: string }> = [
  { key: "patterns", label: "战术模式" },
  { key: "playlist", label: "备战材料" },
  { key: "anti", label: "报告" }
];

const SIDE_LABEL: Record<string, string> = { t: "T 方", ct: "CT 方" };

function teamRole(label: string): AnalysisRoleRef {
  return { kind: "team", id: label.trim().toLowerCase(), label };
}

export function CoachView({
  allEntries,
  entries,
  onOpenMatch,
  onWatchDemo,
  onGoLibrary,
  teamRenames = {},
  analysisContext,
  onAnalysisContextChange,
  onPageReady,
  initialTab = "patterns",
}: CoachViewProps) {
  const [tab, setTab] = useState<CoachTab>(initialTab);
  const [allFacts, setAllFacts] = useState<TacticalRoundFact[]>([]);
  const [factsGeneration, setFactsGeneration] = useState(-1);
  const [hasValidFacts, setHasValidFacts] = useState(false);
  // loading=true 初始值：防止首帧渲染时 clusters=[] && !loading 导致闪出空态
  const [loading, setLoading] = useState(true);
  const [playbook, setPlaybook] = useState<Record<string, string>>({});
  const [prepRevision, setPrepRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const analysisData = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  usePageReady(settingsReady && (entries.length === 0 || analysisData.status === "error" || (analysisData.status === "ready" && (!loading || error !== null))), onPageReady);
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);
  const teamGroups = useMemo(
    () => teamRenameGroups(allEntries.map((entry) => ({ teamA: entry.meta.teamAName, teamB: entry.meta.teamBName })), teamRenames),
    [allEntries, teamRenames]
  );
  // 视角和主体均由共同 AnalysisContext 持有；Coach 不再拥有平行 team/role state。
  const mode = analysisContext.goal === "opponent-prep" ? "scout" : "own";
  const subjectTeam = mode === "own" ? analysisContext.roles.beneficiary?.label ?? null : analysisContext.roles.opponent?.label ?? null;

  // 没有明确主体时不能把全部队伍混成一个“模式”；直接入口只要求用户补一次队伍。
  const facts = useMemo(
    () => subjectTeam && analysisData.status === "ready" && factsGeneration === analysisData.generation ? filterBySubjectTeam(allFacts, subjectTeam, teamRenames) : [],
    [allFacts, subjectTeam, teamRenames, analysisData, factsGeneration]
  );
  const clusters = useMemo(
    () => facts.length > 0 ? buildTacticalClusters(withTacticalDisplayGroupKeys(facts, teamRenames)) : [],
    [facts, teamRenames]
  );

  useEffect(() => {
    let cancelled = false;
    setSettingsReady(false);
    setSettingsError(null);
    const settingsRequest = loadCoachSettings().then((settings) => {
      if (cancelled) return;
      onAnalysisContextChange((current) => {
        if (current.goal === "own-review" || current.goal === "opponent-prep" || current.roles.beneficiary || current.roles.opponent) return current;
        const beneficiary = settings.myTeamName ? teamRole(settings.myTeamName) : undefined;
        const opponent = settings.opponentTeamName ? teamRole(settings.opponentTeamName) : undefined;
        return {
          ...current,
          goal: opponent ? "opponent-prep" : "own-review",
          roles: { ...current.roles, ...(beneficiary ? { beneficiary } : {}), ...(opponent ? { opponent } : {}) },
        };
      });
    });
    const playbookRequest = listPatternNames().then((rows) => { if (!cancelled) setPlaybook(rows); });
    void Promise.allSettled([settingsRequest, playbookRequest]).then((results) => {
      if (cancelled) return;
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") setSettingsError(failure.reason instanceof Error ? failure.reason.message : String(failure.reason));
      setSettingsReady(true);
    });
    return () => { cancelled = true; };
  }, [onAnalysisContextChange]);

  useEffect(() => {
    if (entries.length === 0 || analysisData.status !== "ready") {
      setAllFacts([]);
      setHasValidFacts(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.resolve().then(() => { assertCurrentFacts(entries); return getFactsStore().getTacticalRounds({ matchIds: entries.map(matchIdForEntry) }); })
      .then((rows) => {
        if (!cancelled) {
          assertAnalysisGeneration(analysisData.generation);
          const validRows = rows.filter(isCurrentTacticalRoundFact);
          setHasValidFacts(validRows.length > 0);
          setAllFacts(validRows);
          setFactsGeneration(analysisData.generation);
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
  }, [entries, teamRenames, analysisData.generation, analysisData.status]); // subjectTeam 变化时不回库——useMemo 派生即可

  function setMode(next: "own" | "scout") {
    onAnalysisContextChange((current) => ({ ...current, goal: next === "own" ? "own-review" : "opponent-prep" }));
  }

  async function setTeamRole(kind: "beneficiary" | "opponent", teamName: string) {
    const settings = await loadCoachSettings();
    await saveCoachSettings({
      ...settings,
      ...(kind === "beneficiary" ? { myTeamName: teamName || null } : { opponentTeamName: teamName || null }),
    });
    onAnalysisContextChange((current) => {
      const roles = { ...current.roles };
      if (teamName) roles[kind] = teamRole(teamName);
      else delete roles[kind];
      return { ...current, roles };
    });
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
              对手备战
            </button>
          </div>
          <label className={mode === "own" ? "stu-coach-team-picker stu-coach-team-picker-active" : "stu-coach-team-picker"}>
            我的队伍
            <select value={analysisContext.roles.beneficiary?.label ?? ""} onChange={(event) => void setTeamRole("beneficiary", event.target.value)}>
              <option value="">请选择己方队伍</option>
              {teamGroups.map((team) => <option key={team.displayName} value={team.displayName}>{team.displayName}</option>)}
            </select>
          </label>
          <label className={mode === "scout" ? "stu-coach-team-picker stu-coach-team-picker-active" : "stu-coach-team-picker"}>
            对手队伍
            <select value={analysisContext.roles.opponent?.label ?? ""} onChange={(event) => void setTeamRole("opponent", event.target.value)}>
              <option value="">请选择对手队伍</option>
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
      {settingsError && <EmptyState variant="error" title="读取教练资料失败" hint={settingsError} />}
      {!error && entries.length === 0 && tab !== "playlist" && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
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
        <>
          <PatternExplorer
            clusters={clusters}
            facts={facts}
            entryByMatchId={entryByMatchId}
            onOpenMatch={onOpenMatch}
            onWatchDemo={onWatchDemo}
            onAddToPlaylist={async (cluster, fact) => {
              const entry = entryByMatchId.get(fact.matchId);
              const item: PrepItem = {
                id: `${cluster.id}:${fact.matchId}:${fact.roundNumber}`,
                group: autoName(cluster) || `${cluster.mapName} ${cluster.side.toUpperCase()}`,
                matchId: fact.matchId,
                mapName: fact.mapName,
                roundNumber: fact.roundNumber,
                clusterId: cluster.id,
                patternFingerprint: patternFingerprint(cluster),
                source: "tactical-pattern",
                coverage: `${cluster.roundCount} 回合 · ${cluster.mapName} · ${SIDE_LABEL[cluster.side]}`,
                note: entry ? `${entry.meta.teamAName} ${entry.meta.teamAScore}:${entry.meta.teamBScore} ${entry.meta.teamBName}` : "",
              };
              await savePrepItem(item);
              setPrepRevision((revision) => revision + 1);
            }}
          />
          <details className="stu-card stu-coach-pattern-names">
            <summary>模式命名与备注</summary>
            <PlaybookTable
              clusters={clusters}
              playbook={playbook}
              onRename={async (patternKey, name) => {
                await savePatternName(patternKey, name);
                setPlaybook(await listPatternNames());
              }}
            />
          </details>
        </>
      )}
      {tab === "playlist" && (
        <PrepItemsPanel
          facts={facts}
          revision={prepRevision}
          entryByMatchId={entryByMatchId}
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
            rows={getObservedMapPool(allFacts, analysisContext.roles.beneficiary?.label ?? null, analysisContext.roles.opponent?.label ?? null, teamRenames)}
            hasOwn={Boolean(analysisContext.roles.beneficiary)}
            hasOpponent={Boolean(analysisContext.roles.opponent)}
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
  const [tableState, setTableState] = useState<import("@cs2dak/presentation").TableState>({ sort: { key: null, direction: "desc" }, page: 0 });
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
        state={tableState} onStateChange={setTableState}
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
