import type { MatchWorkspaceModel, WorkspaceReplayFrame, WorkspaceReplayRound, WorkspaceSpatialPoint } from "@cs2dak/contract";
import { displayWeaponName, sideLabel, economyLabelCn, buildMatchBuyQuality, buildMatchReportMarkdown } from "@cs2dak/presentation";
import { getMapCalibration, worldToRadar, hasLowerLevel, levelAt, type MapLevel } from "@cs2dak/maps";
import { Activity, BarChart3, ChevronLeft, ChevronRight, Crosshair, Film, Gauge, ListChecks, Map, Pause, Play, ShieldCheck, Swords, Table2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EconomyPanel } from "./EconomyPanel";
import { HeatmapCanvas } from "./HeatmapCanvas";
import { KillFeed } from "./KillFeed";
import { ScoreboardTable } from "./ScoreboardTable";

export interface MatchWorkspaceProps {
  model: MatchWorkspaceModel;
  initialTarget?: { roundNumber: number; tick?: number } | null;
}

type WorkspaceView = MatchWorkspaceModel["tabs"][number]["key"];
type HeatmapLayer = Extract<WorkspaceSpatialPoint["kind"], "death" | "kill" | "grenade">;

/** 统计数字 → 2D 回放的跳转目标（v0.2 query-first）。 */
export interface ReplayTarget {
  roundNumber: number;
  /** 落到该 tick 附近的帧；缺省从回合开头播。 */
  tick?: number;
  /** 同一目标重复点击也要触发跳转，用自增序列区分。 */
  seq: number;
}

export function MatchWorkspace({ model, initialTarget }: MatchWorkspaceProps) {
  const [view, setView] = useState<WorkspaceView>("overview");
  const [replayTarget, setReplayTarget] = useState<ReplayTarget | null>(null);
  const openReplay = (roundNumber: number, tick?: number) => {
    setReplayTarget((prev) => ({ roundNumber, tick, seq: (prev?.seq ?? 0) + 1 }));
    setView("replay");
  };
  useEffect(() => {
    if (!initialTarget) return;
    openReplay(initialTarget.roundNumber, initialTarget.tick);
  }, [initialTarget?.roundNumber, initialTarget?.tick]);
  const replayDetail = model.replay.available
    ? `${model.replay.sampleRate ?? 0} Hz · ${model.replay.rounds.length} 回合`
    : "无回放流";

  return (
    <main className="dak-shell">
      <div className="dak-workspace">
        <header className="dak-header dak-workspace-header">
          <div>
            <div className="dak-eyebrow">Match Workspace</div>
            <h1 className="dak-title">{model.title}</h1>
            <p className="dak-subtitle">{model.subtitle}</p>
          </div>
          <div className="dak-scoreblock">
            <div className="dak-scoreline">{model.scoreline}</div>
            <div className="dak-mapline">{model.mapName}</div>
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

        <div className="dak-workbench">
          <aside className="dak-workbench-sidebar">
            <nav className="dak-tabs" aria-label="Match workspace views">
              {model.tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={view === tab.key ? "dak-tab dak-tab-active" : "dak-tab"}
                  type="button"
                  onClick={() => setView(tab.key)}
                >
                  {iconForTab(tab.key)}
                  <span>{tab.label}</span>
                  <small>{detailForTab(tab.key, model, replayDetail)}</small>
                </button>
              ))}
            </nav>
          </aside>

          <section className="dak-workbench-main">
            {view === "overview" && <OverviewView model={model} onNavigate={setView} />}
            {view === "rounds" && <RoundExplorer model={model} onOpenReplay={model.replay.available ? openReplay : undefined} />}
            {view === "players" && <PlayerStoryPanel model={model} onOpenReplay={model.replay.available ? openReplay : undefined} />}
            {view === "economy" && (
              <div className="dak-stack">
                <Panel title="经济走势">
                  <EconomyPanel points={model.economy} teamAName={model.teams.teamA.name} teamBName={model.teams.teamB.name} />
                </Panel>
                <BuyQualityPanel model={model} />
              </div>
            )}
            {view === "weapons" && <WeaponsView model={model} />}
            {view === "duels" && <DuelsView model={model} />}
            {view === "map" && <MapWorkspace model={model} />}
            {view === "replay" && <ReplayViewer replay={model.replay} map={model.map.view} target={replayTarget} />}
          </section>
        </div>
      </div>
    </main>
  );
}

