import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PlayerSeasonProfile } from "@cs2dak/contract";
import {
  SEASON_STAT_VIEWS,
  mechanicsMetricsForWeapon,
  type MechanicsMetricKey,
  type PlayerMechanicsProfile,
  type PlayerSeasonInsights,
  type PlayerWeaponStat
} from "@cs2dak/presentation";
import { getPlayerSeasonDetails, getSeasonSummary, type IdentityOptions } from "../lib/season";
import { entryDate, formatMatchLabel, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { getPinnedPlayer, matchPinned, setPinnedPlayer, type PinnedPlayer } from "../lib/pin";
import type { CohortScopeState } from "../components/CohortScope";
import { FingerprintRadar, TrendChart } from "./profile-widgets";
import { EmptyState, MetricInfo } from "@cs2dak/react";
import { EvidenceActions } from "../components/EvidenceActions";
import type { OpenEvidence } from "../lib/evidence-continuation";

export interface PlayersViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  selectedPlayerKey: string | null;
  onSelectPlayer: (playerKey: string, label?: string) => void;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onOpenEvidence: OpenEvidence;
  returnEvidenceKey?: string;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
}

const CORE_VIEW = SEASON_STAT_VIEWS.find((view) => view.key === "core")!;
const CORE_COLUMNS = CORE_VIEW.columns.filter((col) => col.key !== "maps");

