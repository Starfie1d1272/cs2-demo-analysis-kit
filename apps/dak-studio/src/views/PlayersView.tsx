import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PlayerSeasonProfile } from "@cs2dak/contract";
import {
  SEASON_STAT_VIEWS,
  type PlayerSeasonInsights,
  type PlayerWeaponStat
} from "@cs2dak/presentation";
import { getPlayerSeasonDetails, getSeasonSummary, type IdentityOptions } from "../lib/season";
import { formatMatchLabel, matchDateFromFileName, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { getPinnedPlayer, matchPinned, setPinnedPlayer, type PinnedPlayer } from "../lib/pin";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";

export interface PlayersViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  selectedPlayerKey: string | null;
  onSelectPlayer: (playerKey: string) => void;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
  teamRenames?: Record<string, string>;
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
  onGoLibrary,
  identityOptions,
  teamRenames = {}
}: PlayersViewProps) {
  const [profiles, setProfiles] = useState<PlayerSeasonProfile[] | null>(null);
  const [insights, setInsights] = useState<PlayerSeasonInsights | null>(null);
  const [weaponStats, setWeaponStats] = useState<PlayerWeaponStat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
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
    getSeasonSummary(entries, identityOptions)
      .then((summary) => {
        if (!cancelled) {
          setProfiles([...summary.profiles].sort((a, b) => b.rating.rivalhubRR - a.rating.rivalhubRR));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries, identityOptions?.version]);  // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (!selected || entries.length === 0) {
      setInsights(null);
      setWeaponStats([]);
      setDetailsError(null);
      return;
    }
    let cancelled = false;
    setInsights(null);
    setWeaponStats([]);
    setDetailsError(null);
    getPlayerSeasonDetails(entries, selected.steamIds)
      .then((details) => {
        if (cancelled) return;
        setInsights(details.insights);
        setWeaponStats(details.weaponStats.slice(0, 8));
      })
      .catch((err) => {
        if (!cancelled) setDetailsError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries, selected?.playerKey]);  // eslint-disable-line react-hooks/exhaustive-deps

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

  const scopePanel = <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} teamRenames={teamRenames} />;

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

  const exportPlayerCard = () => {
    const md = buildPlayerCardMarkdown(selected, insights);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.name}-选手图卡.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
              <button type="button" className="stu-button stu-button-ghost" onClick={exportPlayerCard}>
                导出选手图卡 (Markdown)
              </button>
            </div>
            <div className="stu-rating-cards">
              <div className="stu-rating-card stu-rating-card-primary" title="Rival Rating（RivalHub 绝对刻度评分）">
                <span>RR</span>
                <b>{selected.rating.rivalhubRR.toFixed(2)}</b>
              </div>
              <div className="stu-rating-card" title="HLTV Rating 2.0 量纲">
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
                {(() => {
                  // 账户值是贡献量（非百分位），条形按六账户最大绝对值归一化
                  const maxAbs = Math.max(...selected.rating.breakdown.map((p) => Math.abs(p.value)), 0.0001);
                  return selected.rating.breakdown.map((part) => (
                    <div className="stu-bar-row" key={part.key}>
                      <span>{part.label}</span>
                      <div className="stu-bar-track">
                        <div
                          className={part.value >= 0 ? "stu-bar stu-bar-pos" : "stu-bar stu-bar-neg"}
                          style={{ width: `${(Math.abs(part.value) / maxAbs) * 100}%` }}
                        />
                      </div>
                      <b>{(part.value >= 0 ? "+" : "") + part.value.toFixed(3)}</b>
                    </div>
                  ));
                })()}
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
              <WeaponBars weapons={weaponStats.length > 0 ? weaponStats : selected.weapons.slice(0, 8).map((weapon) => ({
                weapon: weapon.weapon,
                label: weapon.label,
                kills: weapon.kills,
                headshotPercent: weapon.headshotPercent,
                killsPerMatch: 0
              }))} />
            </div>

            {selected.style && (
              <div className="stu-card">
                <h3>Playstyle Fingerprint</h3>
                <FingerprintRadar axes={selected.style.axes} />
              </div>
            )}

            {detailsError && (
              <div className="stu-card">
                <h3>逐场洞察</h3>
                <p className="stu-dim">加载失败：{detailsError}</p>
              </div>
            )}

            {insights && (
              <div className="stu-card">
                <h3>Flash Value</h3>
                <div className="stu-metric-grid">
                  <div className="stu-metric"><span>投掷闪光</span><b>{insights.flash.flashesThrown}</b></div>
                  <div className="stu-metric" title="所有回合敌方致盲秒数累计（总量，不是单颗效果）">
                    <span>致盲敌方·总</span><b>{insights.flash.enemyBlindSeconds.toFixed(1)}s</b>
                  </div>
                  <div className="stu-metric" title="被该选手闪到的敌人数累计（人次）">
                    <span>致盲人次</span><b>{insights.flash.enemyBlindVictims}</b>
                  </div>
                  <div className="stu-metric" title="敌方致盲秒数 / 投掷数">
                    <span>均致盲/颗</span>
                    <b>{insights.flash.enemySecondsPerFlash == null ? "—" : `${insights.flash.enemySecondsPerFlash.toFixed(2)}s`}</b>
                  </div>
                  <div className="stu-metric" title="所有回合队友致盲秒数累计"><span>致盲队友·总</span><b>{insights.flash.teamBlindSeconds.toFixed(1)}s</b></div>
                  <div className="stu-metric" title="（敌方 - 友方）致盲秒数 / 投掷数">
                    <span>净价值/颗</span>
                    <b>{insights.flash.netSecondsPerFlash == null ? "—" : `${insights.flash.netSecondsPerFlash.toFixed(2)}s`}</b>
                  </div>
                  <div className="stu-metric"><span>闪光助攻</span><b>{insights.flash.flashAssists}</b></div>
                </div>
                {insights.flash.worstTeamFlashes.length > 0 && (
                  <>
                    <h4 className="stu-subhead">最严重队闪</h4>
                    <div className="stu-evidence-list">
                      {insights.flash.worstTeamFlashes.slice(0, 5).map((incident, i) => (
                        <button
                          key={`${incident.matchId}-${incident.roundNumber}-${i}`}
                          type="button"
                          className="stu-evidence"
                          disabled={!entryByMatchId.get(incident.matchId)}
                          onClick={() => { const e = entryByMatchId.get(incident.matchId); if (e) onOpenMatch(e.id, { roundNumber: incident.roundNumber, tick: incident.tick }); }}
                          title="打开该场比赛复盘"
                        >
                          {formatMatchLabel(entryByMatchId.get(incident.matchId)!)} · R{incident.roundNumber} · 闪到 {incident.victimCount} 名队友 {incident.totalSeconds.toFixed(1)}s
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {insights && (
              <div className="stu-card">
                <h3>Mistake Review</h3>
                <div className="stu-metric-grid">
                  <div className="stu-metric" title="我方 full 局该选手首死——最值得复盘的失误信号">
                    <span>长枪局首死</span>
                    <b>{insights.mistakes.fullBuyFirstDeaths.count}/{insights.mistakes.fullBuyFirstDeaths.attempts} 局</b>
                  </div>
                  <div className="stu-metric" title="对手 eco/semi 局该选手首死（优势局被换掉）">
                    <span>Anti-eco 首死</span>
                    <b>{insights.mistakes.antiEcoFirstDeaths.count}/{insights.mistakes.antiEcoFirstDeaths.attempts} 局</b>
                  </div>
                  <div className="stu-metric" title="eco/半起/强起局中该选手首死（劣势经济，参考为主）">
                    <span>劣势经济首死</span>
                    <b>{insights.mistakes.lowBuyFirstDeaths.count}/{insights.mistakes.lowBuyFirstDeaths.attempts} 局</b>
                  </div>
                  <div className="stu-metric"><span>残局失利</span><b>{insights.mistakes.clutchLosses.count}</b></div>
                  <div className="stu-metric" title="开局 20 秒内 / 中段 / 50 秒后">
                    <span>死亡分布</span>
                    <b>
                      {insights.mistakes.deathTiming.total > 0
                        ? `${insights.mistakes.deathTiming.early}早/${insights.mistakes.deathTiming.mid}中/${insights.mistakes.deathTiming.late}晚`
                        : "—"}
                    </b>
                  </div>
                </div>
                {[...insights.mistakes.fullBuyFirstDeaths.evidence, ...insights.mistakes.antiEcoFirstDeaths.evidence, ...insights.mistakes.clutchLosses.evidence].length > 0 && (
                  <div className="stu-evidence-list">
                    {[...insights.mistakes.fullBuyFirstDeaths.evidence.slice(0, 3), ...insights.mistakes.antiEcoFirstDeaths.evidence.slice(0, 3), ...insights.mistakes.clutchLosses.evidence.slice(0, 3)].map((evidence, i) => (
                      <button
                        key={`${evidence.matchId}-${evidence.roundNumber}-${i}`}
                        type="button"
                        className="stu-evidence"
                        disabled={!entryByMatchId.get(evidence.matchId)}
                        onClick={() => { const e = entryByMatchId.get(evidence.matchId); if (e) onOpenMatch(e.id, { roundNumber: evidence.roundNumber, tick: evidence.tick }); }}
                        title="打开该场比赛复盘"
                      >
                        {formatMatchLabel(entryByMatchId.get(evidence.matchId)!)} · R{evidence.roundNumber} · {evidence.detail}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {insights && insights.trend.length > 1 && (
              <div className="stu-card stu-card-wide">
                <h3>个人趋势</h3>
                <TrendChart trend={insights.trend} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} />
              </div>
            )}

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

/** PRISM 八维风格雷达（SVG 八边形）。 */
function FingerprintRadar({ axes }: { axes: { key: string; label: string; percentile: number }[] }) {
  const size = 220;
  const center = size / 2;
  const radius = size / 2 - 34;
  const point = (index: number, fraction: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    return [center + Math.cos(angle) * radius * fraction, center + Math.sin(angle) * radius * fraction] as const;
  };
  const ringPath = (fraction: number) =>
    axes.map((_, i) => point(i, fraction).join(",")).join(" ");
  const valuePath = axes.map((axis, i) => point(i, Math.max(0.04, axis.percentile / 100)).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="stu-radar" role="img" aria-label="风格雷达">
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <polygon key={fraction} className="stu-radar-ring" points={ringPath(fraction)} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, 1);
        return <line key={i} className="stu-radar-spoke" x1={center} y1={center} x2={x} y2={y} />;
      })}
      <polygon className="stu-radar-value" points={valuePath} />
      {axes.map((axis, i) => {
        const [x, y] = point(i, 1.16);
        return (
          <text key={axis.key} className="stu-radar-label" x={x} y={y} textAnchor="middle" dominantBaseline="middle">
            {axis.label} P{axis.percentile.toFixed(0)}
          </text>
        );
      })}
    </svg>
  );
}

const TREND_METRICS = [
  { key: "adr", label: "ADR", format: (v: number) => v.toFixed(1) },
  { key: "kast", label: "KAST%", format: (v: number) => v.toFixed(1) },
  { key: "fkMinusFd", label: "首杀差(FK-FD)", format: (v: number) => v.toFixed(0) },
  { key: "utilityDamagePerRound", label: "Util/R", format: (v: number) => v.toFixed(2) }
] as const;
type TrendMetricKey = (typeof TREND_METRICS)[number]["key"];

function WeaponBars({ weapons }: { weapons: PlayerWeaponStat[] }) {
  const max = Math.max(...weapons.map((weapon) => weapon.kills), 1);
  if (weapons.length === 0) {
    return <p className="stu-dim">该聚合范围没有武器击杀数据。</p>;
  }
  return (
    <div className="stu-bars">
      {weapons.map((weapon) => (
        <div className="stu-bar-row" key={weapon.weapon}>
          <span>{weapon.label}</span>
          <div className="stu-bar-track">
            <div className="stu-bar stu-bar-style" style={{ width: `${(weapon.kills / max) * 100}%` }} />
          </div>
          <b title={weapon.headshotPercent == null ? undefined : `HS ${weapon.headshotPercent.toFixed(1)}%`}>
            {weapon.kills}
          </b>
        </div>
      ))}
    </div>
  );
}

/** 个人趋势柱状图，指标可切换；点击柱进入对应比赛。 */
function TrendChart({
  trend,
  entryByMatchId,
  onOpenMatch
}: {
  trend: PlayerSeasonInsights["trend"];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string) => void;
}) {
  const [metric, setMetric] = useState<TrendMetricKey>("adr");
  const spec = TREND_METRICS.find((m) => m.key === metric)!;
  const values = trend.map((point) => point[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - Math.min(min, 0), 0.0001);
  const baseline = Math.min(min, 0);

  return (
    <div>
      <div className="stu-trend-tabs" role="radiogroup" aria-label="趋势指标">
        {TREND_METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={metric === m.key}
            className={metric === m.key ? "stu-subtab stu-subtab-active" : "stu-subtab"}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="stu-trend-bars" role="list" aria-label={`${spec.label} 趋势`}>
        {trend.map((point) => {
          const entry = entryByMatchId.get(point.matchId);
          const value = point[metric];
          const height = Math.max(6, ((value - baseline) / span) * 100);
          const title = entry
            ? `${formatMatchLabel(entry)} · ${spec.label} ${spec.format(value)}`
            : `${point.matchId} · ${spec.label} ${spec.format(value)}`;
          return (
            <button
              key={point.matchId}
              type="button"
              className="stu-trend-col"
              disabled={!entry}
              title={title}
              onClick={() => entry && onOpenMatch(entry.id)}
            >
              <span className="stu-trend-bar" style={{ height: `${height}%` }} />
              <small>{spec.format(value)}</small>
            </button>
          );
        })}
      </div>
      <div className="stu-trend-range stu-dim">
        <small>{spec.label}：{spec.format(min)} – {spec.format(max)} · {trend.length} 场</small>
      </div>
    </div>
  );
}

/** 选手图卡 Markdown（主办方发布用）。 */
function buildPlayerCardMarkdown(profile: PlayerSeasonProfile, insights: PlayerSeasonInsights | null): string {
  const lines: string[] = [];
  lines.push(`# ${profile.name} · 选手图卡`);
  lines.push("");
  lines.push(`${profile.mapCount} 场 · RivalHub RR **${profile.rating.rivalhubRR.toFixed(2)}** · Rating 2.0 **${profile.rating.hltvRating.toFixed(2)}**（P${profile.rating.hltvPercentile.toFixed(0)}）`);
  lines.push("");
  if (profile.strengths.length > 0) lines.push(`**强项**：${profile.strengths.join("、")}`);
  if (profile.weaknesses.length > 0) lines.push(`**弱项**：${profile.weaknesses.join("、")}`);
  lines.push("");
  lines.push("| 指标 | 数值 |");
  lines.push("|---|---|");
  for (const column of CORE_COLUMNS) {
    lines.push(`| ${column.label} | ${formatMetric(profile.metrics[column.key] ?? null, column.format)} |`);
  }
  if (profile.style) {
    lines.push("");
    lines.push("**PRISM 风格**：" + profile.style.axes.map((axis) => `${axis.label} P${axis.percentile.toFixed(0)}`).join(" · "));
  }
  if (insights) {
    lines.push("");
    lines.push(`**Flash Value**：投 ${insights.flash.flashesThrown} 颗，致盲敌方 ${insights.flash.enemyBlindSeconds.toFixed(1)}s / 队友 ${insights.flash.teamBlindSeconds.toFixed(1)}s` +
      (insights.flash.netSecondsPerFlash != null ? `，净价值 ${insights.flash.netSecondsPerFlash.toFixed(2)}s/颗` : ""));
  }
  lines.push("");
  lines.push("---\n由 DAK Studio 生成");
  return lines.join("\n");
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