function OverviewView({ model, onNavigate }: MatchWorkspaceProps & { onNavigate: (view: WorkspaceView) => void }) {
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
          <ScoreboardTable rows={model.scoreboard} />
        </Panel>
      </section>
      <aside className="dak-stack">
        <Panel title="模块入口">
          <div className="dak-module-actions">
            <ModuleAction icon={<ListChecks size={16} />} label="回合浏览" value={`${model.rounds.length} 回合`} detail="横向 timeline + selected round events" onClick={() => onNavigate("rounds")} />
            <ModuleAction icon={<Users size={16} />} label="选手视角" value={`${model.players.length} 名选手`} detail="RR breakdown + round facts" onClick={() => onNavigate("players")} />
            <ModuleAction icon={<Map size={16} />} label="地图图层" value={`${model.map.points.length} 点`} detail={model.map.status.message ?? "kill/death/grenade layers"} onClick={() => onNavigate("map")} />
            <ModuleAction icon={<Film size={16} />} label="2D 回放" value={model.replay.available ? `${model.replay.sampleRate ?? 0} Hz` : "无回放"} detail={model.replay.available ? "走位 / 道具 / C4 时间线" : "导出时未附带回放流"} onClick={() => onNavigate("replay")} />
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
type RoundModel = MatchWorkspaceModel["rounds"][number];

interface RoundFilterState {
  winnerSide: "all" | "ct" | "t";
  economy: "all" | "pistol" | "eco" | "semi" | "force" | "full";
  bombSite: "all" | "a" | "b" | "none";
  endReason: string; // "all" 或具体 endReason
  firstKill: "all" | "teamA" | "teamB";
  special: { clutch: boolean; multiKill: boolean; wallbang: boolean; smoke: boolean };
  playerSteamId64: string; // "" = 全部；匹配该选手有击杀/首杀/残局的回合
}

const ROUND_FILTER_DEFAULT: RoundFilterState = {
  winnerSide: "all",
  economy: "all",
  bombSite: "all",
  endReason: "all",
  firstKill: "all",
  special: { clutch: false, multiKill: false, wallbang: false, smoke: false },
  playerSteamId64: ""
};

const END_REASON_LABELS: Record<string, string> = {
  target_bombed: "爆弹",
  bomb_defused: "拆弹",
  t_win: "T 歼灭",
  ct_win: "CT 歼灭",
  target_saved: "守时"
};

function roundMatchesFilter(round: RoundModel, filter: RoundFilterState): boolean {
  if (filter.winnerSide !== "all" && round.winnerSide !== filter.winnerSide) return false;
  if (filter.economy !== "all" && round.teamAEconomy !== filter.economy && round.teamBEconomy !== filter.economy) return false;
  if (filter.endReason !== "all" && round.endReason !== filter.endReason) return false;
  const facets = round.facets;
  if (filter.bombSite !== "all") {
    if (!facets) return false;
    if (filter.bombSite === "none" ? facets.bombSite !== null : facets.bombSite !== filter.bombSite) return false;
  }
  if (filter.firstKill !== "all" && facets?.firstKillTeamKey !== filter.firstKill) return false;
  if (filter.special.clutch && !facets?.clutch) return false;
  if (filter.special.multiKill && (facets?.maxKillsByOnePlayer ?? 0) < 3) return false;
  if (filter.special.wallbang && (facets?.wallbangKills ?? 0) === 0) return false;
  if (filter.special.smoke && (facets?.throughSmokeKills ?? 0) === 0) return false;
  if (filter.playerSteamId64) {
    const fact = round.playerFacts.find((f) => f.steamId64 === filter.playerSteamId64);
    const involved = !!fact && (fact.kills > 0 || fact.openingDuel !== "none" || !fact.survived);
    const isClutcher = facets?.clutch?.steamId64 === filter.playerSteamId64;
    if (!involved && !isClutcher) return false;
  }
  return true;
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={active ? "dak-sf-chip dak-sf-chip-active" : "dak-sf-chip"} onClick={onClick}>
      {label}
    </button>
  );
}

