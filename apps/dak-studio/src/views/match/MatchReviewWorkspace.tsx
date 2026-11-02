import type { MatchWorkspaceModel, WorkspaceSpatialPoint } from "@cs2dak/presentation";
import { displayWeaponName, sideLabel, economyLabelCn, buildMatchReportMarkdown } from "@cs2dak/presentation";
import { Activity, BarChart3, Crosshair, Film, Gauge, ListChecks, Map as MapIcon, Swords, Table2, Users } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { EconomyPanel, HeatmapCanvas, ReplayViewer, ScoreboardTable } from "@cs2dak/react";
import { normalizeReplayViewState } from "@cs2dak/presentation";
import { Panel } from "./MatchPanel";
import { normalizeMatchWorkspaceState, roundMatchesFilter, ROUND_FILTER_DEFAULT, type MatchRoundFilterState, type MatchWorkspaceState } from "../../lib/match-workspace-state";
import { matchesQuickRound, quickRoundTick, type QuickRoundFilter } from "../../lib/match-review";
import "./match-review.css";

interface MatchWorkspaceProps { model: MatchWorkspaceModel }

type WorkspaceView = MatchWorkspaceModel["tabs"][number]["key"];
type HeatmapLayer = Extract<WorkspaceSpatialPoint["kind"], "death" | "kill" | "grenade">;

const WORKSPACE_NAV: Array<{ key: WorkspaceView; label: string }> = [
  { key: "replay", label: "回放" },
  { key: "overview", label: "概览" },
  { key: "rounds", label: "回合" },
  { key: "players", label: "选手" },
  { key: "economy", label: "经济" },
  { key: "weapons", label: "武器" },
  { key: "duels", label: "对位" },
  { key: "map", label: "地图" }
];

