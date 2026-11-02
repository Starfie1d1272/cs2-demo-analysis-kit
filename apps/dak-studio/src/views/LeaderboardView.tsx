import { CapabilityBar, useCapability } from "../components/CapabilityBar";
import type { CapabilityRepairAction } from "../lib/capability-availability";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../lib/queries/query-cache";
import type { AnalysisPageState } from "../lib/studio-page-state";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { SeasonLeaderboardModel } from "@cs2dak/presentation";
import { SeasonLeaderboard } from "@cs2dak/react";
import { getSeasonSummary } from "../lib/queries/season-queries";
import { displayTeamName, type IdentityOptions } from "../lib/identity";
import type { StudioDemoEntry } from "../lib/demo-entry";
import { EmptyState } from "@cs2dak/react";

export interface LeaderboardViewProps {
  activity: { importing: boolean; notice: string | null };
  onCapabilityRepair: (action: CapabilityRepairAction) => void;
  state: AnalysisPageState;
  onStateChange: (state: AnalysisPageState) => void;
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  selectedTeam?: string | null;
  onPlayerClick: (playerKey: string) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
  embedded?: boolean;
}

export function LeaderboardView({ activity, onCapabilityRepair, state, onStateChange, allEntries, entries, selectedTeam = null, onPlayerClick, onGoLibrary, identityOptions, embedded = false }: LeaderboardViewProps) {
  const updateFailed = !activity.importing && !!activity.notice && /重建|导入|重新导出/.test(activity.notice) && /失败/.test(activity.notice);
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const teamEntries = useMemo(() => selectedTeam ? entries.filter(entry => [entry.meta.teamAName, entry.meta.teamBName].some(name => displayTeamName(name, identityOptions?.teamRenames) === selectedTeam)) : entries, [entries, selectedTeam, identityOptions?.teamRenames]);
  const capability = useCapability(teamEntries, "season");
  const eligible = capability.eligible;
  const requestKey = JSON.stringify([entries.map(entry => entry.id), selectedTeam, identityOptions?.version]);
  const [snapshot, setSnapshot] = useState<{ key: string; generation: number; sample: string; value: SeasonLeaderboardModel } | null>(null);
  const model = snapshot?.key === requestKey ? snapshot.value : null;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!eligible?.length || analysis.status !== "ready") return;
    let cancelled = false;
    setError(null);
    getSeasonSummary(eligible, identityOptions, selectedTeam ? [selectedTeam] : [])
      .then(summary => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setSnapshot({ key: requestKey, generation: analysis.generation, sample: JSON.stringify(eligible.map(entry => entry.id)), value: summary.leaderboard }); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [eligible, identityOptions?.version, selectedTeam, requestKey, analysis]);

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有排行数据"
          hint="排行榜由资料库内 demo 聚合而成，先导入几场比赛。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  return (
    <div className={embedded ? "stu-card" : "stu-view"}>
      <header className={embedded ? "stu-section-head" : "stu-view-header"}>
        <div>
          {embedded ? <h3>排行榜</h3> : <h1>排行榜</h1>}
          <p>
            {model ? `${model.matchCount} 场 · 权重 ${model.weightsVersion} · ` : ""}
            点击选手跳转个人档案。
          </p>
        </div>
      </header>
      {capability.availability && <CapabilityBar availability={capability.availability} onRepair={onCapabilityRepair} />}
      {capability.error && <p role="alert">排行能力读取失败：{capability.error} <button type="button" className="stu-button-sm" onClick={capability.retry}>重试</button></p>}
      {model && (error || capability.error || activity.importing || updateFailed || analysis.status !== "ready" || snapshot?.generation !== analysis.generation || snapshot.sample !== JSON.stringify(eligible?.map(entry => entry.id))) && <p role="status">{error || capability.error || updateFailed || analysis.status === "error" ? "更新失败，显示旧版本结果。" : "正在更新，显示旧版本结果。"}</p>}
      {error && !model ? (
        <EmptyState variant="error" title="聚合失败" hint={error} />
      ) : capability.error && !model ? null : entries.length === 0 || (eligible?.length === 0 && !model) ? (
        <EmptyState variant="insufficient" title="聚合范围为空" hint="当前过滤条件没有命中任何 demo，请调整聚合范围。" />
      ) : !model ? (
        <div className="stu-loading">聚合 {entries.length} 场 demo，构建排行榜…</div>
      ) : (
        <div className="stu-embed">
          <SeasonLeaderboard model={model} onPlayerClick={onPlayerClick} viewKey={state.leaderboardView} onViewKeyChange={leaderboardView => onStateChange({ ...state, leaderboardView, tables: { ...state.tables, leaderboard: { sort: { key: model.views.find(view => view.key === leaderboardView)?.defaultSort ?? model.views[0].defaultSort, direction: "desc" }, page: 0 } } })} tableState={state.tables.leaderboard ?? { sort: { key: model.views.find(view => view.key === state.leaderboardView)?.defaultSort ?? model.views[0].defaultSort, direction: "desc" }, page: 0 }} onTableStateChange={table => onStateChange({ ...state, tables: { ...state.tables, leaderboard: table } })} />
        </div>
      )}
    </div>
  );
}
