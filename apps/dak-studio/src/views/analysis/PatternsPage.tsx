import type { AnalysisExportSource } from "../../lib/analysis-export";
import type { PatternPageState } from "../../lib/pattern-page-state";
import { filterBySubjectTeam, isCurrentTacticalRoundFact } from "../../lib/pattern-observations";
import { usePageReady } from "../../lib/use-page-ready";
import { assertCurrentFacts } from "../../lib/facts-readiness";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../../lib/queries/query-cache";
import { useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { EmptyState } from "@cs2dak/react";
import { teamRenameGroups } from "../../lib/identity";
import { matchIdForEntry, type StudioDemoEntry } from "../../lib/demo-entry";
import { getFactsStore } from "../../lib/facts-store";
import type { TacticalRoundFact } from "@cs2dak/tactics";
import { buildTacticalClusters } from "@cs2dak/tactics";
import { withTacticalDisplayGroupKeys } from "../../lib/tactical-display-groups";
import { PatternsTheme } from "./PatternsTheme";
import type { AnalysisContext, AnalysisRoleRef } from "../../lib/analysis-context";

type PatternTab = "patterns" | "anti";

export interface PatternsPageProps {
  exportSource?: AnalysisExportSource | null;
  state: PatternPageState;
  onStateChange: Dispatch<SetStateAction<PatternPageState>>;
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

const TABS: Array<{ key: PatternTab; label: string }> = [
  { key: "patterns", label: "战术模式" },
  { key: "anti", label: "报告" }
];

function teamRole(label: string): AnalysisRoleRef {
  return { kind: "team", id: label.trim().toLowerCase(), label };
}

export function PatternsPage({
  exportSource, state, onStateChange,
  allEntries,
  entries,
  onOpenMatch,
  onWatchDemo,
  onGoLibrary,
  teamRenames = {},
  analysisContext,
  onAnalysisContextChange,
  onPageReady,
}: PatternsPageProps) {
  const tab = state.section;
  const setTab = (section: PatternTab) => onStateChange(current => ({ ...current, section }));
  const [allFacts, setAllFacts] = useState<TacticalRoundFact[]>([]);
  const [factsGeneration, setFactsGeneration] = useState(-1);
  const [factsRequest, setFactsRequest] = useState("");
  const requestKey = JSON.stringify([entries.map(entry => entry.id), teamRenames]);
  const hasSnapshot = factsGeneration >= 0 && factsRequest === requestKey;
  const [hasValidFacts, setHasValidFacts] = useState(false);
  // loading=true 初始值：防止首帧渲染时 clusters=[] && !loading 导致闪出空态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const analysisData = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  usePageReady(entries.length === 0 || analysisData.status === "error" || (analysisData.status === "ready" && (!loading || error !== null)), onPageReady);
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);
  const teamGroups = useMemo(
    () => teamRenameGroups(allEntries.map((entry) => ({ teamA: entry.meta.teamAName, teamB: entry.meta.teamBName })), teamRenames),
    [allEntries, teamRenames]
  );
  // 视角和主体均由共同 AnalysisContext 持有；Coach 不再拥有平行 team/role state。
  const mode = analysisContext.goal === "opponent-prep" ? "scout" : "own";
  const subjectTeam = mode === "own" ? analysisContext.roles.beneficiary?.label ?? null : analysisContext.roles.beneficiary ? analysisContext.roles.opponent?.label ?? null : null;

  // 没有明确主体时不能把全部队伍混成一个“模式”；直接入口只要求用户补一次队伍。
  const facts = useMemo(
    () => subjectTeam && hasSnapshot ? filterBySubjectTeam(allFacts, subjectTeam, teamRenames) : [],
    [allFacts, subjectTeam, teamRenames, hasSnapshot]
  );
  const clusters = useMemo(
    () => facts.length > 0 ? buildTacticalClusters(withTacticalDisplayGroupKeys(facts, teamRenames)) : [],
    [facts, teamRenames]
  );

  useEffect(() => {
    if (entries.length === 0 || analysisData.status !== "ready") {
      setLoading(analysisData.status === "invalidating");
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
          setFactsRequest(requestKey);
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
  }, [entries, teamRenames, analysisData.generation, analysisData.status, requestKey]); // subjectTeam 变化时不回库——useMemo 派生即可

  function setMode(next: "own" | "scout") {
    onAnalysisContextChange((current) => ({ ...current, goal: next === "own" ? "own-review" : "opponent-prep" }));
  }

  function setTeamRole(kind: "beneficiary" | "opponent", teamName: string) {
    onAnalysisContextChange((current) => {
      const roles = { ...current.roles };
      if (teamName) roles[kind] = teamRole(teamName);
      else delete roles[kind];
      return { ...current, roles };
    });
  }

  return (
    <div className="stu-view stu-coach-view">
      <header className="stu-view-header">
        <div>
          <h1>战术模式与对手侦察</h1>
          <p>观察当前语料中队伍的开局模式与地图池。</p>
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
      <div className="stu-subtabs" role="tablist" aria-label="模式观察">
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
      {hasSnapshot && (loading || analysisData.status !== "ready" || factsGeneration !== analysisData.generation || error) && <p className="stu-muted" role="status">{error || analysisData.status === "error" ? "更新失败，显示旧版本结果。" : "正在更新，显示旧版本结果。"}</p>}
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
      {!hasSnapshot && !error && loading && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的开局 pattern…</div>}
      {!error && !loading && clusters.length === 0 && entries.length > 0 && hasValidFacts && (
        <EmptyState
          variant="insufficient"
          title="该队伍在当前范围内无战术回合"
          hint={subjectTeam
            ? `「${subjectTeam}」在当前聚合范围内没有可用回合（可能这些场次里没有该队，或该队未打这些地图）。调整上方聚合范围或在「${mode === "own" ? "我的队伍" : "对手队伍"}」里换一支队。`
            : `请在上方${mode === "own" ? "「我的队伍」" : "「我的队伍」和「对手队伍」"}里选择队伍。`}
        />
      )}
      {!error && !loading && clusters.length === 0 && entries.length > 0 && !hasValidFacts && (
        <EmptyState
          variant="insufficient"
          title="需要重建教练事实"
          hint="当前资料库里的教练 facts 是旧口径，请重新导入或重建这些 demo 后再查看战术聚类。"
        />
      )}
      {hasSnapshot && clusters.length > 0 && (
        <PatternsTheme exportSource={exportSource} section={tab} explorerState={state.explorer} onExplorerStateChange={update => onStateChange(current => ({ ...current, explorer: typeof update === "function" ? update(current.explorer) : update }))} clusters={clusters} facts={facts} allFacts={allFacts}
          entryByMatchId={entryByMatchId} analysisContext={analysisContext} teamRenames={teamRenames}
          subjectTeam={subjectTeam} onOpenMatch={onOpenMatch} onWatchDemo={onWatchDemo} />
      )}

    </div>
  );
}