function RoundExplorer({ model, onOpenReplay }: MatchWorkspaceProps & { onOpenReplay?: (roundNumber: number, tick?: number) => void }) {
  const [selectedRound, setSelectedRound] = useState(model.rounds[0]?.roundNumber ?? 1);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [filter, setFilter] = useState<RoundFilterState>(ROUND_FILTER_DEFAULT);
  const filteredRounds = useMemo(
    () => model.rounds.filter((row) => roundMatchesFilter(row, filter)),
    [model.rounds, filter]
  );
  const round = model.rounds.find((row) => row.roundNumber === selectedRound)
    ?? filteredRounds[0]
    ?? model.rounds[0];

  useEffect(() => {
    setShowAllEvents(false);
  }, [selectedRound]);

  if (!round) {
    return <Panel title="回合浏览"><p className="dak-muted">暂无回合数据</p></Panel>;
  }

  const eventLimit = 28;
  const visibleEvents = showAllEvents ? round.events : round.events.slice(0, eventLimit);
  const hiddenEventCount = round.events.length - visibleEvents.length;
  const hasFacets = model.rounds.some((row) => row.facets);
  const endReasons = [...new Set(model.rounds.map((row) => row.endReason))];
  const filterActive = filteredRounds.length !== model.rounds.length;
  const toggleSpecial = (key: keyof RoundFilterState["special"]) =>
    setFilter((prev) => ({ ...prev, special: { ...prev.special, [key]: !prev.special[key] } }));

  return (
    <div className="dak-selection-layout">
      <Panel title="回合时间线" eyebrow={filterActive ? `筛选命中 ${filteredRounds.length}/${model.rounds.length} 回合` : undefined}>
        <div className="dak-round-filterbar">
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
        <div className="dak-round-pills">
          {filteredRounds.map((row) => (
            <button
              key={row.roundNumber}
              className={row.roundNumber === round.roundNumber ? "dak-round-pill dak-round-pill-active" : "dak-round-pill"}
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
      <Panel title={`R${round.roundNumber} 详情`}>
        <div className="dak-round-detail">
          {onOpenReplay && (
            <button className="dak-timeline-more" type="button" onClick={() => onOpenReplay(round.roundNumber)}>
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
      </Panel>
    </div>
  );
}

function PlayerStoryPanel({ model, onOpenReplay }: MatchWorkspaceProps & { onOpenReplay?: (roundNumber: number, tick?: number) => void }) {
  const [selectedSteamId, setSelectedSteamId] = useState(model.players[0]?.row.steamId64 ?? "");
  const selected = model.players.find((player) => player.row.steamId64 === selectedSteamId) ?? model.players[0];

  if (!selected) {
    return <Panel title="选手视角"><p className="dak-muted">暂无选手数据</p></Panel>;
  }

  const roundSummary = summarizePlayerRoundFacts(selected.roundFacts);

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

function MapWorkspace({ model }: MatchWorkspaceProps) {
  const renderableLayers = model.map.modes.filter((mode): mode is typeof mode & { key: HeatmapLayer } => (
    mode.key === "death" || mode.key === "kill" || mode.key === "grenade"
  ));
  const [layer, setLayer] = useState<HeatmapLayer>(renderableLayers[0]?.key ?? "death");
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

/** 2D 回放叠加图层开关（v0.2）。 */
interface ReplayLayerState {
  trace: boolean;
  killLines: boolean;
  grenades: boolean;
}

export function ReplayViewer({ replay, map, target = null }: {
  replay: MatchWorkspaceModel["replay"];
  map: MatchWorkspaceModel["map"]["view"];
  /** 统计跳回放：定位到某回合（可选定位 tick）。 */
  target?: ReplayTarget | null;
}) {
  const [roundNumber, setRoundNumber] = useState(target?.roundNumber ?? replay.rounds[0]?.roundNumber ?? 1);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [layers, setLayers] = useState<ReplayLayerState>({ trace: false, killLines: true, grenades: true });
  // de_nuke / de_vertigo：上下双层雷达。当前层实心、另一层半透明幽灵显示，
  // 道具效果与 C4 只画在所属层。
  const calibration = getMapCalibration(map.name);
  const dualLevel = !!(calibration && hasLowerLevel(calibration) && map.lowerRadarImageUrl);
  const [level, setLevel] = useState<MapLevel>("upper");
  const levelOf = (z: number): MapLevel => (calibration ? levelAt(z, calibration) : "upper");
  const round = replay.rounds.find((row) => row.roundNumber === roundNumber) ?? replay.rounds[0];

  // 有效帧范围：数据实际帧数；officialEndTick 可能将 scrubber 延伸到更晚的 tick
  const lastDataFrameIndex = round ? Math.max(round.frameCount - 1, 0) : 0;
  const officialEndFrameIndex = useMemo(() => {
    if (!round) return lastDataFrameIndex;
    if (round.officialEndTick == null) return lastDataFrameIndex;
    const computed = Math.round((round.officialEndTick - round.startTick) / round.tickStep);
    return Math.max(lastDataFrameIndex, computed);
  }, [round, lastDataFrameIndex]);

  useEffect(() => {
    setFrameIndex(0);
    setPlaying(false);
  }, [roundNumber]);

  // 统计跳回放：target 变化时切回合并定位帧
  useEffect(() => {
    if (!target) return;
    const targetRound = replay.rounds.find((row) => row.roundNumber === target.roundNumber);
    if (!targetRound) return;
    setRoundNumber(target.roundNumber);
    setPlaying(false);
    if (target.tick != null) {
      const endIdx = targetRound.officialEndTick != null
        ? Math.max(targetRound.frameCount - 1, Math.round((targetRound.officialEndTick - targetRound.startTick) / targetRound.tickStep))
        : targetRound.frameCount - 1;
      const idx = Math.round((target.tick - targetRound.startTick) / targetRound.tickStep);
      setFrameIndex(Math.max(0, Math.min(endIdx, idx)));
    } else {
      setFrameIndex(0);
    }
  }, [target?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing || !round || officialEndFrameIndex <= 0) return undefined;
    const msPerFrame = Math.max(35, 1000 / ((replay.sampleRate ?? 8) * speed));
    const timer = window.setInterval(() => {
      setFrameIndex((value) => {
        if (value >= officialEndFrameIndex) {
          setPlaying(false);
          return officialEndFrameIndex;
        }
        return value + 1;
      });
    }, msPerFrame);
    return () => window.clearInterval(timer);
  }, [playing, replay.sampleRate, officialEndFrameIndex, speed]);

  // Stable per-player numbers: teamA → 1-5, teamB → 6-0.
  // Computed from round.players order so the mapping is consistent across frames.
  const playerNumbers = useMemo(() => {
    const result: Record<string, string> = {};
    if (!round) return result;
    round.players.filter((p) => p.teamKey === "teamA").forEach((p, i) => { result[p.steamId64] = String(i + 1); });
    round.players.filter((p) => p.teamKey === "teamB").forEach((p, i) => { result[p.steamId64] = String((i + 6) % 10); });
    return result;
  }, [round]);

  if (!replay.available || !round) {
    return <Panel title="2D 回放"><p className="dak-muted">该导出包不含回放流。</p></Panel>;
  }

  const currentFrameIndex = Math.min(frameIndex, officialEndFrameIndex);
  // 数据帧 clamp：超出实际录制帧数时冻结在最后一帧
  const dataFrameIndex = Math.min(currentFrameIndex, lastDataFrameIndex);
  const currentTick = round.startTick + currentFrameIndex * round.tickStep;
  const endTick = round.startTick + officialEndFrameIndex * round.tickStep;

  // 2D 时间轴锚点：首杀 / 每次击杀 / 下包拆包（freeze end = 起点本身）
  const anchors = useMemo(() => {
    const list: { tick: number; kind: string; label: string }[] = [];
    round.kills.forEach((kill, i) => {
      list.push({ tick: kill.tick, kind: i === 0 ? "firstkill" : "kill", label: `${i === 0 ? "首杀" : "击杀"}：${kill.killerName ?? "?"} → ${kill.victimName}` });
    });
    if (round.bomb) {
      list.push({ tick: round.bomb.plantTick, kind: "bomb", label: "下包" });
      if (round.bomb.defuseTick != null) list.push({ tick: round.bomb.defuseTick, kind: "defuse", label: "拆包" });
    }
    return list.filter((a) => a.tick >= round.startTick && a.tick <= endTick);
  }, [round, endTick]);
  const seekTick = (tick: number) => {
    setPlaying(false);
    setFrameIndex(Math.max(0, Math.min(officialEndFrameIndex, Math.round((tick - round.startTick) / round.tickStep))));
  };
  // 帧数据访问用 dataFrameIndex（clamp 到实际录制范围），让超出部分冻结在最后帧
  const currentPlayers = round.players
    .map((player) => ({ player, frame: player.frames[dataFrameIndex] ?? player.frames.find((frame) => frame.alive) ?? player.frames[0] }))
    .filter((row): row is { player: WorkspaceReplayRound["players"][number]; frame: WorkspaceReplayFrame } => Boolean(row.frame));

  return (
    <div className="dak-replay-layout">
      <Panel title="回放控制">
        <div className="dak-round-pills">
          {replay.rounds.map((row) => (
            <button
              key={row.roundNumber}
              className={row.roundNumber === round.roundNumber ? "dak-round-pill dak-round-pill-active" : "dak-round-pill"}
              type="button"
              onClick={() => setRoundNumber(row.roundNumber)}
            >
              <span>R{row.roundNumber}</span>
              <small>{row.frameCount} 帧</small>
            </button>
          ))}
        </div>
        <div className="dak-playback">
          <button className="dak-play-button" type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "暂停" : "播放"}>
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="dak-icon-button" type="button" onClick={() => setFrameIndex((value) => Math.max(0, value - Math.max(1, Math.round((replay.sampleRate ?? 8) / 2))))} aria-label="后退">
            <ChevronLeft size={17} />
          </button>
          <div className="dak-scrubber-wrap">
            <div className="dak-scrubber-anchors" aria-hidden="true">
              {anchors.map((anchor, i) => (
                <button
                  key={`${anchor.tick}-${i}`}
                  type="button"
                  className={`dak-scrubber-anchor dak-scrubber-anchor-${anchor.kind}`}
                  style={{ left: `${endTick > round.startTick ? ((anchor.tick - round.startTick) / (endTick - round.startTick)) * 100 : 0}%` }}
                  title={anchor.label}
                  onClick={() => seekTick(anchor.tick)}
                />
              ))}
            </div>
            <input
              className="dak-scrubber"
              type="range"
              min={0}
              max={officialEndFrameIndex}
              value={currentFrameIndex}
              onChange={(event) => setFrameIndex(Number(event.target.value))}
            />
          </div>
          <button className="dak-icon-button" type="button" onClick={() => setFrameIndex((value) => Math.min(officialEndFrameIndex, value + Math.max(1, Math.round((replay.sampleRate ?? 8) / 2))))} aria-label="前进">
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="dak-speed-group" role="group" aria-label="叠加图层">
          {([
            ["trace", "走位轨迹"],
            ["killLines", "击杀连线"],
            ["grenades", "道具"]
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={layers[key] ? "dak-speed dak-speed-active" : "dak-speed"}
              aria-pressed={layers[key]}
              onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
            >
              {label}
            </button>
          ))}
        </div>
        {dualLevel && (
          <div className="dak-speed-group" role="group" aria-label="地图层级">
            {(["upper", "lower"] as const).map((nextLevel) => (
              <button
                key={nextLevel}
                type="button"
                className={level === nextLevel ? "dak-speed dak-speed-active" : "dak-speed"}
                onClick={() => setLevel(nextLevel)}
              >
                {nextLevel === "upper" ? "上层" : "下层"}
              </button>
            ))}
          </div>
        )}
        <div className="dak-speed-group" role="group" aria-label="播放速度">
          {[0.5, 1, 2, 4].map((nextSpeed) => (
            <button
              key={nextSpeed}
              type="button"
              className={speed === nextSpeed ? "dak-speed dak-speed-active" : "dak-speed"}
              onClick={() => setSpeed(nextSpeed)}
            >
              {nextSpeed}x
            </button>
          ))}
        </div>
        <div className="dak-replay-meta">
          <Fact label="Tick" value={`${currentTick}`} />
          <Fact label="帧" value={`${currentFrameIndex + 1}/${round.frameCount}`} />
          <Fact label="采样率" value={`${replay.sampleRate ?? 0} Hz`} />
        </div>
      </Panel>
      <Panel title={`R${round.roundNumber} 2D 回放`}>
        <div
          className="dak-replay-stage"
          style={(() => {
            const url = dualLevel && level === "lower" ? map.lowerRadarImageUrl : map.radarImageUrl;
            return url ? { backgroundImage: `url(${url})` } : undefined;
          })()}
        >
          <div className="dak-replay-gridlines" aria-hidden="true" />
          <KillFeed kills={round.kills} currentTick={currentTick} tickrate={replay.tickrate} />
          {layers.trace && (
            <svg className="dak-replay-trajectories" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {currentPlayers.map(({ player, frame }) => {
                if (!frame.alive) return null;
                if (dualLevel && levelOf(frame.z) !== level) return null;
                // 最近 ~10 秒的走位轨迹（8 Hz × 80 帧）；clamp 到实际录制范围
                const traceFrames = player.frames.slice(Math.max(0, dataFrameIndex - 80), dataFrameIndex + 1).filter((f) => f.alive);
                if (traceFrames.length < 2) return null;
                const points = traceFrames.map((f) => {
                  const pos = replayPointPercent(f, map);
                  return `${pos.x},${pos.y}`;
                }).join(" ");
                return <polyline key={`trace-${player.steamId64}`} className={`dak-replay-playertrace dak-replay-playertrace-${player.teamKey}`} points={points} />;
              })}
            </svg>
          )}
          {layers.killLines && (
            <svg className="dak-replay-trajectories" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {round.kills.map((kill, i) => {
                // 击杀后保留 ~3 秒的连线
                if (kill.killerX == null || kill.victimX == null) return null;
                if (currentTick < kill.tick || currentTick > kill.tick + 3 * (replay.tickrate ?? 64)) return null;
                if (dualLevel && kill.victimZ != null && levelOf(kill.victimZ) !== level) return null;
                const from = replayPointPercent({ x: kill.killerX, y: kill.killerY ?? 0 }, map);
                const to = replayPointPercent({ x: kill.victimX, y: kill.victimY ?? 0 }, map);
                return (
                  <g key={`killline-${i}`}>
                    <line className="dak-replay-killline" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                    <circle className="dak-replay-killline-victim" cx={to.x} cy={to.y} r={0.7} />
                  </g>
                );
              })}
            </svg>
          )}
          {layers.grenades && <GrenadeEffectLayer round={round} currentTick={currentTick} tickrate={replay.tickrate ?? 64} map={map} level={dualLevel ? level : null} levelOf={levelOf} />}
          <BombMarker bomb={round.bomb} currentTick={currentTick} tickrate={replay.tickrate ?? 64} map={map} offLevel={dualLevel && round.bomb != null && levelOf(round.bomb.z ?? 0) !== level} />
          {(round.groundBombs ?? []).map((gb, gbIdx) => {
            if (currentTick < gb.startTick || currentTick > gb.endTick) return null;
            if (dualLevel && levelOf(gb.z ?? 0) !== level) return null;
            return (
              <span
                key={`gb-${gbIdx}`}
                className="dak-replay-bomb dak-replay-bomb-dropped"
                style={{ left: `${replayPointPercent(gb, map).x}%`, top: `${replayPointPercent(gb, map).y}%` }}
                title="C4 掉落"
                aria-hidden="true"
              >
                c4
              </span>
            );
          })}
          {currentPlayers.map(({ player, frame }) => (
            <div
              key={player.steamId64}
              className={`dak-replay-token dak-replay-token-${player.teamKey}${!frame.alive ? " dak-replay-token-dead" : ""}${frame.flashed ? " dak-replay-token-flashed" : ""}${dualLevel && levelOf(frame.z) !== level ? " dak-replay-token-offlevel" : ""}`}
              style={{ ...replayFramePosition(frame, map), transform: `translate(-50%, -50%) rotate(${90 - frame.yaw}deg)` }}
              title={`${playerNumbers[player.steamId64] ?? "?"} ${player.name} · ${frame.hp} HP${frame.hasDefuseKit ? " · 拆弹器" : ""}${frame.flashed ? " · flashed" : ""}`}
            >
              <span style={{ transform: `rotate(${frame.yaw - 90}deg)` }}>{playerNumbers[player.steamId64] ?? "?"}</span>
              {frame.hasDefuseKit && <i style={{ transform: `rotate(${frame.yaw - 90}deg)` }}>kit</i>}
              {frame.hasBomb && <i className="dak-replay-c4-tag" style={{ transform: `rotate(${frame.yaw - 90}deg)` }}>c4</i>}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="当前帧选手">
        <div className="dak-frame-player-list">
          {[...currentPlayers]
            .sort((a, b) => {
              // Sort by assigned player number; treat 0 (teamB slot 5) as 10 so order is 1-9,0
              const na = Number(playerNumbers[a.player.steamId64] ?? "99");
              const nb = Number(playerNumbers[b.player.steamId64] ?? "99");
              return (na === 0 ? 10 : na) - (nb === 0 ? 10 : nb);
            })
            .map(({ player, frame }) => {
              const main = mainWeaponSoFar(player.frames, dataFrameIndex);
              return (
                <div
                  className={`dak-frame-player-row${!frame.alive ? " dak-frame-player-row-dead" : ""}`}
                  key={player.steamId64}
                >
                  <span className={`dak-team-dot dak-team-dot-${player.teamKey}`} />
                  <span className="dak-frame-player-num">{playerNumbers[player.steamId64] ?? "?"}</span>
                  <span className="dak-frame-player-name">{player.name}</span>
                  <div className="dak-hp-bar-wrap" title={`${frame.hp} HP · 护甲 ${frame.armor}`}>
                    <div className="dak-hp-bar" style={{ width: `${frame.hp}%`, background: hpBarColor(frame.hp) }} />
                    {frame.armor > 0 && <div className="dak-armor-bar" style={{ width: `${frame.armor}%` }} />}
                  </div>
                  <small>
                    {frame.alive
                      ? `${main ? displayWeaponName(main) : frame.weapon ? displayWeaponName(frame.weapon) : "—"}${frame.armor > 0 ? " · 甲" : ""}${frame.hasDefuseKit ? " · kit" : ""}${frame.flashed ? " · flashed" : ""}`
                      : "阵亡"}
                  </small>
                </div>
              );
            })}
        </div>
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
  const quality = useMemo(() => buildMatchBuyQuality(model.economy), [model.economy]);
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

function Panel({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section className="dak-panel">
      <div className="dak-panel-header">
        <div>
          {eyebrow && <div className="dak-panel-eyebrow">{eyebrow}</div>}
          <h2 className="dak-panel-title">{title}</h2>
        </div>
      </div>
      <div className="dak-panel-body">{children}</div>
    </section>
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
  if (key === "map") return <Map size={16} />;
  return <Film size={16} />;
}

function detailForTab(key: WorkspaceView, model: MatchWorkspaceModel, replayDetail: string) {
  if (key === "overview") return model.scoreline;
  if (key === "rounds") return `${model.rounds.length} rounds`;
  if (key === "players") return `${model.players.length} players`;
  if (key === "economy") return `${model.economy.length} rows`;
  if (key === "weapons") return `${model.weapons.length} weapons`;
  if (key === "duels") return `${model.duels.players.length} players`;
  if (key === "map") return `${model.map.points.length} points`;
  return replayDetail;
}

function summarizePlayerRoundFacts(facts: MatchWorkspaceModel["players"][number]["roundFacts"]) {
  return facts.reduce(
    (summary, fact) => ({
      survived: summary.survived + (fact.survived ? 1 : 0),
      openingKills: summary.openingKills + (fact.openingDuel === "won" ? 1 : 0),
      tradeKills: summary.tradeKills + fact.tradeKills
    }),
    { survived: 0, openingKills: 0, tradeKills: 0 }
  );
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

function hpBarColor(hp: number): string {
  if (hp > 60) return "var(--dak-ok)";
  if (hp > 30) return "var(--dak-warn)";
  return "var(--dak-danger)";
}

/** 主武器（步枪/狙/冲锋/霰弹/机枪）与手枪的显示名称集合。
 *  frame.weapon 在 workspace 层已由 weaponNameForIndex → displayWeaponName 转为显示名。 */
const PRIMARY_WEAPONS = new Set([
  "AK-47", "M4A4", "M4A1-S", "Galil AR", "FAMAS", "SG 553", "AUG",
  "AWP", "SSG 08", "SCAR-20", "G3SG1",
  "MAC-10", "MP9", "MP7", "MP5-SD", "UMP-45", "P90", "PP-Bizon",
  "Nova", "XM1014", "MAG-7", "Sawed-Off", "M249", "Negev"
]);
const PISTOL_WEAPONS = new Set([
  "Desert Eagle", "R8 Revolver", "Glock-18", "USP-S", "P2000", "P250",
  "Five-SeveN", "Tec-9", "CZ75-Auto", "Dual Berettas"
]);

/** 本回合至当前帧最近持有的主武器；没碰过主武器则显示最近持有的手枪。
 *  回放流只记当前手持武器，切刀/掏雷时用持枪历史回推背包。 */
function mainWeaponSoFar(frames: WorkspaceReplayFrame[], uptoIndex: number): string | null {
  let primary: string | null = null;
  let pistol: string | null = null;
  for (let i = 0; i <= uptoIndex && i < frames.length; i += 1) {
    const w = frames[i]?.weapon;
    if (!w) continue;
    if (PRIMARY_WEAPONS.has(w)) primary = w;
    else if (PISTOL_WEAPONS.has(w)) pistol = w;
  }
  return primary ?? pistol;
}

function replayPointPercent(frame: { x: number; y: number }, map: MatchWorkspaceModel["map"]["view"]) {
  const calibration = getMapCalibration(map.name);
  if (calibration) {
    const radar = worldToRadar(frame, calibration);
    if (!radar.outOfBounds) {
      return {
        x: (radar.x / calibration.radarSize) * 100,
        y: (radar.y / calibration.radarSize) * 100
      };
    }
  }
  return {
    x: Math.max(4, Math.min(96, 50 + frame.x / 70)),
    y: Math.max(4, Math.min(96, 50 - frame.y / 70))
  };
}

function replayFramePosition(frame: { x: number; y: number }, map: MatchWorkspaceModel["map"]["view"]) {
  const pos = replayPointPercent(frame, map);
  return { left: `${pos.x}%`, top: `${pos.y}%` };
}

/** world 半径 → 相对舞台宽度的百分比；无标定时给一个保底视觉尺寸。 */
function replayRadiusPercent(radiusUnits: number, map: MatchWorkspaceModel["map"]["view"]): number {
  const calibration = getMapCalibration(map.name);
  if (!calibration) return 4;
  return (radiusUnits / calibration.scale / calibration.radarSize) * 100;
}

// 效果消失 tick 缺失时的保底时长（秒）；半径为近似游戏单位，只服务视觉示意。
const GRENADE_EFFECT_DEFAULTS: Record<string, { durationSeconds: number; radiusUnits: number; kind: "smoke" | "fire" | "he" | "flash" | "decoy" }> = {
  smoke: { durationSeconds: 20, radiusUnits: 144, kind: "smoke" },
  molotov: { durationSeconds: 7, radiusUnits: 120, kind: "fire" },
  incendiary: { durationSeconds: 5.5, radiusUnits: 120, kind: "fire" },
  hegrenade: { durationSeconds: 0.7, radiusUnits: 90, kind: "he" },
  flashbang: { durationSeconds: 0.7, radiusUnits: 70, kind: "flash" },
  decoy: { durationSeconds: 15, radiusUnits: 30, kind: "decoy" }
};

type ReplayRoundModel = MatchWorkspaceModel["replay"]["rounds"][number];

/** 道具效果（烟/火/爆/闪）+ 飞行轨迹叠加层，按 currentTick 过滤生命周期。
 *  level 非 null 时（双层地图）效果只画在所属层，飞行物按当前帧 z 过滤。 */
function GrenadeEffectLayer({ round, currentTick, tickrate, map, level = null, levelOf }: {
  round: ReplayRoundModel;
  currentTick: number;
  tickrate: number;
  map: MatchWorkspaceModel["map"]["view"];
  level?: MapLevel | null;
  levelOf?: (z: number) => MapLevel;
}) {
  return (
    <>
      {round.grenades.map((row, index) => {
        const spec = GRENADE_EFFECT_DEFAULTS[row.grenade];
        if (!spec) return null;
        const endTick = row.destroyTick ?? row.effectTick + spec.durationSeconds * tickrate;
        if (currentTick < row.effectTick || currentTick > endTick) return null;
        if (level && levelOf && levelOf(row.effectZ ?? 0) !== level) return null;
        const sizePercent = replayRadiusPercent(spec.radiusUnits, map) * 2;
        const countdown = spec.kind === "smoke" ? Math.max(0, Math.ceil((endTick - currentTick) / tickrate)) : null;
        return (
          <span
            key={`fx-${index}`}
            className={`dak-replay-fx dak-replay-fx-${spec.kind}`}
            style={{ ...replayFramePosition({ x: row.effectX, y: row.effectY }, map), width: `${sizePercent}%`, height: `${sizePercent}%` }}
            aria-hidden="true"
          >
            {countdown != null && <span className="dak-replay-fx-countdown">{countdown}</span>}
          </span>
        );
      })}
      <svg className="dak-replay-trajectories" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {round.projectiles.map((proj, index) => {
          const frameIdx = Math.floor((currentTick - proj.startTick) / round.tickStep);
          if (frameIdx < 0 || frameIdx >= proj.x.length) return null;
          const points = proj.x
            .slice(0, frameIdx + 1)
            .map((x, i) => {
              const pos = replayPointPercent({ x, y: proj.y[i] }, map);
              return `${pos.x},${pos.y}`;
            })
            .join(" ");
          return (
            <polyline
              key={`trail-${index}`}
              className={`dak-replay-trail dak-replay-trail-${proj.grenade}`}
              points={points}
            />
          );
        })}
      </svg>
      {round.projectiles.map((proj, index) => {
        const frameIdx = Math.floor((currentTick - proj.startTick) / round.tickStep);
        if (frameIdx < 0 || frameIdx >= proj.x.length) return null;
        const projZ = proj.z?.[frameIdx];
        if (level && levelOf && projZ != null && levelOf(projZ) !== level) return null;
        return (
          <span
            key={`proj-${index}`}
            className={`dak-replay-projectile dak-replay-projectile-${proj.grenade}`}
            style={replayFramePosition({ x: proj.x[frameIdx], y: proj.y[frameIdx] }, map)}
            aria-hidden="true"
          />
        );
      })}
    </>
  );
}

/** 下包后的 C4 定点标记：拆除转绿、爆炸先闪后熄。 */
function BombMarker({ bomb, currentTick, tickrate, map, offLevel = false }: {
  bomb: ReplayRoundModel["bomb"];
  currentTick: number;
  tickrate: number;
  map: MatchWorkspaceModel["map"]["view"];
  /** 双层地图且 C4 在另一层时隐藏。 */
  offLevel?: boolean;
}) {
  if (!bomb || currentTick < bomb.plantTick || offLevel) return null;
  const defused = bomb.defuseTick != null && currentTick >= bomb.defuseTick;
  const exploded = !defused && bomb.explodeTick != null && currentTick >= bomb.explodeTick;
  const exploding = exploded && bomb.explodeTick != null && currentTick <= bomb.explodeTick + 2 * tickrate;
  const state = defused ? "defused" : exploded ? (exploding ? "exploding" : "exploded") : "armed";
  return (
    <span className={`dak-replay-bomb dak-replay-bomb-${state}`} style={replayFramePosition(bomb, map)} title={defused ? "C4 已拆除" : exploded ? "C4 已爆炸" : "C4 已安放"}>
      c4
    </span>
  );
}

export function AdminQaWorkspace({ model }: MatchWorkspaceProps) {
  return (
    <main className="dak-shell">
      <div className="dak-workspace">
        <Panel title="Admin QA">
          <div className="dak-qa-summary">
            <ShieldCheck size={16} />
            <span>{model.adminQa.ok ? "通过" : "需要检查"}</span>
            <span>{model.adminQa.summary.issueCount} issue(s)</span>
            <span>{model.adminQa.summary.errorCount} error(s)</span>
            <span>{model.adminQa.summary.warningCount} warning(s)</span>
          </div>
        </Panel>
      </div>
    </main>
  );
}
