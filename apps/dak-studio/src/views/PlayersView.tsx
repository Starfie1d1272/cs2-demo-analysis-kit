import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PlayerSeasonProfile } from "@cs2dak/contract";
import { SEASON_STAT_VIEWS } from "@cs2dak/presentation";
import { getSeasonData } from "../lib/season";
import { matchDateFromFileName, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { getPinnedPlayer, matchPinned, setPinnedPlayer, type PinnedPlayer } from "../lib/pin";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";

export interface PlayersViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  selectedPlayerKey: string | null;
  onSelectPlayer: (playerKey: string) => void;
  onOpenMatch: (entryId: string) => void;
  onGoLibrary: () => void;
}

const CORE_VIEW = SEASON_STAT_VIEWS.find((view) => view.key === "core")!;
const CORE_COLUMNS = CORE_VIEW.columns.filter((col) => col.key !== "maps");

function formatMetric(value: number | null, format: string): string {
  if (value == null) return "—";
  if (format === "integer") return String(Math.round(value));
  if (format === "adr") return value.toFixed(1);
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value.toFixed(2);
}

export function PlayersView({
  allEntries,
  entries,
  scope,
  onScopeChange,
  selectedPlayerKey,
  onSelectPlayer,
  onOpenMatch,
  onGoLibrary
}: PlayersViewProps) {
  const [profiles, setProfiles] = useState<PlayerSeasonProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<PinnedPlayer | null>(() => getPinnedPlayer());
  const [compareKey, setCompareKey] = useState<string | null>(null);

  useEffect(() => {
    if (entries.length === 0) {
      setProfiles(null);
      return;
    }
    let cancelled = false;
    setProfiles(null);
    setError(null);
    getSeasonData(entries)
      .then((data) => {
        if (!cancelled) {
          setProfiles([...data.profiles].sort((a, b) => b.rating.rivalhubRR - a.rating.rivalhubRR));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  // 关注选手置顶；其余按 RR 降序
  const orderedProfiles = useMemo(() => {
    if (!profiles) return null;
    const pinnedProfile = matchPinned(pinned, profiles);
    if (!pinnedProfile) return profiles;
    return [pinnedProfile, ...profiles.filter((p) => p.playerKey !== pinnedProfile.playerKey)];
  }, [profiles, pinned]);

  const selected = useMemo(() => {
    if (!orderedProfiles || orderedProfiles.length === 0) return null;
    return orderedProfiles.find((p) => p.playerKey === selectedPlayerKey) ?? orderedProfiles[0];
  }, [orderedProfiles, selectedPlayerKey]);

  const compare = useMemo(() => {
    if (!profiles || !compareKey || compareKey === selected?.playerKey) return null;
    return profiles.find((p) => p.playerKey === compareKey) ?? null;
  }, [profiles, compareKey, selected]);

  // matchId → 资料库条目，用于"该选手的比赛"跳转
  const entryByMatchId = useMemo(
    () => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])),
    [entries]
  );

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <div className="stu-empty">
          <div className="stu-empty-mark">⌖</div>
          <h2>还没有选手数据</h2>
          <p>选手档案由资料库内 demo 聚合而成，先导入几场比赛。</p>
          <button type="button" className="stu-button" onClick={onGoLibrary}>
            去资料库
          </button>
        </div>
      </div>
    );
  }

  const scopePanel = <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} />;

  if (error) {
    return (
      <div className="stu-view">
        {scopePanel}
        <div className="stu-empty">
          <h2>聚合失败</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="stu-view">
        {scopePanel}
        <div className="stu-empty">
          <h2>聚合范围为空</h2>
          <p>当前过滤条件没有命中任何 demo，请调整聚合范围。</p>
        </div>
      </div>
    );
  }
  if (!orderedProfiles || !selected) {
    return (
      <div className="stu-view">
        {scopePanel}
        <div className="stu-loading">聚合 {entries.length} 场 demo，构建选手档案…</div>
      </div>
    );
  }

  const isPinned = (p: PlayerSeasonProfile) => matchPinned(pinned, [p]) != null;
  const togglePin = (p: PlayerSeasonProfile) => {
    const next = isPinned(p) ? null : { playerKey: p.playerKey, steamIds: p.steamIds, name: p.name };
    setPinned(next);
    setPinnedPlayer(next);
  };

  const trendMax = Math.max(...selected.perMatch.map((m) => m.rivalhubRR), 0.01);
  const playerMatches = [...selected.perMatch].reverse();

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>选手档案</h1>
          <p>
            基于 {entries.length} 场 demo 的跨场画像 · 权重 {selected.weightsVersion}。强弱项相对当前聚合范围内的选手计算
            {orderedProfiles.length < 5 ? "（不足 5 人，暂不出强弱项判断）" : ""}。
          </p>
        </div>
      </header>

      {scopePanel}

      <div className="stu-split">
        <aside className="stu-roster">
          {orderedProfiles.map((profile) => (
            <button
              key={profile.playerKey}
              type="button"
              className={profile.playerKey === selected.playerKey ? "stu-roster-item stu-roster-item-active" : "stu-roster-item"}
              onClick={() => onSelectPlayer(profile.playerKey)}
            >
              <span className="stu-roster-name">
                {isPinned(profile) && <Star size={11} className="stu-pin-star" />}
                {profile.name}
              </span>
              <span className="stu-roster-meta">{profile.mapCount} maps</span>
              <b className="stu-roster-rr">{profile.rating.rivalhubRR.toFixed(2)}</b>
            </button>
          ))}
        </aside>

        <section className="stu-profile">
          <div className="stu-profile-head">
            <div>
              <h2>
                {selected.name}
                <button
                  type="button"
                  className={isPinned(selected) ? "stu-pin-button stu-pin-button-active" : "stu-pin-button"}
                  title={isPinned(selected) ? "取消关注" : "设为关注选手（这是我）"}
                  onClick={() => togglePin(selected)}
                >
                  <Star size={15} />
                </button>
              </h2>
              <small className="stu-dim">
                {selected.mapCount} 场 · 置信度 {(selected.confidence * 100).toFixed(0)}%
              </small>
            </div>
            <div className="stu-rating-cards">
              <div className="stu-rating-card stu-rating-card-primary">
                <span>RivalHub RR</span>
                <b>{selected.rating.rivalhubRR.toFixed(2)}</b>
              </div>
              <div className="stu-rating-card">
                <span>Rating 2.0</span>
                <b>{selected.rating.hltvRating.toFixed(2)}</b>
                <small>P{selected.rating.hltvPercentile.toFixed(0)}</small>
              </div>
              <label className="stu-compare-select">
                <span>对比选手</span>
                <select
                  className="stu-select"
                  value={compare?.playerKey ?? ""}
                  onChange={(e) => setCompareKey(e.target.value || null)}
                >
                  <option value="">无</option>
                  {orderedProfiles
                    .filter((p) => p.playerKey !== selected.playerKey)
                    .map((p) => (
                      <option key={p.playerKey} value={p.playerKey}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </div>

          {(selected.strengths.length > 0 || selected.weaknesses.length > 0) && (
            <div className="stu-traits">
              {selected.strengths.map((s) => (
                <span key={s} className="stu-tag stu-tag-ok">
                  强 · {s}
                </span>
              ))}
              {selected.weaknesses.map((w) => (
                <span key={w} className="stu-tag stu-tag-warn">
                  弱 · {w}
                </span>
              ))}
            </div>
          )}

          {compare && <CompareCard left={selected} right={compare} />}

          <div className="stu-profile-grid">
            <div className="stu-card">
              <h3>核心指标</h3>
              <div className="stu-metric-grid">
                {CORE_COLUMNS.map((col) => (
                  <div className="stu-metric" key={col.key} title={col.description ?? undefined}>
                    <span>{col.label}</span>
                    <b>{formatMetric(selected.metrics[col.key] ?? null, col.format)}</b>
                  </div>
                ))}
              </div>
            </div>

            <div className="stu-card">
              <h3>RR 六账户分解</h3>
              <div className="stu-bars">
                {selected.rating.breakdown.map((part) => (
                  <div className="stu-bar-row" key={part.key}>
                    <span>{part.label}</span>
                    <div className="stu-bar-track">
                      <div
                        className={part.value >= 0 ? "stu-bar stu-bar-pos" : "stu-bar stu-bar-neg"}
                        style={{ width: `${Math.min(100, Math.abs(part.value) * 100)}%` }}
                      />
                    </div>
                    <b>{part.value.toFixed(3)}</b>
                  </div>
                ))}
              </div>
            </div>

            <div className="stu-card">
              <h3>PRISM 风格八维</h3>
              {selected.style ? (
                <div className="stu-bars">
                  {selected.style.axes.map((axis) => (
                    <div className="stu-bar-row" key={axis.key}>
                      <span>{axis.label}</span>
                      <div className="stu-bar-track">
                        <div className="stu-bar stu-bar-style" style={{ width: `${axis.percentile}%` }} />
                      </div>
                      <b>P{axis.percentile.toFixed(0)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="stu-dim">该聚合范围无 PRISM 结果。</p>
              )}
            </div>

            <div className="stu-card">
              <h3>武器画像</h3>
              <table className="stu-mini-table">
                <thead>
                  <tr>
                    <th>武器</th>
                    <th className="stu-num">击杀</th>
                    <th className="stu-num">占比</th>
                    <th className="stu-num">HS%</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.weapons.slice(0, 6).map((weapon) => (
                    <tr key={weapon.weapon}>
                      <td>{weapon.label}</td>
                      <td className="stu-num">{weapon.kills}</td>
                      <td className="stu-num">{weapon.killSharePercent.toFixed(1)}%</td>
                      <td className="stu-num">{weapon.headshotPercent == null ? "—" : `${weapon.headshotPercent.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="stu-card stu-card-wide">
              <h3>每场 RR 走势</h3>
              <div className="stu-trend">
                {selected.perMatch.map((point) => (
                  <div className="stu-trend-col" key={point.matchId} title={`${point.matchId} · RR ${point.rivalhubRR.toFixed(2)}`}>
                    <div className="stu-trend-bar" style={{ height: `${(point.rivalhubRR / trendMax) * 100}%` }} />
                    <small>{point.rivalhubRR.toFixed(1)}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="stu-card stu-card-wide">
              <h3>该选手的比赛</h3>
              <div className="stu-player-matches">
                {playerMatches.map((point) => {
                  const entry = entryByMatchId.get(point.matchId);
                  const date = entry ? matchDateFromFileName(entry.fileName) : null;
                  return (
                    <button
                      key={point.matchId}
                      type="button"
                      className="stu-player-match"
                      disabled={!entry}
                      title={entry ? "打开比赛工作台" : "不在当前资料库"}
                      onClick={() => entry && onOpenMatch(entry.id)}
                    >
                      {entry ? (
                        <>
                          <span className="stu-map-badge">{entry.meta.mapName}</span>
                          <span className="stu-player-match-title">
                            {entry.meta.teamAName} {entry.meta.teamAScore}:{entry.meta.teamBScore} {entry.meta.teamBName}
                          </span>
                          {date && <small className="stu-dim">{date}</small>}
                        </>
                      ) : (
                        <span className="stu-player-match-title">{point.matchId}</span>
                      )}
                      <span className="stu-player-match-rr">
                        RR <b>{point.rivalhubRR.toFixed(2)}</b>
                      </span>
                      <span className="stu-player-match-rr">
                        2.0 <b>{point.hltvRating.toFixed(2)}</b>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** 双选手并排对比：核心指标 + 六账户 + PRISM。条形以两人较大值归一。 */
function CompareCard({ left, right }: { left: PlayerSeasonProfile; right: PlayerSeasonProfile }) {
  const rows: { label: string; a: number | null; b: number | null; format: string }[] = [
    ...CORE_COLUMNS.map((col) => ({
      label: col.label,
      a: left.metrics[col.key] ?? null,
      b: right.metrics[col.key] ?? null,
      format: col.format
    })),
    ...left.rating.breakdown.map((part) => ({
      label: part.label,
      a: part.value,
      b: right.rating.breakdown.find((x) => x.key === part.key)?.value ?? null,
      format: "rating"
    })),
    ...(left.style && right.style
      ? left.style.axes.map((axis) => ({
          label: axis.label,
          a: axis.percentile,
          b: right.style!.axes.find((x) => x.key === axis.key)?.percentile ?? null,
          format: "percent"
        }))
      : [])
  ];

  return (
    <div className="stu-card stu-compare-card">
      <h3>
        选手对比 · <em>{left.name}</em> vs <em>{right.name}</em>
      </h3>
      <div className="stu-compare-rows">
        {rows.map((row) => {
          const max = Math.max(Math.abs(row.a ?? 0), Math.abs(row.b ?? 0), 0.0001);
          return (
            <div className="stu-compare-row" key={row.label}>
              <b className={row.a != null && row.b != null && row.a > row.b ? "stu-compare-win" : ""}>
                {formatMetric(row.a, row.format)}
              </b>
              <div className="stu-compare-track stu-compare-track-left">
                <div className="stu-bar stu-bar-pos" style={{ width: `${(Math.abs(row.a ?? 0) / max) * 100}%` }} />
              </div>
              <span>{row.label}</span>
              <div className="stu-compare-track">
                <div className="stu-bar stu-bar-vs" style={{ width: `${(Math.abs(row.b ?? 0) / max) * 100}%` }} />
              </div>
              <b className={row.a != null && row.b != null && row.b > row.a ? "stu-compare-win" : ""}>
                {formatMetric(row.b, row.format)}
              </b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
