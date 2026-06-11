import { useEffect, useState } from "react";
import type { SeasonLeaderboardModel } from "@cs2dak/contract";
import { SeasonLeaderboard } from "@cs2dak/react";
import { getSeasonSummary } from "../lib/season";
import type { StudioDemoEntry } from "../lib/library";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";

export interface LeaderboardViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  onPlayerClick: (playerKey: string) => void;
  onGoLibrary: () => void;
}

export function LeaderboardView({ allEntries, entries, scope, onScopeChange, onPlayerClick, onGoLibrary }: LeaderboardViewProps) {
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
    getSeasonSummary(entries)
      .then((summary) => {
        if (!cancelled) setModel(summary.leaderboard);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <div className="stu-empty">
          <div className="stu-empty-mark">⌖</div>
          <h2>还没有排行数据</h2>
          <p>排行榜由资料库内 demo 聚合而成，先导入几场比赛。</p>
          <button type="button" className="stu-button" onClick={onGoLibrary}>
            去资料库
          </button>
        </div>
      </div>
    );
  }

  const scopePanel = <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} />;

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>排行榜</h1>
          <p>
            {model ? `${model.matchCount} 场 · 权重 ${model.weightsVersion} · ` : ""}
            点击选手跳转个人档案。
          </p>
        </div>
      </header>
      {scopePanel}
      {error ? (
        <div className="stu-empty">
          <h2>聚合失败</h2>
          <p>{error}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="stu-empty">
          <h2>聚合范围为空</h2>
          <p>当前过滤条件没有命中任何 demo，请调整聚合范围。</p>
        </div>
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
