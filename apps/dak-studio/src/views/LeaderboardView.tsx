import { useEffect, useState } from "react";
import type { SeasonLeaderboardModel } from "@cs2dak/contract";
import { SeasonLeaderboard } from "@cs2dak/react";
import { getSeasonSummary, type IdentityOptions } from "../lib/season";
import type { StudioDemoEntry } from "../lib/library";
import type { CohortScopeState } from "../components/CohortScope";
import { EmptyState } from "@cs2dak/react";

export interface LeaderboardViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onPlayerClick: (playerKey: string) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
  embedded?: boolean;
}

export function LeaderboardView({ allEntries, entries, scope, onPlayerClick, onGoLibrary, identityOptions, embedded = false }: LeaderboardViewProps) {
  const [model, setModel] = useState<SeasonLeaderboardModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entries.length === 0) {
      setModel(null);
      return;
    }
    let cancelled = false;
    setModel(null);
    setError(null);
    getSeasonSummary(entries, identityOptions, scope.teams)
      .then((summary) => {
        if (!cancelled) setModel(summary.leaderboard);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries, identityOptions?.version, scope.teams]);  // eslint-disable-line react-hooks/exhaustive-deps

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
      {error ? (
        <EmptyState variant="error" title="聚合失败" hint={error} />
      ) : entries.length === 0 ? (
        <EmptyState variant="insufficient" title="聚合范围为空" hint="当前过滤条件没有命中任何 demo，请调整聚合范围。" />
      ) : !model ? (
        <div className="stu-loading">聚合 {entries.length} 场 demo，构建排行榜…</div>
      ) : (
        <div className="stu-embed">
          <SeasonLeaderboard model={model} onPlayerClick={onPlayerClick} />
        </div>
      )}
    </div>
  );
}
