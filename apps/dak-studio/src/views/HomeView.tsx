import { Pause, Play, RotateCcw, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { OpeningTrailRound, OpeningTrailsModel, PlayerSeasonProfile, TeamKey } from "@cs2dak/contract";
import { SEASON_STAT_VIEWS, type PlayerSeasonInsights } from "@cs2dak/presentation";
import { getPlayerSeasonDetails, getSeasonSummary, type IdentityOptions } from "../lib/season";
import { entryDate, formatMatchLabel, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { getPinnedPlayer, matchPinned, type PinnedPlayer } from "../lib/pin";
import { getFactsStore, type PlayerMatchStatsFact } from "../lib/facts";
import { EmptyState, MetricInfo } from "@cs2dak/react";
import { FingerprintRadar, TrendChart } from "./profile-widgets";
import { RadarTrails, type RadarGrenadeOverlay, type RadarTrail } from "../components/RadarTrails";
import { EvidenceActions } from "../components/EvidenceActions";

export interface HomeViewProps {
  entries: StudioDemoEntry[];
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoPlayers: () => void;
  onGoLibrary: () => void;
  identityOptions?: IdentityOptions;
}

const CORE_VIEW = SEASON_STAT_VIEWS.find((view) => view.key === "core")!;
const OPENING_WINDOW_SECONDS = 30;
const OPENING_MATCH_LIMIT = 5;
const EFFECT_DURATION_SECONDS: Partial<Record<string, number>> = {
  smoke: 18,
  molotov: 7,
  incendiary: 7,
  hegrenade: 0.7,
  flashbang: 0.7,
  decoy: 15
};
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
export function HomeView({ entries, onOpenMatch, onWatchDemo, onGoPlayers, onGoLibrary, identityOptions }: HomeViewProps) {
  const [profiles, setProfiles] = useState<PlayerSeasonProfile[] | null>(null);
  const [insights, setInsights] = useState<PlayerSeasonInsights | null>(null);
  const [matchStats, setMatchStats] = useState<PlayerMatchStatsFact[] | null>(null);
  const [trailModels, setTrailModels] = useState<OpeningTrailsModel[] | null>(null);
  const [homeTrailMap, setHomeTrailMap] = useState<string | null>(null);
  const [homeTrailSide, setHomeTrailSide] = useState<"t" | "ct">("t");
  const [homeTrailShowTrails, setHomeTrailShowTrails] = useState(true);
  const [homeTrailShowGrenades, setHomeTrailShowGrenades] = useState(true);
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

  const homeTrailMapOptions = useMemo(() => {
    const counts = new Map<string, { count: number; firstIndex: number }>();
    myMatches.forEach((entry, index) => {
      const current = counts.get(entry.meta.mapName);
      if (current) current.count += 1;
      else counts.set(entry.meta.mapName, { count: 1, firstIndex: index });
    });
    return [...counts.entries()].sort((a, b) => a[1].firstIndex - b[1].firstIndex);
  }, [myMatches]);

  useEffect(() => {
    setHomeTrailMap((current) =>
      current && homeTrailMapOptions.some(([map]) => map === current)
        ? current
        : (homeTrailMapOptions[0]?.[0] ?? null)
    );
  }, [homeTrailMapOptions]);

  const homeTrailEntries = useMemo(() => {
    if (!homeTrailMap) return [];
    return myMatches
      .filter((entry) => entry.meta.mapName === homeTrailMap)
      .slice(0, OPENING_MATCH_LIMIT);
  }, [myMatches, homeTrailMap]);

  useEffect(() => {
    if (!me || homeTrailEntries.length === 0) {
      setTrailModels(null);
      return;
    }
    let cancelled = false;
    setTrailModels(null);
    getFactsStore()
      .getOpeningTrails({
        matchIds: homeTrailEntries.map(matchIdForEntry),
        playerKeys: [me.playerKey],
        steamIds: me.steamIds
      })
      .then((facts) => {
        if (!cancelled) setTrailModels(facts.map((fact) => fact.row));
      })
      .catch(() => {
        if (!cancelled) setTrailModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [me?.playerKey, homeTrailEntries]);  // eslint-disable-line react-hooks/exhaustive-deps

  const homeTrailRounds = useMemo(
    () => (trailModels ?? [])
      .filter((model) => model.available && model.mapName === homeTrailMap)
      .flatMap((model) => model.rounds)
      .filter((round) => round.side === homeTrailSide),
    [trailModels, homeTrailMap, homeTrailSide]
  );

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
          hint="导入包含你参赛记录的 demo，或在选手档案重新标记「这是我」。"
          action={<button type="button" className="stu-button" onClick={onGoPlayers}>去选手档案</button>}
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
                      <EvidenceActions
                        entry={entryByMatchId.get(card.evidence.matchId)}
                        target={{ roundNumber: card.evidence.roundNumber, tick: card.evidence.tick }}
                        onOpenMatch={onOpenMatch}
                        onWatchDemo={onWatchDemo}
                      >
                        {entryByMatchId.has(card.evidence.matchId) ? formatMatchLabel(entryByMatchId.get(card.evidence.matchId)!) : card.evidence.matchId} · R{card.evidence.roundNumber} · {card.evidence.detail}
                      </EvidenceActions>
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
              <div className="stu-home-trail-head">
                <h3>开局动线{homeTrailMap && <span className="stu-card-sub stu-dim"> · 最近 {homeTrailEntries.length} 场</span>}</h3>
                <div className="stu-home-trail-controls">
                  {homeTrailMapOptions.length > 1 && (
                    <select className="stu-select stu-home-trail-select" value={homeTrailMap ?? ""} onChange={(e) => setHomeTrailMap(e.target.value || null)}>
                      {homeTrailMapOptions.map(([map, meta]) => (
                        <option key={map} value={map}>{map}（{meta.count} 场）</option>
                      ))}
                    </select>
                  )}
                  <div className="stu-side-toggle" role="radiogroup" aria-label="主页开局动线阵营">
                    {(["t", "ct"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={homeTrailSide === value}
                        className={homeTrailSide === value ? "stu-chip stu-chip-active" : "stu-chip"}
                        onClick={() => setHomeTrailSide(value)}
                      >
                        {value.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div className="stu-speed-toggle" role="group" aria-label="主页开局动线图层">
                    <button
                      type="button"
                      className={homeTrailShowTrails ? "stu-chip stu-chip-active" : "stu-chip"}
                      onClick={() => setHomeTrailShowTrails((value) => !value)}
                    >
                      轨迹
                    </button>
                    <button
                      type="button"
                      className={homeTrailShowGrenades ? "stu-chip stu-chip-active" : "stu-chip"}
                      onClick={() => setHomeTrailShowGrenades((value) => !value)}
                    >
                      道具
                    </button>
                  </div>
                </div>
              </div>
              {trailModels == null && homeTrailEntries.length > 0 ? (
                <div className="stu-loading">提取 {homeTrailEntries.length} 场开局动线…</div>
              ) : homeTrailMap && homeTrailRounds.length > 0 ? (
                <HomeOpeningTrails
                  mapName={homeTrailMap}
                  rounds={homeTrailRounds}
                  showTrails={homeTrailShowTrails}
                  showGrenades={homeTrailShowGrenades}
                />
              ) : (
                <p className="stu-dim">最近 {OPENING_MATCH_LIMIT} 场同图比赛没有 {homeTrailSide.toUpperCase()} 方长枪局起手轨迹（缺回放流或无长枪局）。完整动线见侧边栏「开局动线」。</p>
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
                <div className="stu-metric" title="（敌方 - 友方）致盲秒数 / 投掷数"><span>闪光净收益/颗</span><b>{insights.flash.netSecondsPerFlash == null ? "—" : `${insights.flash.netSecondsPerFlash.toFixed(2)}s`}</b></div>
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
                          <EvidenceActions
                            key={`${flash.matchId}-${flash.roundNumber}-${i}`}
                            entry={e}
                            target={{ roundNumber: flash.roundNumber, tick: flash.tick }}
                            onOpenMatch={onOpenMatch}
                            onWatchDemo={onWatchDemo}
                          >
                            {e ? formatMatchLabel(e) : flash.matchId} · R{flash.roundNumber} · 致盲 {flash.victimCount} 人 · 净 {flash.netSeconds.toFixed(1)}s
                          </EvidenceActions>
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

function HomeOpeningTrails({
  mapName,
  rounds,
  showTrails,
  showGrenades,
}: {
  mapName: string;
  rounds: OpeningTrailRound[];
  showTrails: boolean;
  showGrenades: boolean;
}) {
  const [time, setTime] = useState(OPENING_WINDOW_SECONDS);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    setTime(OPENING_WINDOW_SECONDS);
    setPlaying(false);
  }, [mapName, rounds]);

  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      return;
    }
    const step = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      if (last != null) {
        setTime((current) => {
          const next = current + ((ts - last) / 1000) * 2;
          if (next >= OPENING_WINDOW_SECONDS) {
            setPlaying(false);
            return OPENING_WINDOW_SECONDS;
          }
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  const restart = () => {
    setTime(0);
    setPlaying(true);
  };

  const prepared = useMemo(
    () => rounds.map((round, index) => ({ round, color: trailColor(index), key: `${round.matchId}#R${round.roundNumber}` })),
    [rounds]
  );
  const trails: RadarTrail[] = prepared.map((item) => ({
    id: item.key,
    points: item.round.points.filter((p) => p.t <= time).map((p) => ({ x: p.x, y: p.y })),
    color: item.color,
    opacity: 0.52,
  }));
  const grenades: RadarGrenadeOverlay[] = prepared.flatMap((item) =>
    item.round.grenades
      .filter((g) => g.t <= time)
      .map((g, gi) => {
        const effectEnd = g.destroyT ?? g.effectT + (EFFECT_DURATION_SECONDS[g.grenade] ?? 0);
        return {
          trailId: `${item.key}-g${gi}`,
          type: g.grenade,
          x: g.x,
          y: g.y,
          ex: g.effectX,
          ey: g.effectY,
          showEffect: time >= g.effectT,
          effectActive: time >= g.effectT && time <= effectEnd,
        };
      })
  );

  return (
    <div className="stu-home-trail-player">
      <RadarTrails
        mapName={mapName}
        trails={trails}
        grenades={grenades}
        showTrails={showTrails}
        showGrenades={showGrenades}
        trailOpacity={0.52}
      />
      <div className="stu-trail-playbar stu-home-trail-playbar">
        <button type="button" className="stu-icon-button" onClick={() => (time >= OPENING_WINDOW_SECONDS ? restart() : setPlaying((v) => !v))} aria-label={playing ? "暂停" : "播放"}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" className="stu-icon-button" onClick={restart} aria-label="重播">
          <RotateCcw size={14} />
        </button>
        <input
          className="stu-trail-scrubber"
          type="range"
          min={0}
          max={OPENING_WINDOW_SECONDS}
          step={0.1}
          value={time}
          onChange={(e) => {
            setPlaying(false);
            setTime(Number(e.target.value));
          }}
        />
        <span className="stu-trail-clock">{time.toFixed(1)}s / {OPENING_WINDOW_SECONDS}s</span>
        <span className="stu-dim stu-home-trail-count">{rounds.length} 回合</span>
      </div>
    </div>
  );
}

const HOME_PREVIEW_ITEMS = [
  ["选手状态", "RR、Rating、近期趋势"],
  ["该练什么", "从失误和短板生成复盘方向"],
  ["开局动线", "默认位、出门路线、道具习惯"],
  ["最近比赛", "点回回合和 tick 证据"],
  ["闪光价值", "最佳闪与负收益队闪"],
  ["转化节奏", "手枪转化、5v4、翻盘率"]
] as const;

/** 资料库为空的引导空态：三步引导 + 导入后会点亮的主页模块。 */
function HomeEmpty({ title, hint, action }: { title: string; hint: string; action: ReactNode }) {
  return (
    <div className="stu-home-empty">
      <EmptyState mark title={title} hint={hint} action={action} />
      <ol className="stu-home-steps">
        <li><b>1</b> 导入 demo</li>
        <li><b>2</b> 标记「这是我」</li>
        <li><b>3</b> 回主页看复盘</li>
      </ol>
      <div className="stu-home-preview">
        {HOME_PREVIEW_ITEMS.map(([label, desc]) => (
          <div key={label} className="stu-home-preview-card">
            <span>{label}</span>
            <small>{desc}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 未标记「这是我」：列出资料库里最常出现的选手，一键跳选手档案标记。 */
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
        hint={<>主页会围绕你的数据展开。在下面挑出你自己，或去选手档案点名字旁的 <Star size={12} style={{ verticalAlign: "-2px" }} /> 标记。</>}
        action={<button type="button" className="stu-button" onClick={onGoPlayers}>去选手档案</button>}
      />
      {top.length > 0 && (
        <div className="stu-pickself-grid">
          {top.map((p) => (
            <button key={p.playerKey} type="button" className="stu-pickself-card" onClick={onGoPlayers} title="去选手档案标记此人为「这是我」">
              <b>{p.name}</b>
              <small className="stu-dim">{p.mapCount} 场 · RR {p.rating.rivalhubRR.toFixed(2)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