export function MatchReviewWorkspace({ model, state: input, onStateChange, pinnedIds, onNote, onAnalyzePlayer, onReviewChoice, onExportCurrent }: { onExportCurrent?: (format: "markdown" | "json") => void; onReviewChoice: () => void; onAnalyzePlayer: (steamId: string, label: string) => void; pinnedIds: string[]; onNote: (roundNumber: number) => void; model: MatchWorkspaceModel; state: MatchWorkspaceState; onStateChange: (next: MatchWorkspaceState) => void }) {
  const state = normalizeMatchWorkspaceState(model, input);
  const setView = (view: WorkspaceView) => onStateChange({ ...state, view, replay: state.replay && view !== "replay" ? { ...state.replay, playing: false } : state.replay });
  const view = state.view;
  const openReplay = (roundNumber: number, tick?: number) => {
    const round = model.replay.rounds.find(r => r.roundNumber === roundNumber);
    const replay = state.replay && round ? normalizeReplayViewState(model.replay, model.map.view, { ...state.replay, roundNumber, tick: tick ?? round.freezeEndTick, playing: false }) : state.replay;
    onStateChange(round && replay ? { ...state, view: "replay", replay } : { ...state, view: "rounds", quickRoundFilter: "all", roundExplorer: { ...state.roundExplorer, filter: ROUND_FILTER_DEFAULT, selectedRoundNumber: roundNumber } });
  };
  const pinnedMatches = model.players.filter(p => pinnedIds.includes(p.row.steamId64));
  const reviewRow = model.scoreboard.find(row => row.steamId64 === state.reviewPlayerSteamId64);
  const replayHandler = model.replay.available ? openReplay : undefined;
  const nav = model.replay.available ? WORKSPACE_NAV : WORKSPACE_NAV.filter((item) => item.key !== "replay");

  return (
    <main className="dak-shell">
      <div className="dak-workspace">
        <header className="dak-header dak-workspace-header">
          <div>
            <h1 className="dak-title">{model.title}</h1>
            <p className="dak-subtitle">{model.subtitle}</p>
          </div>
          <div className="dak-scoreblock">
            <div className="dak-scoreline">{model.scoreline}</div>
            <div className="dak-mapline">{model.mapName}</div>
            <button type="button" className="dak-report-button" disabled={!onExportCurrent} onClick={() => onExportCurrent?.("markdown")}>导出本次结果 · Markdown</button>
            <button type="button" className="dak-report-button" disabled={!onExportCurrent} onClick={() => onExportCurrent?.("json")}>导出本次结果 · JSON</button>
            <button
              type="button"
              className="dak-report-button"
              onClick={() => downloadMatchReport(model)}
              title="导出本场比赛报告（Markdown）"
            >
              导出报告
            </button>
          </div>
        </header>

        <section className="dak-kpi-strip" aria-label="Match KPIs">
          {model.overview.kpis.map((kpi) => (
            <Metric key={kpi.key} icon={iconForKpi(kpi.key)} label={kpi.label} value={kpi.value} detail={kpi.detail} />
          ))}
        </section>

        <section className="dak-stack" aria-label="复盘对象">
          <div><button type="button" className="stu-button-sm" onClick={() => { onReviewChoice(); onStateChange(normalizeMatchWorkspaceState(model, { ...state, reviewPlayerSteamId64: null })); }}>全部</button> {pinnedMatches.length === 1 && <button type="button" className="stu-button-sm" onClick={() => { onReviewChoice(); onStateChange(normalizeMatchWorkspaceState(model, { ...state, reviewPlayerSteamId64: pinnedMatches[0].row.steamId64 })); }}>我</button>} {pinnedMatches.length > 1 && <span>关注的多个账号都在本场，请选择选手。</span>}</div>
          <label>选择选手 <select className="stu-select" value={state.reviewPlayerSteamId64 ?? ""} onChange={e => { onReviewChoice(); onStateChange(normalizeMatchWorkspaceState(model, { ...state, reviewPlayerSteamId64: e.target.value || null })); }}>
            <option value="">全部选手</option>
            {model.players.map(p => <option key={p.row.steamId64} value={p.row.steamId64}>{p.row.name}</option>)}
          </select></label>
          {reviewRow && <p>{reviewRow.name} · K/D/A {reviewRow.fieldAvailability.playerStats === "available" ? `${reviewRow.kills}/${reviewRow.deaths}/${reviewRow.assists}` : "—"} · ADR {reviewRow.fieldAvailability.damages === "available" ? reviewRow.adr.toFixed(1) : "—"} · KAST {reviewRow.fieldAvailability.rounds === "available" ? `${reviewRow.kast.toFixed(1)}%` : "—"}</p>}
        </section>
        <nav className="dak-ws-nav" aria-label="比赛工作台视图">
          {nav.map((item) => (
            <button
              key={item.key}
              type="button"
              className={view === item.key ? "dak-ws-navtab dak-ws-navtab-active" : "dak-ws-navtab"}
              onClick={() => setView(item.key)}
            >
              {iconForTab(item.key)}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <section className="dak-ws-main">
          {view === "replay" && model.replay.available && (
            <ReplayViewer replay={model.replay} map={model.map.view} state={state.replay} onStateChange={(replay) => onStateChange({ ...state, replay })} />
          )}
          {view === "overview" && <OverviewView model={model} onNavigate={setView} onPlayerClick={id => onStateChange({ ...state, view: "players", playerPanelSteamId64: id })} />}
          {view === "rounds" && <RoundExplorer model={model} onNote={onNote} quickFilter={state.quickRoundFilter} reviewPlayer={state.reviewPlayerSteamId64} onQuickFilter={(quickRoundFilter) => onStateChange(normalizeMatchWorkspaceState(model, { ...state, quickRoundFilter }))} state={state.roundExplorer} onChange={(roundExplorer) => onStateChange(normalizeMatchWorkspaceState(model, { ...state, roundExplorer }))} onOpenReplay={replayHandler} />}
          {view === "players" && <PlayerStoryPanel model={model} onAnalyzePlayer={onAnalyzePlayer} selectedSteamId={state.playerPanelSteamId64} setSelectedSteamId={(playerPanelSteamId64) => onStateChange({ ...state, playerPanelSteamId64 })} onOpenReplay={replayHandler} />}
          {view === "economy" && (
            <div className="dak-stack">
              <Panel title="经济走势">
                <EconomyPanel points={model.economy} teamAName={model.teams.teamA.name} teamBName={model.teams.teamB.name} onJumpRound={(roundNumber) => openReplay(roundNumber)} />
              </Panel>
              <BuyQualityPanel model={model} />
            </div>
          )}
          {view === "weapons" && <WeaponsView model={model} />}
          {view === "duels" && <DuelsView model={model} />}
          {view === "map" && <MapWorkspace model={model} layer={state.mapLayer} setLayer={(mapLayer) => onStateChange({ ...state, mapLayer })} />}
        </section>
      </div>
    </main>
  );
}

function OverviewView({ model, onNavigate, onPlayerClick }: MatchWorkspaceProps & { onNavigate: (view: WorkspaceView) => void; onPlayerClick: (id: string) => void }) {
  // 全宽 2 栏：左 = 主线 + 记分板，右 = 模块快捷入口 + 地图状态。
  return (
    <div className="dak-grid">
      <section className="dak-stack">
        <Panel title="比赛主线">
          <div className="dak-story-list">
            {model.overview.story.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </Panel>
        <Panel title="选手数据 / RR">
          <ScoreboardTable rows={model.scoreboard} onPlayerClick={onPlayerClick} />
        </Panel>
      </section>
      <aside className="dak-stack">
        <Panel title="快捷入口">
          <div className="dak-module-actions">
            <ModuleAction icon={<Film size={16} />} label="2D 回放" value={model.replay.available ? `${model.replay.sampleRate ?? 0} Hz` : "无回放"} detail={model.replay.available ? "走位 / 道具 / C4 时间线" : "导出时未附带回放流"} onClick={() => onNavigate("replay")} />
            <ModuleAction icon={<ListChecks size={16} />} label="回合浏览" value={`${model.rounds.length} 回合`} detail="时间轴 + 选中回合事件" onClick={() => onNavigate("rounds")} />
            <ModuleAction icon={<Users size={16} />} label="选手视角" value={`${model.players.length} 名选手`} detail="RR 拆解 + 逐回合事实" onClick={() => onNavigate("players")} />
            <ModuleAction icon={<MapIcon size={16} />} label="地图图层" value={`${model.map.points.length} 点`} detail={model.map.status.message ?? "击杀 / 死亡 / 道具图层"} onClick={() => onNavigate("map")} />
          </div>
        </Panel>
        <Panel title="地图状态">
          <MapModeList model={model} />
        </Panel>
      </aside>
    </div>
  );
}

// ── 回合筛选器（v0.2 query-first 最小实现）────────────────────────────────
const END_REASON_LABELS: Record<string, string> = {
  target_bombed: "爆弹",
  bomb_defused: "拆弹",
  t_win: "T 歼灭",
  ct_win: "CT 歼灭",
  target_saved: "守时"
};

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={active ? "dak-sf-chip dak-sf-chip-active" : "dak-sf-chip"} onClick={onClick}>
      {label}
    </button>
  );
}

function RoundExplorer({ model, state, onChange, onOpenReplay, quickFilter, reviewPlayer, onQuickFilter, onNote }: MatchWorkspaceProps & { onNote: (roundNumber: number) => void; quickFilter: QuickRoundFilter; reviewPlayer: string | null; onQuickFilter: (filter: QuickRoundFilter) => void; state: MatchWorkspaceState["roundExplorer"]; onChange: (state: MatchWorkspaceState["roundExplorer"]) => void; onOpenReplay?: (roundNumber: number, tick?: number) => void }) {
  const { selectedRoundNumber: selectedRound, showAllEvents, filter } = state;
  const setSelectedRound = (selectedRoundNumber: number) => onChange({ ...state, selectedRoundNumber, showAllEvents: false });
  const setShowAllEvents = (showAllEvents: boolean) => onChange({ ...state, showAllEvents });
  const setFilter = (next: MatchRoundFilterState | ((prev: MatchRoundFilterState) => MatchRoundFilterState)) => onChange({ ...state, filter: typeof next === "function" ? next(filter) : next });
  const filteredRounds = useMemo(
    () => model.rounds.filter((row) => roundMatchesFilter(row, filter) && matchesQuickRound(row, quickFilter, reviewPlayer)),
    [model.rounds, filter, quickFilter, reviewPlayer]
  );
  const round = filteredRounds.find((row) => row.roundNumber === selectedRound) ?? filteredRounds[0];
  const eventLimit = 28;
  const visibleEvents = round ? (showAllEvents ? round.events : round.events.slice(0, eventLimit)) : [];
  const hiddenEventCount = (round?.events.length ?? 0) - visibleEvents.length;
  const hasFacets = model.rounds.some((row) => row.facets);
  const endReasons = [...new Set(model.rounds.map((row) => row.endReason))];
  const filterActive = filteredRounds.length !== model.rounds.length;
  const toggleSpecial = (key: keyof MatchRoundFilterState["special"]) =>
    setFilter((prev) => ({ ...prev, special: { ...prev.special, [key]: !prev.special[key] } }));

  return (
    <div className="dak-selection-layout">
      <Panel title="回合时间线" eyebrow={filterActive ? `筛选命中 ${filteredRounds.length}/${model.rounds.length} 回合` : undefined}>
        <div className="dak-heatmap-side-filter" aria-label="快捷回合">
          {([ ["all", "全部回合"], ["opening", "首次交火"], ["first-death", "首死"], ["clutch", "残局"], ["utility", "投掷过道具的回合"] ] as const).map(([key, label]) => <button key={key} type="button" className={quickFilter === key ? "dak-sf-chip dak-sf-chip-active" : "dak-sf-chip"} disabled={((key === "first-death" || key === "utility") && !reviewPlayer) || (key === "utility" && !model.rounds.some(r => r.facets?.utilityThrowerSteamIds !== undefined))} title={!reviewPlayer && (key === "first-death" || key === "utility") ? "请选择选手" : key === "utility" ? "仅定位回合，非精确投掷时刻" : undefined} onClick={() => onQuickFilter(key)}>{label}</button>)}
        </div>
        <details><summary>筛选回合</summary><p>经济条件匹配任一队的经济档。</p><div className="dak-round-filterbar">
          <div className="dak-heatmap-side-filter" role="radiogroup" aria-label="胜方阵营">
            {(["all", "ct", "t"] as const).map((s) => (
              <FilterChip key={s} active={filter.winnerSide === s} label={s === "all" ? "全部" : `${s.toUpperCase()} 胜`} onClick={() => setFilter((prev) => ({ ...prev, winnerSide: s }))} />
            ))}
          </div>
          <div className="dak-heatmap-side-filter" role="radiogroup" aria-label="经济类型">
            {(["all", "pistol", "eco", "force", "full"] as const).map((e) => (
              <FilterChip key={e} active={filter.economy === e} label={e === "all" ? "全部经济" : economyLabelCn(e) || e} onClick={() => setFilter((prev) => ({ ...prev, economy: e }))} />
            ))}
          </div>
          {hasFacets && (
            <>
              <div className="dak-heatmap-side-filter" role="radiogroup" aria-label="下包点">
                {(["all", "a", "b", "none"] as const).map((s) => (
                  <FilterChip key={s} active={filter.bombSite === s} label={s === "all" ? "全部包点" : s === "none" ? "未下包" : `${s.toUpperCase()} 点`} onClick={() => setFilter((prev) => ({ ...prev, bombSite: s }))} />
                ))}
              </div>
              <div className="dak-heatmap-side-filter" role="radiogroup" aria-label="首杀方">
                <FilterChip active={filter.firstKill === "all"} label="首杀不限" onClick={() => setFilter((prev) => ({ ...prev, firstKill: "all" }))} />
                <FilterChip active={filter.firstKill === "teamA"} label={`${model.teams.teamA.name} 首杀`} onClick={() => setFilter((prev) => ({ ...prev, firstKill: "teamA" }))} />
                <FilterChip active={filter.firstKill === "teamB"} label={`${model.teams.teamB.name} 首杀`} onClick={() => setFilter((prev) => ({ ...prev, firstKill: "teamB" }))} />
              </div>
              <div className="dak-heatmap-side-filter" role="group" aria-label="高光条件">
                <FilterChip active={filter.special.clutch} label="残局" onClick={() => toggleSpecial("clutch")} />
                <FilterChip active={filter.special.multiKill} label="多杀 3+" onClick={() => toggleSpecial("multiKill")} />
                <FilterChip active={filter.special.wallbang} label="穿墙杀" onClick={() => toggleSpecial("wallbang")} />
                <FilterChip active={filter.special.smoke} label="穿烟杀" onClick={() => toggleSpecial("smoke")} />
              </div>
            </>
          )}
          <div className="dak-heatmap-side-filter">
            <select
              className="dak-round-filter-select"
              value={filter.endReason}
              onChange={(event) => setFilter((prev) => ({ ...prev, endReason: event.target.value }))}
              aria-label="结束方式"
            >
              <option value="all">全部结束方式</option>
              {endReasons.map((reason) => (
                <option key={reason} value={reason}>{END_REASON_LABELS[reason] ?? reason}</option>
              ))}
            </select>
            <select
              className="dak-round-filter-select"
              value={filter.playerSteamId64}
              onChange={(event) => setFilter((prev) => ({ ...prev, playerSteamId64: event.target.value }))}
              aria-label="参与选手"
            >
              <option value="">全部选手</option>
              {model.players.map((player) => (
                <option key={player.row.steamId64} value={player.row.steamId64}>{player.row.name}</option>
              ))}
            </select>
            {filterActive && (
              <FilterChip active={false} label="清除筛选" onClick={() => setFilter(ROUND_FILTER_DEFAULT)} />
            )}
          </div>
        </div>
        </details>
        <div className="dak-round-pills">
          {filteredRounds.map((row) => (
            <button
              key={row.roundNumber}
              className={row.roundNumber === round?.roundNumber ? "dak-round-pill dak-round-pill-active" : "dak-round-pill"}
              type="button"
              onClick={() => setSelectedRound(row.roundNumber)}
            >
              <span>R{row.roundNumber}</span>
              <b>{row.winnerSide.toUpperCase()}</b>
              <small>{row.scoreBefore}</small>
            </button>
          ))}
          {filteredRounds.length === 0 && <p className="dak-muted">没有匹配筛选条件的回合</p>}
        </div>
      </Panel>
      {round && <Panel title={`R${round.roundNumber} 详情`}>
        <div className="dak-round-detail">
          <button type="button" className="stu-button-sm" onClick={() => onNote(round.roundNumber)}>记一笔</button>
          {onOpenReplay && (
            <button className="dak-timeline-more" type="button" onClick={() => onOpenReplay(round.roundNumber, quickRoundTick(round, quickFilter))}>
              ▶ 在 2D 回放中打开本回合
            </button>
          )}
          <div className="dak-fact-grid">
            <Fact label="比分" value={round.scoreBefore} />
            <Fact label="胜方" value={round.winnerSide.toUpperCase()} />
            <Fact label="A 队经济" value={round.teamAEconomy} />
            <Fact label="B 队经济" value={round.teamBEconomy} />
          </div>
          <div className="dak-timeline">
            {visibleEvents.map((event) => (
              <div
                className={onOpenReplay ? "dak-timeline-row dak-timeline-row-link" : "dak-timeline-row"}
                key={event.id}
                onClick={onOpenReplay ? () => onOpenReplay(round.roundNumber, event.tick) : undefined}
                role={onOpenReplay ? "button" : undefined}
                title={onOpenReplay ? "点击跳到 2D 回放对应时刻" : undefined}
              >
                <span className="dak-mono dak-muted">{event.clockLabel}</span>
                <span className="dak-badge">{event.type}</span>
                <span>{event.label}</span>
              </div>
            ))}
            {hiddenEventCount > 0 && (
              <button className="dak-timeline-more" type="button" onClick={() => setShowAllEvents(true)}>
                展开剩余 {hiddenEventCount} 条事件
              </button>
            )}
            {showAllEvents && round.events.length > eventLimit && (
              <button className="dak-timeline-more" type="button" onClick={() => setShowAllEvents(false)}>
                收起到前 {eventLimit} 条
              </button>
            )}
          </div>
        </div>
      </Panel>}
    </div>
  );
}

function PlayerStoryPanel({ model, selectedSteamId, setSelectedSteamId, onOpenReplay, onAnalyzePlayer }: MatchWorkspaceProps & { onAnalyzePlayer: (steamId: string, label: string) => void; selectedSteamId: string | null; setSelectedSteamId: (id: string) => void; onOpenReplay?: (roundNumber: number, tick?: number) => void }) {
  const selected = model.players.find((player) => player.row.steamId64 === selectedSteamId) ?? model.players[0];

  if (!selected) {
    return <Panel title="选手视角"><p className="dak-muted">暂无选手数据</p></Panel>;
  }

  const roundSummary = selected.roundSummary;

  return (
    <div className="dak-selection-layout">
      <Panel title="选手列表">
        <div className="dak-player-list">
          {model.players.map((player) => (
            <button
              key={player.row.steamId64}
              className={player.row.steamId64 === selected.row.steamId64 ? "dak-player-button dak-player-button-active" : "dak-player-button"}
              type="button"
              onClick={() => setSelectedSteamId(player.row.steamId64)}
            >
              <span>{player.row.name}</span>
              <b>{player.row.accountRR.toFixed(3)}</b>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={`${selected.row.name} 个人故事`}>
        <button type="button" className="stu-button-sm" onClick={() => onAnalyzePlayer(selected.row.steamId64, selected.row.name)}>分析此选手</button>
        <div className="dak-story-list">
          {selected.summary.map((line) => <p key={line}>{line}</p>)}
        </div>
        <div className="dak-player-round-summary">
          <Fact label="回合" value={`${selected.roundFacts.length}`} />
          <Fact label="存活" value={`${roundSummary.survived}`} />
          <Fact label="首杀" value={`${roundSummary.openingKills}`} />
          <Fact label="补枪" value={`${roundSummary.tradeKills}`} />
        </div>
        <div className="dak-breakdown">
          {selected.rrBreakdown.map((part) => (
            <div className="dak-breakdown-row" key={part.key}>
              <span>{part.label}</span>
              <meter min="-1" max="1" value={Math.max(-1, Math.min(1, part.value))} />
              <b className="dak-mono">{part.value.toFixed(3)}</b>
            </div>
          ))}
        </div>
        <RRExplainPanel model={model} steamId64={selected.row.steamId64} />
        {selected.roundFacts.length > 0 && (
          <div className="dak-player-roundfacts">
            {selected.roundFacts.slice(0, 18).map((fact) => (
              <article
                className={onOpenReplay ? "dak-player-round-card dak-player-round-card-link" : "dak-player-round-card"}
                key={`${fact.steamId64}-${fact.roundNumber}`}
                onClick={onOpenReplay ? () => onOpenReplay(fact.roundNumber) : undefined}
                role={onOpenReplay ? "button" : undefined}
                title={onOpenReplay ? "点击在 2D 回放中打开该回合" : undefined}
              >
                <div className="dak-player-round-head">
                  <span className="dak-badge">R{fact.roundNumber}</span>
                  <span>{sideLabel(fact.side)}</span>
                  <b className="dak-mono">{fact.kills}/{fact.deaths}/{fact.assists}</b>
                </div>
                <div className="dak-player-round-meta">
                  <span>{economyLabelCn(fact.economyType) || "未知经济"}</span>
                  <span>{fact.survived ? "存活" : "阵亡"}</span>
                  {fact.openingDuel !== "none" && <span>{openingDuelLabel(fact.openingDuel)}</span>}
                </div>
                <div className="dak-player-round-tags">
                  {roundFactTags(fact).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

const RR_INDICATOR_GROUPS = [
  {
    title: "Combat",
    rows: [
      ["kills", "击杀"],
      ["deaths", "死亡"],
      ["assists", "助攻"],
      ["kpr", "KPR"],
      ["dpr", "DPR"],
      ["adr", "ADR"],
      ["hsPercent", "HS%"],
      ["kast", "KAST"],
      ["survivalRate", "存活率"],
      ["twoKillRounds", "2杀回合"],
      ["threeKillRounds", "3杀回合"],
      ["fourKillRounds", "4杀回合"],
      ["fiveKillRounds", "5杀回合"],
      ["multiKillRate", "多杀率"]
    ]
  },
  {
    title: "Opening / Trade",
    rows: [
      ["firstKillCount", "首杀"],
      ["firstDeathCount", "首死"],
      ["openingDuelWinRate", "首杀对决胜率"],
      ["tradeKillCount", "补枪"],
      ["tradeDeathCount", "被补枪"],
      ["tradeKillRate", "补枪率"],
      ["tradeDeathRate", "被补率"]
    ]
  },
  {
    title: "Clutch / Weapon",
    rows: [
      ["clutchAttempts", "残局尝试"],
      ["clutchWins", "残局胜利"],
      ["clutchWinRate", "残局胜率"],
      ["clutchFrequency", "残局频率"],
      ["clutchScore", "残局分"],
      ["clutchScoreRate", "残局分/回合"],
      ["vsOne.won", "1v1 胜"],
      ["vsTwo.won", "1v2 胜"],
      ["vsThree.won", "1v3 胜"],
      ["awpKills", "AWP 击杀"],
      ["awpKillsPerRound", "AWP K/R"],
      ["awpKillRate", "AWP 占比"],
      ["awpMultiKillRate", "AWP 多杀率"],
      ["awpDuelWinRate", "AWP 对决胜率"],
      ["sniperKills", "狙击击杀"],
      ["sniperKillRate", "狙击占比"]
    ]
  },
  {
    title: "Utility / Economy",
    rows: [
      ["utilityDamage", "道具伤害"],
      ["utilityDamagePerRound", "道具伤害/回合"],
      ["flashAssistCount", "闪光助攻"],
      ["enemyFlashDurationPerRound", "敌方白/回合"],
      ["teamFlashDurationPerRound", "队友白/回合"],
      ["blindDurationPerRound", "致盲/回合"],
      ["grenadeCount", "道具数"],
      ["grenadeCountPerRound", "道具/回合"],
      ["ecoRoundCount", "eco 局"],
      ["forceRoundCount", "force 局"],
      ["fullBuyRoundCount", "full 局"],
      ["pistolRoundCount", "手枪局"],
      ["avgEquipmentValue", "平均装备值"],
      ["combatDeathCount", "交火死亡"],
      ["bombDeathCount", "C4 死亡"],
      ["wallbangKillCount", "穿墙杀"],
      ["roundSwingTotal", "Swing 总量"],
      ["roundSwingPerKill", "Swing/K"]
    ]
  }
] as const;

function RRExplainPanel({ model, steamId64 }: MatchWorkspaceProps & { steamId64: string }) {
  const row = model.scoreboard.find((player) => player.steamId64 === steamId64);
  if (!row) return null;
  return (
    <div className="dak-rr-explain">
      <div className="dak-rr-explain-head">
        <span>RR 解释</span>
        <b className="dak-mono">{row.accountRR.toFixed(3)}</b>
        <small>1.0 = 职业基线 · Raw {row.accountRRRaw.toFixed(3)}</small>
      </div>
      <div className="dak-rr-status">
        <span>BuyDelta: {row.accountContextStatus.buyDelta === "available" ? "已启用" : "缺失"}</span>
        <span>ManState: {row.accountContextStatus.manState === "available" ? "已启用" : "缺失"}</span>
        <span>Combat context ×{row.accountCombatContextFactor.toFixed(2)}</span>
      </div>
      <div className="dak-rr-metric-groups">
        {RR_INDICATOR_GROUPS.map((group) => (
          <div className="dak-rr-metric-group" key={group.title}>
            <h4>{group.title}</h4>
            {group.rows.map(([key, label]) => {
              const value = indicatorValue(row.indicators, key);
              const width = indicatorBarWidth(value);
              return (
                <div className="dak-rr-metric-row" key={key}>
                  <span>{label}</span>
                  <div className="dak-rr-metric-track">
                    <i style={{ width: `${width}%` }} />
                  </div>
                  <b className="dak-mono">{formatIndicatorValue(value)}</b>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function indicatorValue(indicators: MatchWorkspaceModel["scoreboard"][number]["indicators"], key: string): number | null {
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, indicators);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function indicatorBarWidth(value: number | null): number {
  if (value == null) return 0;
  if (value <= 1) return Math.max(2, Math.min(100, value * 100));
  if (value <= 100) return Math.max(2, Math.min(100, value));
  return 100;
}

function formatIndicatorValue(value: number | null): string {
  if (value == null) return "—";
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function MapWorkspace({ model, layer, setLayer }: MatchWorkspaceProps & { layer: HeatmapLayer; setLayer: (layer: HeatmapLayer) => void }) {
  const renderableLayers = model.map.modes.filter((mode): mode is typeof mode & { key: HeatmapLayer } => (
    mode.key === "death" || mode.key === "kill" || mode.key === "grenade"
  ));
  const heatmapPoints = model.map.points
    .filter((point): point is WorkspaceSpatialPoint & { kind: "kill" | "death" | "grenade" } => (
      point.kind === "kill" || point.kind === "death" || point.kind === "grenade"
    ));

  return (
    <div className="dak-grid dak-grid-even">
      <Panel title="地图热力图">
        <HeatmapCanvas
          map={model.map.view}
          points={heatmapPoints}
          players={model.players.map((p) => ({ steamId64: p.row.steamId64, name: p.row.name, teamKey: p.row.teamKey }))}
          mode={layer}
          onModeChange={setLayer}
        />
      </Panel>
      <Panel title="空间图层">
        <div className="dak-layer-controls" role="radiogroup" aria-label="地图图层">
          {renderableLayers.map((mode) => (
            <button
              key={mode.key}
              type="button"
              role="radio"
              aria-checked={layer === mode.key}
              className={layer === mode.key ? "dak-layer-button dak-layer-button-active" : "dak-layer-button"}
              onClick={() => setLayer(mode.key)}
            >
              <span>{mode.label}</span>
              <b className="dak-mono">{mode.count}</b>
            </button>
          ))}
        </div>
        <MapPendingList model={model} renderedKinds={["death", "kill", "grenade"]} />
        {model.map.status.message && <p className="dak-muted dak-note">{model.map.status.message}</p>}
      </Panel>
    </div>
  );
}

/** 导出 Markdown 比赛报告（浏览器下载，无副作用依赖）。 */
function downloadMatchReport(model: MatchWorkspaceModel) {
  const md = buildMatchReportMarkdown(model);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${model.title.replace(/[\\/:*?"<>|]/g, "_")}-报告.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/** v0.3 Buy Quality：full/force/eco 胜率链 + 手枪局转化。 */
function BuyQualityPanel({ model }: MatchWorkspaceProps) {
  const quality = model.buyQuality;
  const conversionLabel = (cell: { rounds: number; wins: number }) =>
    cell.rounds > 0 ? `${cell.wins}/${cell.rounds}（${Math.round((cell.wins / cell.rounds) * 100)}%）` : "—";
  return (
    <Panel title="买局质量" eyebrow="各经济类型胜率 · 手枪局转化">
      <div className="dak-grid dak-grid-even">
        {([["teamA", model.teams.teamA.name, quality.teamA], ["teamB", model.teams.teamB.name, quality.teamB]] as const).map(([key, name, rows]) => (
          <div key={key}>
            <h4 className="dak-panel-eyebrow">{name}</h4>
            <table className="dak-table">
              <thead>
                <tr><th>经济</th><th className="dak-num">回合</th><th className="dak-num">胜</th><th className="dak-num">胜率</th><th aria-label="胜率条" /></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.economy}>
                    <td>{row.label}</td>
                    <td className="dak-num dak-mono">{row.rounds}</td>
                    <td className="dak-num dak-mono">{row.wins}</td>
                    <td className="dak-num dak-mono">{row.winRatePercent == null ? "—" : `${row.winRatePercent.toFixed(0)}%`}</td>
                    <td className="dak-weapon-bar-cell">
                      {row.winRatePercent != null && <div className="dak-weapon-bar" style={{ width: `${row.winRatePercent}%` }} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="dak-muted dak-note">手枪局转化（赢下手枪局后再下一城）：{conversionLabel(quality.conversion[key])}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function WeaponsView({ model }: MatchWorkspaceProps) {
  if (model.weapons.length === 0) {
    return <Panel title="武器统计"><p className="dak-muted">暂无武器击杀数据</p></Panel>;
  }
  const maxKills = Math.max(...model.weapons.map((row) => row.kills));
  return (
    <Panel title="武器统计">
      <table className="dak-table">
        <thead>
          <tr>
            <th>武器</th>
            <th className="dak-num">击杀</th>
            <th aria-label="击杀占比" />
            <th className="dak-num">HS%</th>
            <th className="dak-num">伤害</th>
            <th className="dak-num">穿墙</th>
            <th className="dak-num">穿烟</th>
            <th className="dak-num">无镜</th>
            <th>头号使用者</th>
          </tr>
        </thead>
        <tbody>
          {model.weapons.map((row) => (
            <tr key={row.weapon}>
              <td>{row.label}</td>
              <td className="dak-num dak-mono">{row.kills}</td>
              <td className="dak-weapon-bar-cell">
                <div className="dak-weapon-bar" style={{ width: `${(row.kills / maxKills) * 100}%` }} />
              </td>
              <td className="dak-num dak-mono">{row.headshotPercent == null ? "—" : `${row.headshotPercent.toFixed(1)}%`}</td>
              <td className="dak-num dak-mono">{row.damage}</td>
              <td className="dak-num dak-mono">{row.wallbangKills || "—"}</td>
              <td className="dak-num dak-mono">{row.throughSmokeKills || "—"}</td>
              <td className="dak-num dak-mono">{row.noScopeKills || "—"}</td>
              <td className="dak-muted">
                {row.topKillerName ? `${row.topKillerName} (${row.topKillerKills})` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function DuelsView({ model }: MatchWorkspaceProps) {
  const { players, matrix, openings } = model.duels;
  if (players.length === 0) {
    return <Panel title="对位"><p className="dak-muted">暂无对位数据</p></Panel>;
  }
  const maxCell = Math.max(1, ...matrix.flat());
  return (
    <div className="dak-stack">
      <Panel title="击杀矩阵" eyebrow="行 = 击杀者 · 列 = 被击杀者">
        <div className="dak-duel-scroll">
          <table className="dak-duel-matrix">
            <thead>
              <tr>
                <th aria-label="击杀者 \ 被击杀者" />
                {players.map((player) => (
                  <th key={player.steamId64} className={`dak-duel-head dak-duel-${player.teamKey}`}>
                    <span>{player.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((killer, killerIndex) => (
                <tr key={killer.steamId64}>
                  <th className={`dak-duel-rowhead dak-duel-${killer.teamKey}`}>{killer.name}</th>
                  {players.map((victim, victimIndex) => {
                    const kills = matrix[killerIndex][victimIndex];
                    const sameTeam = killer.teamKey === victim.teamKey;
                    return (
                      <td
                        key={victim.steamId64}
                        className={sameTeam ? "dak-duel-cell dak-duel-cell-same" : "dak-duel-cell"}
                        style={kills > 0 && !sameTeam ? { background: `rgba(255, 122, 33, ${0.08 + (kills / maxCell) * 0.45})` } : undefined}
                        title={`${killer.name} 击杀 ${victim.name} ×${kills}`}
                      >
                        {kills > 0 ? kills : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="首杀尝试">
        <table className="dak-table">
          <thead>
            <tr>
              <th>选手</th>
              <th className="dak-num">首杀</th>
              <th className="dak-num">首死</th>
              <th className="dak-num">胜率</th>
              <th aria-label="胜率条" />
            </tr>
          </thead>
          <tbody>
            {[...openings]
              .sort((a, b) => (b.winRatePercent ?? -1) - (a.winRatePercent ?? -1))
              .map((row) => (
                <tr key={row.steamId64}>
                  <td>
                    <span className={`dak-team-dot dak-team-dot-${row.teamKey}`} /> {row.name}
                  </td>
                  <td className="dak-num dak-mono">{row.openingKills}</td>
                  <td className="dak-num dak-mono">{row.openingDeaths}</td>
                  <td className="dak-num dak-mono">{row.winRatePercent == null ? "—" : `${row.winRatePercent.toFixed(0)}%`}</td>
                  <td className="dak-weapon-bar-cell">
                    {row.winRatePercent != null && (
                      <div className="dak-weapon-bar" style={{ width: `${row.winRatePercent}%` }} />
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function MapModeList({ model, mutedKinds = [] }: MatchWorkspaceProps & { mutedKinds?: WorkspaceSpatialPoint["kind"][] }) {
  return (
    <div className="dak-mode-list">
      {model.map.modes.map((mode) => (
        <div className={mutedKinds.includes(mode.key) ? "dak-mode-row dak-mode-row-muted" : "dak-mode-row"} key={mode.key}>
          <span>{mode.label}</span>
          <b className="dak-mono">{mode.count}</b>
        </div>
      ))}
    </div>
  );
}

function MapPendingList({ model, renderedKinds }: MatchWorkspaceProps & { renderedKinds: WorkspaceSpatialPoint["kind"][] }) {
  const pending = model.map.modes.filter((mode) => !renderedKinds.includes(mode.key));
  if (pending.length === 0) {
    return null;
  }
  return (
    <div className="dak-pending-layers">
      <div className="dak-panel-eyebrow">暂未渲染为交互图层</div>
      {pending.map((mode) => (
        <div className="dak-mode-row dak-mode-row-disabled" key={mode.key} aria-disabled="true">
          <span>{mode.label}</span>
          <b className="dak-mono">{mode.count}</b>
        </div>
      ))}
    </div>
  );
}

function ModuleAction({ icon, label, value, detail, onClick }: { icon: ReactNode; label: string; value: string; detail: string; onClick: () => void }) {
  return (
    <button className="dak-module-action" type="button" onClick={onClick}>
      <div className="dak-module-icon">{icon}</div>
      <div>
        <b>{label}</b>
        <span>{value}</span>
        <small>{detail}</small>
      </div>
    </button>
  );
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="dak-metric">
      <div className="dak-metric-icon">{icon}</div>
      <div>
        <div className="dak-metric-label">{label}</div>
        <div className="dak-metric-value">{value}</div>
        <div className="dak-metric-detail">{detail}</div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="dak-fact">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function iconForKpi(key: string) {
  if (key === "topRR") return <Gauge size={16} />;
  if (key === "topADR") return <Crosshair size={16} />;
  if (key === "rounds") return <ListChecks size={16} />;
  return <Activity size={16} />;
}

function iconForTab(key: WorkspaceView) {
  if (key === "overview") return <Table2 size={16} />;
  if (key === "rounds") return <ListChecks size={16} />;
  if (key === "players") return <Users size={16} />;
  if (key === "economy") return <BarChart3 size={16} />;
  if (key === "weapons") return <Crosshair size={16} />;
  if (key === "duels") return <Swords size={16} />;
  if (key === "map") return <MapIcon size={16} />;
  return <Film size={16} />;
}

function openingDuelLabel(openingDuel: string) {
  if (openingDuel === "won") return "首杀";
  if (openingDuel === "lost") return "首死";
  return openingDuel;
}

function roundFactTags(fact: MatchWorkspaceModel["players"][number]["roundFacts"][number]) {
  const labels: Record<string, string> = {
    kill: "击杀",
    assist: "助攻",
    survive: "存活",
    trade: "被补枪"
  };
  const tags = fact.kastTags.map((tag) => labels[tag] ?? tag);
  if (fact.tradeKills > 0) tags.push(`补枪 +${fact.tradeKills}`);
  if (fact.tradedDeaths > 0) tags.push("死亡被补");
  if (fact.flashAssists > 0) tags.push(`闪助 +${fact.flashAssists}`);
  return tags.length > 0 ? tags : ["无 KAST"];
}
