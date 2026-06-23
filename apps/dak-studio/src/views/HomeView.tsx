import { Star } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PlayerSeasonProfile, TeamKey } from "@cs2dak/contract";
import { SEASON_STAT_VIEWS, type PlayerSeasonInsights } from "@cs2dak/presentation";
import { getPlayerSeasonDetails, getSeasonSummary, type IdentityOptions } from "../lib/season";
import { entryDate, formatMatchLabel, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { getPinnedPlayer, matchPinned, type PinnedPlayer } from "../lib/pin";
import { getFactsStore, type PlayerMatchStatsFact } from "../lib/facts";
import { EmptyState, EvidenceLink, MetricInfo } from "@cs2dak/react";
import { FingerprintRadar, TrendChart } from "./profile-widgets";
import { RadarTrails, type RadarGrenadeOverlay, type RadarTrail } from "../components/RadarTrails";

export interface HomeViewProps {
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoPlayers: () => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
}

const CORE_VIEW = SEASON_STAT_VIEWS.find((view) => view.key === "core")!;
// 抬头大数字只挑最能说明状态的几项（RR / Rating 已单列），其余取核心视图前几列。
const HERO_METRIC_COLUMNS = CORE_VIEW.columns
  .filter((col) => col.key !== "maps" && col.key !== "rivalhubRR" && col.key !== "hltvRating")
  .slice(0, 4);

type Outcome = "win" | "loss" | "tie";

/** 天梯/散场常见的占位队名（Team A / Team B / 空名），视为「无队伍」。 */
function isGenericTeamName(name: string | null | undefined): boolean {
  if (!name) return true;
  return /^\s*team\s*[ab]?\s*$/i.test(name) || name.trim().length === 0;
}

function matchOutcome(teamKey: TeamKey, entry: StudioDemoEntry): Outcome {
  const a = entry.meta.teamAScore ?? 0;
  const b = entry.meta.teamBScore ?? 0;
  if (a === b) return "tie";
  const mine = teamKey === "teamA" ? a : b;
  const opp = teamKey === "teamA" ? b : a;
  return mine > opp ? "win" : "loss";
}

function teamNameFor(teamKey: TeamKey, entry: StudioDemoEntry): string {
  return teamKey === "teamA" ? entry.meta.teamAName : entry.meta.teamBName;
}

function trailColor(index: number): string {
  return `hsl(${(index * 47) % 360} 75% 60%)`;
}

function formatCoreMetric(value: number | null, format: string): string {
  if (value == null) return "—";
  if (format === "integer") return String(Math.round(value));
  if (format === "adr") return value.toFixed(1);
  if (format === "percent") return `${value.toFixed(1)}%`;
  return value.toFixed(2);
}

interface PerMatchOutcome {
  matchId: string;
  outcome: Outcome;
}

interface TeamIdentity {
  /** 非占位队名时填，作为「我的队伍」；否则 null = 无队伍。 */
  teamName: string | null;
  wins: number;
  losses: number;
  ties: number;
  /** 按比赛日期升序的胜负序列（用于点阵，最新在右）。 */
  ordered: PerMatchOutcome[];
}

/** 我的主页：模块 3/5/6 既有 view model 的编排视图，零新信号（docs/design/studio-redesign.md §9）。 */
export function HomeView({ entries, onOpenMatch, onGoPlayers, onGoLibrary, identityOptions }: HomeViewProps) {
  const [profiles, setProfiles] = useState<PlayerSeasonProfile[] | null>(null);
  const [insights, setInsights] = useState<PlayerSeasonInsights | null>(null);
  const [matchStats, setMatchStats] = useState<PlayerMatchStatsFact[] | null>(null);
  const [trailRounds, setTrailRounds] = useState<{ mapName: string; trails: RadarTrail[]; grenades: RadarGrenadeOverlay[] } | null>(null);
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
      setMatchStats(null);
      return;
    }
    let cancelled = false;
    const matchIds = entries.map(matchIdForEntry);
    getPlayerSeasonDetails(entries, me.steamIds, identityOptions)
      .then((details) => {
        if (!cancelled) setInsights(details.insights);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    getFactsStore()
      .getPlayerMatchStats({ matchIds, steamIds: me.steamIds })
      .then((rows) => {
        if (!cancelled) setMatchStats(rows);
      })
      .catch(() => {
        if (!cancelled) setMatchStats([]);
      });
    return () => {
      cancelled = true;
    };
  }, [entries, me?.playerKey, identityOptions?.version]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 我参与的比赛（按文件名日期降序，无日期回退导入时间序）
  const myMatches = useMemo(
    () =>
      me
        ? entries
            .filter((entry) => (insights?.trend ?? []).some((point) => point.matchId === matchIdForEntry(entry)))
            .sort((a, b) => (entryDate(b) ?? "").localeCompare(entryDate(a) ?? ""))
        : [],
    [me, entries, insights]
  );
  const latestMatch = myMatches[0] ?? null;
  const latestMatchId = latestMatch ? matchIdForEntry(latestMatch) : null;

  // 开局动线：拉最近一场的长枪局起手轨迹（静态全展开，非播放）。
  useEffect(() => {
    if (!me || !latestMatchId || !latestMatch) {
      setTrailRounds(null);
      return;
    }
    let cancelled = false;
    getFactsStore()
      .getOpeningTrails({ matchIds: [latestMatchId], steamIds: me.steamIds })
      .then((facts) => {
        if (cancelled) return;
        const rounds = facts.flatMap((fact) => (fact.row.available ? fact.row.rounds : []));
        const trails: RadarTrail[] = rounds.map((round, i) => ({
          id: `r${round.roundNumber}-${i}`,
          points: round.points.map((p) => ({ x: p.x, y: p.y })),
          color: trailColor(i),
          opacity: 0.55,
        }));
        const grenades: RadarGrenadeOverlay[] = rounds.flatMap((round, ri) =>
          round.grenades.map((g, gi) => ({
            trailId: `r${ri}-g${gi}`,
            type: g.grenade,
            x: g.x,
            y: g.y,
            ex: g.effectX,
            ey: g.effectY,
            showEffect: true,
            effectActive: false,
          }))
        );
        setTrailRounds({ mapName: latestMatch.meta.mapName, trails, grenades });
      })
      .catch(() => {
        if (!cancelled) setTrailRounds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [me?.playerKey, latestMatchId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 自适应身份：从逐场队属推「我的队伍」（队名相同即可，占位名→无队伍）+ 战绩。
  const identity = useMemo<TeamIdentity | null>(() => {
    if (!matchStats || matchStats.length === 0) return null;
    const byMatch = new Map<string, PlayerMatchStatsFact>();
    for (const row of matchStats) if (!byMatch.has(row.matchId)) byMatch.set(row.matchId, row);
    const rows = [...byMatch.values()]
      .map((row) => ({ row, entry: entryByMatchId.get(row.matchId) }))
      .filter((x): x is { row: PlayerMatchStatsFact; entry: StudioDemoEntry } => x.entry != null)
      .sort((a, b) => (entryDate(a.entry) ?? "").localeCompare(entryDate(b.entry) ?? ""));
    if (rows.length === 0) return null;

    const nameCount = new Map<string, number>();
    let wins = 0, losses = 0, ties = 0;
    const ordered: PerMatchOutcome[] = [];
    for (const { row, entry } of rows) {
      const outcome = matchOutcome(row.teamKey, entry);
      if (outcome === "win") wins += 1;
      else if (outcome === "loss") losses += 1;
      else ties += 1;
      ordered.push({ matchId: row.matchId, outcome });
      const name = teamNameFor(row.teamKey, entry);
      if (!isGenericTeamName(name)) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
    }
    const teamName = [...nameCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { teamName, wins, losses, ties, ordered };
  }, [matchStats, entryByMatchId]);

  if (entries.length === 0) {
    return (
      <div className="stu-view">
        <HomeEmpty
          title="欢迎来到 DAK Studio"
          hint="先导入 .dem 或 v3 ZIP，主页会汇总你的近期状态与该练什么。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  if (pinnedLoaded && !pinned) {
    // 未标记「这是我」：直接在主页列出资料库里最常出现的几个选手，一键就地标记。
    return (
      <div className="stu-view">
        <PickSelf profiles={profiles} error={error} entriesCount={entries.length} onGoPlayers={onGoPlayers} />
      </div>
    );
  }

  const winRate = identity && identity.wins + identity.losses > 0
    ? (identity.wins / (identity.wins + identity.losses)) * 100
    : null;
  const perMatchRR = new Map(me?.perMatch.map((m) => [m.matchId, m.rivalhubRR]) ?? []);
  const outcomeByMatch = new Map(identity?.ordered.map((o) => [o.matchId, o.outcome]) ?? []);
  const practiceCards = insights ? buildPracticeCards(insights) : [];

  return (
    <div className="stu-view">
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
          {/* ① 英雄抬头条 */}
          <section className="stu-home-hero stu-card">
            <div className="stu-home-id">
              <h1><Star size={16} className="stu-pin-star" /> {me.name}</h1>
              <div className="stu-home-id-meta">
                {identity?.teamName ? (
                  <span className="stu-chip stu-chip-team">{identity.teamName}</span>
                ) : (
                  <span className="stu-chip">无队伍</span>
                )}
                {identity && (
                  <span className="stu-dim">
                    {identity.wins}胜{identity.losses}负{identity.ties > 0 ? `${identity.ties}平` : ""}
                    {winRate != null && ` · 胜率 ${winRate.toFixed(0)}%`}
                  </span>
                )}
                <span className="stu-dim">{me.mapCount} 场 · 置信度 {(me.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>

            <div className="stu-home-stats">
              <div className="stu-stat stu-stat-primary">
                <span>RR<MetricInfo note="Rival Rating（RivalHub 绝对刻度评分）" /></span>
                <b>{me.rating.rivalhubRR.toFixed(2)}</b>
              </div>
              <div className="stu-stat">
                <span>Rating 2.0<MetricInfo note="HLTV Rating 2.0 量纲" /></span>
                <b>{me.rating.hltvRating.toFixed(2)}</b>
              </div>
              {HERO_METRIC_COLUMNS.map((col) => (
                <div className="stu-stat" key={col.key} title={col.description ?? undefined}>
                  <span>{col.label}</span>
                  <b>{formatCoreMetric(me.metrics[col.key] ?? null, col.format)}</b>
                </div>
              ))}
            </div>

            {latestMatch && (
              <button type="button" className="stu-button stu-home-cta" onClick={() => onOpenMatch(latestMatch.id)}>
                打开最近一场 · {formatMatchLabel(latestMatch)}
              </button>
            )}
          </section>

          {/* ② 打法风格 + 个人趋势 */}
          <div className="stu-home-grid">
            {me.style && (
              <div className="stu-card">
                <h3>打法风格</h3>
                <FingerprintRadar axes={me.style.axes} />
              </div>
            )}

            <div className="stu-card">
              <h3>个人趋势</h3>
              {insights && insights.trend.length > 1 ? (
                <TrendChart trend={insights.trend} entryByMatchId={entryByMatchId} onOpenMatch={(id) => onOpenMatch(id)} />
              ) : (
                <p className="stu-dim">趋势需要至少 2 场比赛。</p>
              )}
              {identity && identity.ordered.length > 0 && (
                <div className="stu-wl-row" aria-label="近期胜负">
                  {identity.ordered.slice(-16).map((o, i) => (
                    <i key={`${o.matchId}-${i}`} className={`stu-wl-dot stu-wl-${o.outcome}`} title={o.outcome === "win" ? "胜" : o.outcome === "loss" ? "负" : "平"} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ③ 本周该练什么 */}
          <section className="stu-card">
            <h3>本周该练什么</h3>
            {me.weaknesses.length > 0 && (
              <div className="stu-traits">
                {me.weaknesses.slice(0, 3).map((w) => (
                  <span key={w} className="stu-tag stu-tag-warn">弱 · {w}</span>
                ))}
              </div>
            )}
            {practiceCards.length === 0 ? (
              <p className="stu-muted">当前范围没有可复盘的失误证据——保持状态。</p>
            ) : (
              <div className="stu-practice-grid">
                {practiceCards.map((card) => (
                  <article key={card.label} className="stu-practice-card">
                    <header>
                      <b>{card.label}</b>
                      <span className="stu-dim">{card.count}</span>
                    </header>
                    {card.evidence ? (
                      <EvidenceLink
                        disabled={!entryByMatchId.get(card.evidence.matchId)}
                        onOpen={() => {
                          const entry = entryByMatchId.get(card.evidence!.matchId);
                          if (entry) onOpenMatch(entry.id, { roundNumber: card.evidence!.roundNumber, tick: card.evidence!.tick });
                        }}
                      >
                        {entryByMatchId.has(card.evidence.matchId) ? formatMatchLabel(entryByMatchId.get(card.evidence.matchId)!) : card.evidence.matchId} · R{card.evidence.roundNumber} · {card.evidence.detail}
                      </EvidenceLink>
                    ) : (
                      <p className="stu-dim">暂无证据回合。</p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* ④ 开局动线 + 最近比赛 */}
          <div className="stu-home-grid">
            <div className="stu-card">
              <h3>开局动线{latestMatch && <span className="stu-card-sub stu-dim"> · {latestMatch.meta.mapName}</span>}</h3>
              {trailRounds && trailRounds.trails.length > 0 ? (
                <RadarTrails mapName={trailRounds.mapName} trails={trailRounds.trails} grenades={trailRounds.grenades} trailOpacity={0.55} />
              ) : (
                <p className="stu-dim">最近一场没有长枪局起手轨迹（缺回放流或无长枪局）。完整动线见个人实验室 · 开局动线。</p>
              )}
            </div>

            <div className="stu-card">
              <h3>最近比赛</h3>
              <div className="stu-home-matches">
                {myMatches.slice(0, 8).map((entry) => {
                  const mid = matchIdForEntry(entry);
                  const outcome = outcomeByMatch.get(mid);
                  const rr = perMatchRR.get(mid);
                  return (
                    <button key={entry.id} type="button" className="stu-home-match" onClick={() => onOpenMatch(entry.id)}>
                      <span className="stu-home-match-main">
                        {outcome && <i className={`stu-wl-dot stu-wl-${outcome}`} />}
                        {formatMatchLabel(entry)}
                      </span>
                      <small className="stu-dim">
                        {entryDate(entry) ?? "—"}{rr != null ? ` · RR ${rr.toFixed(2)}` : ""}
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ⑤ 道具：闪光价值（骨架，后续可加更多道具判断） */}
          {insights && (
            <section className="stu-card">
              <h3>道具 · 闪光价值</h3>
              <div className="stu-metric-grid">
                <div className="stu-metric"><span>投掷闪光</span><b>{insights.flash.flashesThrown}</b></div>
                <div className="stu-metric" title="所有回合敌方致盲秒数累计"><span>致盲敌方·总</span><b>{insights.flash.enemyBlindSeconds.toFixed(1)}s</b></div>
                <div className="stu-metric" title="敌方致盲秒数 / 投掷数"><span>均致盲/颗</span><b>{insights.flash.enemySecondsPerFlash == null ? "—" : `${insights.flash.enemySecondsPerFlash.toFixed(2)}s`}</b></div>
                <div className="stu-metric" title="（敌方 - 友方）致盲秒数 / 投掷数"><span>净价值/颗</span><b>{insights.flash.netSecondsPerFlash == null ? "—" : `${insights.flash.netSecondsPerFlash.toFixed(2)}s`}</b></div>
                <div className="stu-metric"><span>闪光助攻</span><b>{insights.flash.flashAssists}</b></div>
              </div>
              {(insights.flash.bestEnemyFlashes?.length ?? 0) > 0 && (
                <>
                  <h4 className="stu-subhead">最佳闪光</h4>
                  <div className="stu-evidence-list">
                    {[...insights.flash.bestEnemyFlashes]
                      .sort((a, b) => b.netSeconds - a.netSeconds)
                      .slice(0, 3)
                      .map((flash, i) => {
                        const e = entryByMatchId.get(flash.matchId);
                        return (
                          <EvidenceLink
                            key={`${flash.matchId}-${flash.roundNumber}-${i}`}
                            disabled={!e}
                            onOpen={() => { if (e) onOpenMatch(e.id, { roundNumber: flash.roundNumber, tick: flash.tick }); }}
                          >
                            {e ? formatMatchLabel(e) : flash.matchId} · R{flash.roundNumber} · 致盲 {flash.victimCount} 人 · 净 {flash.netSeconds.toFixed(1)}s
                          </EvidenceLink>
                        );
                      })}
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

interface PracticeCard {
  label: string;
  count: string;
  evidence: { matchId: string; roundNumber: number; tick?: number; detail: string } | null;
}

/** Mistake Review Top3：长枪局首死 / Anti-eco 首死 / 残局失利，各取最近一条证据。 */
function buildPracticeCards(insights: PlayerSeasonInsights): PracticeCard[] {
  const { mistakes } = insights;
  return [
    {
      label: "长枪局首死",
      count: `${mistakes.fullBuyFirstDeaths.count}/${mistakes.fullBuyFirstDeaths.attempts} 局`,
      evidence: mistakes.fullBuyFirstDeaths.evidence[0] ?? null
    },
    {
      label: "Anti-eco 首死",
      count: `${mistakes.antiEcoFirstDeaths.count}/${mistakes.antiEcoFirstDeaths.attempts} 局`,
      evidence: mistakes.antiEcoFirstDeaths.evidence[0] ?? null
    },
    {
      label: "残局失利",
      count: `${mistakes.clutchLosses.count} 次`,
      evidence: mistakes.clutchLosses.evidence[0] ?? null
    }
  ].filter((card) => card.evidence || card.count !== "0/0 局");
}

/** 资料库为空的引导空态：品牌标 + 骨架占位卡网格 + 三步引导。 */
function HomeEmpty({ title, hint, action }: { title: string; hint: string; action: ReactNode }) {
  return (
    <div className="stu-home-empty">
      <EmptyState mark title={title} hint={hint} action={action} />
      <ol className="stu-home-steps">
        <li><b>1</b> 导入 demo</li>
        <li><b>2</b> 标记「这是我」</li>
        <li><b>3</b> 回主页看复盘</li>
      </ol>
      <div className="stu-home-skeleton" aria-hidden="true">
        {["雷达", "趋势", "该练什么", "开局动线", "最近比赛", "道具"].map((label) => (
          <div key={label} className="stu-skel-card"><span>{label}</span></div>
        ))}
      </div>
    </div>
  );
}

/** 未标记「这是我」：列出资料库里最常出现的选手，一键就地标记（跳个人实验室完成）。 */
function PickSelf({
  profiles,
  error,
  entriesCount,
  onGoPlayers
}: {
  profiles: PlayerSeasonProfile[] | null;
  error: string | null;
  entriesCount: number;
  onGoPlayers: () => void;
}) {
  if (error) return <EmptyState variant="error" title="聚合失败" hint={error} />;
  if (!profiles) return <div className="stu-loading">聚合 {entriesCount} 场 demo…</div>;
  const top = [...profiles].sort((a, b) => b.mapCount - a.mapCount).slice(0, 6);
  return (
    <div className="stu-home-empty">
      <EmptyState
        mark
        title="先标记「这是我」"
        hint={<>主页会围绕你的数据展开。在下面挑出你自己，或去个人实验室点名字旁的 <Star size={12} style={{ verticalAlign: "-2px" }} /> 标记。</>}
        action={<button type="button" className="stu-button" onClick={onGoPlayers}>去个人实验室</button>}
      />
      {top.length > 0 && (
        <div className="stu-pickself-grid">
          {top.map((p) => (
            <button key={p.playerKey} type="button" className="stu-pickself-card" onClick={onGoPlayers} title="去个人实验室标记此人为「这是我」">
              <b>{p.name}</b>
              <small className="stu-dim">{p.mapCount} 场 · RR {p.rating.rivalhubRR.toFixed(2)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
