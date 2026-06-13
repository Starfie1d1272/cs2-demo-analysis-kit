import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PlayerSeasonProfile } from "@cs2dak/contract";
import type { PlayerSeasonInsights } from "@cs2dak/presentation";
import { getPlayerSeasonDetails, getSeasonSummary, type IdentityOptions } from "../lib/season";
import { formatMatchLabel, matchDateFromFileName, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { getPinnedPlayer, matchPinned, type PinnedPlayer } from "../lib/pin";
import { EmptyState, EvidenceLink, MetricInfo } from "../components/primitives";

export interface HomeViewProps {
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoPlayers: () => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
}

/** 我的主页：模块 3/5/6 既有 view model 的编排视图，零新信号（docs/design/studio-redesign.md §9）。 */
export function HomeView({ entries, onOpenMatch, onGoPlayers, onGoLibrary, identityOptions }: HomeViewProps) {
  const [profiles, setProfiles] = useState<PlayerSeasonProfile[] | null>(null);
  const [insights, setInsights] = useState<PlayerSeasonInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<PinnedPlayer | null>(null);
  const [pinnedLoaded, setPinnedLoaded] = useState(false);
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);

  useEffect(() => {
    let cancelled = false;
    getPinnedPlayer().then((p) => {
      if (!cancelled) { setPinned(p); setPinnedLoaded(true); }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (entries.length === 0) return;
    let cancelled = false;
    setError(null);
    getSeasonSummary(entries, identityOptions)
      .then((summary) => {
        if (!cancelled) setProfiles(summary.profiles);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries, identityOptions?.version]);  // eslint-disable-line react-hooks/exhaustive-deps

  const me = useMemo(() => matchPinned(pinned, profiles ?? []), [pinned, profiles]);

  useEffect(() => {
    if (!me || entries.length === 0) {
      setInsights(null);
      return;
    }
    let cancelled = false;
    getPlayerSeasonDetails(entries, me.steamIds, identityOptions)
      .then((details) => {
        if (!cancelled) setInsights(details.insights);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries, me?.playerKey, identityOptions?.version]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (entries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="欢迎来到 DAK Studio"
          hint="先导入 .dem 或 v3 ZIP，主页会汇总你的近期状态与该练什么。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  if (pinnedLoaded && !pinned) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有标记「这是我」"
          hint={<>在「个人实验室」打开你的档案，点名字旁的 <Star size={12} style={{ verticalAlign: "-2px" }} /> 标记自己，主页就会围绕你的数据展开。</>}
          action={<button type="button" className="stu-button" onClick={onGoPlayers}>去个人实验室</button>}
        />
      </div>
    );
  }

  // 我参与的比赛（按文件名日期降序，无日期回退导入时间序）
  const myMatches = me
    ? entries
        .filter((entry) => (insights?.trend ?? []).some((point) => point.matchId === matchIdForEntry(entry)))
        .sort((a, b) => (matchDateFromFileName(b.fileName) ?? "").localeCompare(matchDateFromFileName(a.fileName) ?? ""))
    : [];
  const latestMatch = myMatches[0] ?? null;

  const practiceItems = insights ? buildPracticeItems(insights) : [];

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>我的主页</h1>
          <p>最近打得怎么样、该练什么。数据来自资料库全部 {entries.length} 场 demo。</p>
        </div>
      </header>

      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && !profiles && <div className="stu-loading">聚合 {entries.length} 场 demo…</div>}

      {profiles && !me && pinned && (
        <EmptyState
          variant="insufficient"
          title={`当前资料库里没有 ${pinned.name} 的比赛`}
          hint="导入包含你参赛记录的 demo，或在个人实验室重新标记「这是我」。"
          action={<button type="button" className="stu-button" onClick={onGoPlayers}>去个人实验室</button>}
        />
      )}

      {me && (
        <>
          <div className="stu-home-head stu-card">
            <div>
              <h2><Star size={15} className="stu-pin-star" /> {me.name}</h2>
              <small className="stu-dim">{me.mapCount} 场 · 置信度 {(me.confidence * 100).toFixed(0)}%</small>
            </div>
            <div className="stu-rating-cards">
              <div className="stu-rating-card stu-rating-card-primary">
                <span>RR<MetricInfo note="Rival Rating（RivalHub 绝对刻度评分）" /></span>
                <b>{me.rating.rivalhubRR.toFixed(2)}</b>
              </div>
              <div className="stu-rating-card">
                <span>Rating 2.0<MetricInfo note="HLTV Rating 2.0 量纲" /></span>
                <b>{me.rating.hltvRating.toFixed(2)}</b>
              </div>
            </div>
            {latestMatch && (
              <button type="button" className="stu-button" onClick={() => onOpenMatch(latestMatch.id)}>
                打开最近一场 · {formatMatchLabel(latestMatch)}
              </button>
            )}
          </div>

          {insights && insights.trend.length > 1 && (
            <div className="stu-card">
              <h3>趋势速览</h3>
              <div className="stu-home-trends">
                <Sparkline label="RR" values={me.perMatch.map((m) => m.rivalhubRR)} format={(v) => v.toFixed(2)} />
                <Sparkline label="ADR" values={insights.trend.map((t) => t.adr)} format={(v) => v.toFixed(0)} />
                <Sparkline label="KAST" values={insights.trend.map((t) => t.kast)} format={(v) => `${v.toFixed(0)}%`} />
              </div>
            </div>
          )}

          <div className="stu-card">
            <h3>本周该练什么</h3>
            {me.weaknesses.length > 0 && (
              <div className="stu-traits">
                {me.weaknesses.slice(0, 2).map((w) => (
                  <span key={w} className="stu-tag stu-tag-warn">弱 · {w}</span>
                ))}
              </div>
            )}
            {practiceItems.length === 0 && me.weaknesses.length === 0 ? (
              <p className="stu-muted">当前范围没有可复盘的失误证据——保持状态。</p>
            ) : (
              <div className="stu-evidence-list">
                {practiceItems.map((item, i) => (
                  <EvidenceLink
                    key={`${item.matchId}-${item.roundNumber}-${i}`}
                    disabled={!entryByMatchId.get(item.matchId)}
                    onOpen={() => {
                      const entry = entryByMatchId.get(item.matchId);
                      if (entry) onOpenMatch(entry.id, { roundNumber: item.roundNumber, tick: item.tick });
                    }}
                  >
                    {item.label} · {entryByMatchId.has(item.matchId) ? formatMatchLabel(entryByMatchId.get(item.matchId)!) : item.matchId} · R{item.roundNumber} · {item.detail}
                  </EvidenceLink>
                ))}
              </div>
            )}
          </div>

          {myMatches.length > 0 && (
            <div className="stu-card">
              <h3>最近比赛</h3>
              <div className="stu-home-matches">
                {myMatches.slice(0, 8).map((entry) => (
                  <button key={entry.id} type="button" className="stu-home-match" onClick={() => onOpenMatch(entry.id)}>
                    <span>{formatMatchLabel(entry)}</span>
                    <small className="stu-dim">{matchDateFromFileName(entry.fileName) ?? "—"} · {entry.meta.mapName}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Mistake Review Top3：长枪局首死 > anti-eco 首死 > 残局失利，各取最近一条证据。 */
function buildPracticeItems(insights: PlayerSeasonInsights) {
  const pick = (label: string, evidence: { matchId: string; roundNumber: number; tick?: number; detail: string }[]) =>
    evidence.slice(0, 1).map((e) => ({ label, ...e }));
  return [
    ...pick("长枪局首死", insights.mistakes.fullBuyFirstDeaths.evidence),
    ...pick("Anti-eco 首死", insights.mistakes.antiEcoFirstDeaths.evidence),
    ...pick("残局失利", insights.mistakes.clutchLosses.evidence)
  ].slice(0, 3);
}

function Sparkline({ label, values, format }: { label: string; values: number[]; format: (v: number) => string }) {
  const recent = values.slice(-12);
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const span = max - min || 1;
  const width = 120;
  const height = 28;
  const step = recent.length > 1 ? width / (recent.length - 1) : width;
  const points = recent
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");
  const latest = recent[recent.length - 1];
  return (
    <div className="stu-home-spark">
      <span>{label}</span>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-label={`${label} 趋势`}>
        <polyline points={points} fill="none" className="stu-home-spark-line" />
      </svg>
      <b>{format(latest)}</b>
    </div>
  );
}