const PROFILE_TABS = [
  { key: "overview", label: "总览" },
  { key: "aim", label: "枪法 / 机制" },
  { key: "utility", label: "道具 / 失误" },
  { key: "trend", label: "趋势 / 比赛" }
] as const;
type ProfileTab = (typeof PROFILE_TABS)[number]["key"];

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
  selectedPlayerKey,
  onSelectPlayer,
  onOpenMatch,
  onOpenEvidence,
  returnEvidenceKey,
  onWatchDemo,
  onGoLibrary,
  identityOptions
}: PlayersViewProps) {
  const [profiles, setProfiles] = useState<PlayerSeasonProfile[] | null>(null);
  const [insights, setInsights] = useState<PlayerSeasonInsights | null>(null);
  const [weaponStats, setWeaponStats] = useState<PlayerWeaponStat[]>([]);
  const [mechanics, setMechanics] = useState<PlayerMechanicsProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<PinnedPlayer | null>(null);
  const [compareKey, setCompareKey] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>(() => returnEvidenceKey ? "utility" : "overview");
  const [flashMode, setFlashMode] = useState<"net" | "enemy">("net");

  useEffect(() => {
    let cancelled = false;
    getPinnedPlayer().then((p) => { if (!cancelled) setPinned(p); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (entries.length === 0) {
      setProfiles(null);
      return;
    }
    let cancelled = false;
    setProfiles(null);
    setError(null);
    getSeasonSummary(entries, identityOptions, scope.teams)
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
  }, [entries, identityOptions?.version, scope.teams]);  // eslint-disable-line react-hooks/exhaustive-deps

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
      setMechanics(null);
      setDetailsError(null);
      return;
    }
    let cancelled = false;
    setInsights(null);
    setWeaponStats([]);
    setMechanics(null);
    setDetailsError(null);
    getPlayerSeasonDetails(entries, selected.steamIds, identityOptions, scope.teams)
      .then((details) => {
        if (cancelled) return;
        setInsights(details.insights);
        setWeaponStats(details.weaponStats.slice(0, 8));
        setMechanics(details.mechanics);
      })
      .catch((err) => {
        if (!cancelled) setDetailsError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries, selected?.playerKey, identityOptions?.version, scope.teams]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有选手数据"
          hint="选手档案由资料库内 demo 聚合而成，先导入几场比赛。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="stu-view">
        <EmptyState variant="error" title="聚合失败" hint={error} />
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState variant="insufficient" title="聚合范围为空" hint="当前过滤条件没有命中任何 demo，请调整聚合范围。" />
      </div>
    );
  }
  if (!orderedProfiles || !selected) {
    return (
      <div className="stu-view">
        <div className="stu-loading">聚合 {entries.length} 场 demo，构建选手档案…</div>
      </div>
    );
  }

  const isPinned = (p: PlayerSeasonProfile) => matchPinned(pinned, [p]) != null;
  const togglePin = (p: PlayerSeasonProfile) => {
    const next = isPinned(p) ? null : { playerKey: p.playerKey, steamIds: p.steamIds, name: p.name };
    setPinned(next);
    void setPinnedPlayer(next);
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

      <div className="stu-split">
        <aside className="stu-roster">
          {orderedProfiles.map((profile) => (
            <button
              key={profile.playerKey}
              type="button"
              className={profile.playerKey === selected.playerKey ? "stu-roster-item stu-roster-item-active" : "stu-roster-item"}
              onClick={() => onSelectPlayer(profile.playerKey, profile.name)}
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

          <div className="stu-subtabs" role="tablist" aria-label="档案分区">
            {PROFILE_TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={profileTab === key}
                className={profileTab === key ? "stu-subtab stu-subtab-active" : "stu-subtab"}
                onClick={() => setProfileTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {profileTab === "overview" && (
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
              <div className="stu-section-head">
                <h3>PRISM 八维打法画像</h3>
                <MetricInfo note="行为倾向与执行效率分别按当前分析范围内的选手排名；不是职业数据库排名，也不代表固定角色或绝对能力。" />
              </div>
              {selected.style ? (
                <div className="stu-prism-axis-list">
                  {selected.style.axes.map((axis) => (
                    <div className={`stu-prism-axis stu-prism-axis-${axis.status}`} key={axis.key}>
                      <span className="stu-prism-axis-name">{axis.label}</span>
                      {axis.status === "ready" ? (
                        <>
                          <span className="stu-prism-axis-value"><small>行为</small><b>P{axis.involvementPercentile!.toFixed(0)}</b></span>
                          <span className="stu-prism-axis-value"><small>效率</small><b>P{axis.efficiencyPercentile!.toFixed(0)}</b></span>
                        </>
                      ) : (
                        <span className="stu-prism-axis-status">
                          {axis.status === "partial" ? "部分信号" : "不可用"} · 覆盖 {(axis.signalCoverage * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  ))}
                  <p className="stu-dim stu-prism-note">P 值均为当前 {selected.mapCount} 图分析范围内的相对位置；信号覆盖低于 75% 时不展示精确排名。</p>
                </div>
              ) : (
                <p className="stu-dim">该聚合范围无 PRISM 结果。</p>
              )}
            </div>

            {selected.style && (
              <div className="stu-card">
                <h3>倾向与效率</h3>
                <FingerprintRadar style={selected.style} />
              </div>
            )}
          </div>
          )}

          {profileTab === "aim" && (
          <div className="stu-profile-grid">
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

            {mechanics && (
              <div className="stu-card stu-card-wide">
                <h3>武器分析</h3>
                <MechanicsWeaponCards profile={mechanics} />
              </div>
            )}

            {detailsError && (
              <div className="stu-card">
                <h3>逐场洞察</h3>
                <p className="stu-dim">加载失败：{detailsError}</p>
              </div>
            )}
          </div>
          )}

          {profileTab === "utility" && (
          <div className="stu-profile-grid">
            {insights && (
              <div className="stu-card">
                <h3>闪光价值</h3>
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
                    <span>闪光净收益/颗</span>
                    <b>{insights.flash.netSecondsPerFlash == null ? "—" : `${insights.flash.netSecondsPerFlash.toFixed(2)}s`}</b>
                  </div>
                  <div className="stu-metric"><span>闪光助攻</span><b>{insights.flash.flashAssists}</b></div>
                </div>
                {(insights.flash.bestEnemyFlashes?.length ?? 0) > 0 && (
                  <>
                    <div className="stu-card-head" style={{ marginTop: 12 }}>
                      <h4 className="stu-subhead" style={{ margin: 0 }}>最佳闪光</h4>
                      <div className="stu-chip-row" role="tablist" aria-label="最佳闪光排序">
                        <button type="button" role="tab" aria-selected={flashMode === "net"}
                          className={flashMode === "net" ? "stu-chip stu-chip-active" : "stu-chip"}
                          onClick={() => setFlashMode("net")}>净收益</button>
                        <button type="button" role="tab" aria-selected={flashMode === "enemy"}
                          className={flashMode === "enemy" ? "stu-chip stu-chip-active" : "stu-chip"}
                          onClick={() => setFlashMode("enemy")}>致盲最久</button>
                      </div>
                    </div>
                    <div className="stu-evidence-list">
                      {[...insights.flash.bestEnemyFlashes]
                        .sort((a, b) => flashMode === "net" ? b.netSeconds - a.netSeconds : b.enemySeconds - a.enemySeconds)
                        .slice(0, 5)
                        .map((flash, i) => {
                          const e = entryByMatchId.get(flash.matchId);
                          const metric = flashMode === "net"
                            ? `净 ${flash.netSeconds.toFixed(1)}s`
                            : `致盲 ${flash.enemySeconds.toFixed(1)}s`;
                          return (
                            <EvidenceActions
                              key={`${flash.matchId}-${flash.roundNumber}-${i}`}
                              entry={e}
                              target={{ roundNumber: flash.roundNumber, tick: flash.tick }}
                              onOpenMatch={onOpenMatch}
                              onOpenEvidence={onOpenEvidence}
                              onWatchDemo={onWatchDemo}
                              reason={flash.reason}
                              sourceKey={`players:flash:${flash.matchId}:${flash.roundNumber}:${i}`}
                            >
                              {e ? formatMatchLabel(e) : flash.matchId} · R{flash.roundNumber} · 致盲 {flash.victimCount} 人 · {metric}
                            </EvidenceActions>
                          );
                        })}
                    </div>
                  </>
                )}
                {insights.flash.worstTeamFlashes.length > 0 && (
                  <>
                    <h4 className="stu-subhead">最严重队闪</h4>
                    <div className="stu-evidence-list">
                      {insights.flash.worstTeamFlashes.slice(0, 3).map((incident, i) => {
                        const e = entryByMatchId.get(incident.matchId);
                        return (
                          <EvidenceActions
                            key={`${incident.matchId}-${incident.roundNumber}-${i}`}
                            entry={e}
                            target={{ roundNumber: incident.roundNumber, tick: incident.tick }}
                            onOpenMatch={onOpenMatch}
                            onOpenEvidence={onOpenEvidence}
                            onWatchDemo={onWatchDemo}
                            reason={incident.reason}
                            sourceKey={`players:team-flash:${incident.matchId}:${incident.roundNumber}:${i}`}
                          >
                            {e ? formatMatchLabel(e) : incident.matchId} · R{incident.roundNumber} · 闪到 {incident.victimCount} 名队友 {incident.totalSeconds.toFixed(1)}s
                          </EvidenceActions>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {insights && (
              <div className="stu-card">
                <h3>失误复盘</h3>
                <div className="stu-metric-grid">
                  <div className="stu-metric">
                    <span>长枪局首死<MetricInfo note="我方 full 局该选手首死——最值得复盘的失误信号" /></span>
                    <b>{insights.mistakes.fullBuyFirstDeaths.count}/{insights.mistakes.fullBuyFirstDeaths.attempts} 局</b>
                  </div>
                  <div className="stu-metric">
                    <span>Anti-eco 首死<MetricInfo note="对手 eco/semi 局该选手首死（优势局被换掉）" /></span>
                    <b>{insights.mistakes.antiEcoFirstDeaths.count}/{insights.mistakes.antiEcoFirstDeaths.attempts} 局</b>
                  </div>
                  <div className="stu-metric">
                    <span>劣势经济首死<MetricInfo note="eco/半起/强起局中该选手首死（劣势经济，参考为主）" /></span>
                    <b>{insights.mistakes.lowBuyFirstDeaths.count}/{insights.mistakes.lowBuyFirstDeaths.attempts} 局</b>
                  </div>
                  <div className="stu-metric"><span>残局失利</span><b>{insights.mistakes.clutchLosses.count}</b></div>
                  <div className="stu-metric">
                    <span>死亡分布<MetricInfo note="按回合倒计时分段：1:30 前 / 1:30-1:00 / 1:00 后。分别对应开局送首杀或被前顶清掉、默认过程中没卡住、被反清或执行过程死亡。" /></span>
                    <b>
                      {insights.mistakes.deathTiming.total > 0
                        ? `${insights.mistakes.deathTiming.early}开局/${insights.mistakes.deathTiming.mid}默认/${insights.mistakes.deathTiming.late}后段`
                        : "—"}
                    </b>
                  </div>
                </div>
                {[...insights.mistakes.fullBuyFirstDeaths.evidence, ...insights.mistakes.antiEcoFirstDeaths.evidence, ...insights.mistakes.clutchLosses.evidence].length > 0 && (
                  <div className="stu-evidence-list">
                    {[...insights.mistakes.fullBuyFirstDeaths.evidence.slice(0, 3), ...insights.mistakes.antiEcoFirstDeaths.evidence.slice(0, 3), ...insights.mistakes.clutchLosses.evidence.slice(0, 3)].map((evidence, i) => {
                      const e = entryByMatchId.get(evidence.matchId);
                      return (
                        <EvidenceActions
                          key={`${evidence.matchId}-${evidence.roundNumber}-${i}`}
                          entry={e}
                          target={{ roundNumber: evidence.roundNumber, tick: evidence.tick }}
                          onOpenMatch={onOpenMatch}
                          onOpenEvidence={onOpenEvidence}
                          onWatchDemo={onWatchDemo}
                          reason={evidence.reason}
                          sourceKey={`players:mistake:${evidence.matchId}:${evidence.roundNumber}:${i}`}
                        >
                          {e ? formatMatchLabel(e) : evidence.matchId} · R{evidence.roundNumber} · {evidence.detail}
                        </EvidenceActions>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {profileTab === "trend" && (
          <div className="stu-profile-grid">
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
                  const date = entry ? entryDate(entry) : null;
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
          )}
        </section>
      </div>
    </div>
  );
}

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

// 概览卡（all/other 桶）展示全集；具体武器按类别只展示有意义的指标（与对枪实验室口径一致）。
const OVERALL_METRIC_KEYS: MechanicsMetricKey[] = ["firstShotHit", "sprayHit", "counterStrafe", "ttk", "oneTap", "reaction", "preaim", "headshot", "killsPerMatch"];

function mechanicsKeysFor(weapon: string): MechanicsMetricKey[] {
  if (weapon === "all" || weapon === "other") return OVERALL_METRIC_KEYS;
  return mechanicsMetricsForWeapon(weapon);
}

function mechanicsMetricCell(key: MechanicsMetricKey, row: PlayerMechanicsProfile["weapons"][number]) {
  switch (key) {
    case "firstShotHit": return <MechanicsMetric key={key} label="首发命中率" value={row.firstShotAccuracyPercent} unit="%" note="干净交火开火段第一发命中 / 干净交火开火段数。" percentile={row.percentile.firstShotAccuracy} />;
    case "sprayHit": return <MechanicsMetric key={key} label="扫射命中率" value={row.sprayAccuracyPercent} unit="%" note="干净全自动开火段长度 ≥5 时，从第 4 发起的命中率。" percentile={row.percentile.sprayAccuracy} />;
    case "counterStrafe": return <MechanicsMetric key={key} label="急停成功率" value={row.counterStrafeSuccessPercent} unit="%" note="干净交火开火段中，开枪前在移动且开枪时已降到该武器判定用最大移动速度约 34% 以下的比例；AWP 按常见开镜开枪口径取 100u/s，其他开镜武器暂按基础移速口径展示。" percentile={row.percentile.counterStrafe} />;
    case "oneTap": return <MechanicsMetric key={key} label="one tap 率" value={row.oneTapRatePercent} unit="%" note="在可一枪满血击杀的武器中，满血干净击杀是否由终结开火段的第一发直接完成。" percentile={row.percentile.oneTapRate} />;
    case "ttk": return <MechanicsMetric key={key} label="击杀耗时" value={row.medianTtkMs} unit="ms" note="满血干净击杀中，击杀开火段第一枪到击杀的中位耗时，越低越好。" percentile={row.percentile.medianTtk} />;
    case "reaction": return <MechanicsMetric key={key} label="反应时间" value={row.visualReactionMs} unit="ms" note="敌人进入有效视野到首发开枪的中位耗时；受预瞄、架点、信息、动画与 demo tick 影响，不等同于人体反应速度。" percentile={row.percentile.visualReaction} />;
    case "preaim": return <MechanicsMetric key={key} label="预瞄误差" value={row.preaimErrorDegrees} unit="°" note="干净击杀中，捕获前准星与目标三维夹角中位。" percentile={row.percentile.preaimError} />;
    case "headshot": return <MechanicsMetric key={key} label="爆头率" value={row.headshotPercent} unit="%" note="干净爆头击杀 / 干净击杀。" percentile={null} />;
    case "killsPerMatch": return <MechanicsMetric key={key} label="场均击杀" value={row.killsPerMatch} unit="" note="该武器击杀 / 参与场数。" percentile={null} />;
  }
}

function MechanicsWeaponCards({ profile }: { profile: PlayerMechanicsProfile }) {
  const rows = [profile.overall, ...profile.weapons].filter((row) => row.kills > 0);
  if (rows.length === 0) {
    return <p className="stu-dim">当前范围缺少 shots/duels 数据，无法生成枪法机制画像。</p>;
  }
  return (
    <div className="stu-mechanics-grid">
      {rows.map((row) => (
        <article key={row.weapon} className="stu-mechanics-card">
          <header>
            <h4>{row.label}</h4>
            <span>{row.kills} 击杀</span>
          </header>
          <div className="stu-metric-grid">
            {mechanicsKeysFor(row.weapon).map((key) => mechanicsMetricCell(key, row))}
          </div>
        </article>
      ))}
    </div>
  );
}

function MechanicsMetric({
  label,
  value,
  unit,
  note,
  percentile
}: {
  label: string;
  value: number | null;
  unit: string;
  note: string;
  percentile: string | null;
}) {
  return (
    <div className="stu-metric">
      <span>{label}<MetricInfo note={note} /></span>
      <b>{value == null ? "—" : `${value.toFixed(unit === "ms" ? 0 : 1)}${unit}`}</b>
      {percentile && <small>{percentile}</small>}
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
    lines.push("**PRISM 打法画像（当前样本内）**：" + profile.style.axes.map((axis) => axis.status === "ready"
      ? `${axis.label} 行为 P${axis.involvementPercentile!.toFixed(0)} / 效率 P${axis.efficiencyPercentile!.toFixed(0)}`
      : `${axis.label} ${axis.status === "partial" ? "部分信号" : "不可用"}`
    ).join(" · "));
  }
  if (insights) {
    lines.push("");
    lines.push(`**闪光价值**：投 ${insights.flash.flashesThrown} 颗，致盲敌方 ${insights.flash.enemyBlindSeconds.toFixed(1)}s / 队友 ${insights.flash.teamBlindSeconds.toFixed(1)}s` +
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
      ? left.style.axes.flatMap((axis) => {
          const other = right.style!.axes.find((x) => x.key === axis.key);
          return [
            { label: `${axis.label} · 行为`, a: axis.involvementPercentile, b: other?.involvementPercentile ?? null, format: "percent" },
            { label: `${axis.label} · 效率`, a: axis.efficiencyPercentile, b: other?.efficiencyPercentile ?? null, format: "percent" }
          ];
        })
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
