import type { MatchWorkspaceModel, WorkspaceReplayFrame, WorkspaceReplayRound, WorkspaceSpatialPoint } from "@cs2dak/contract";
import { displayWeaponName, sideLabel, economyLabelCn } from "@cs2dak/presentation";
import { getMapCalibration, worldToRadar } from "@cs2dak/maps";
import { Activity, BarChart3, ChevronLeft, ChevronRight, Crosshair, Film, Gauge, ListChecks, Map, Pause, Play, ShieldCheck, Swords, Table2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EconomyPanel } from "./EconomyPanel";
import { HeatmapCanvas } from "./HeatmapCanvas";
import { KillFeed } from "./KillFeed";
import { ScoreboardTable } from "./ScoreboardTable";

export interface MatchWorkspaceProps {
  model: MatchWorkspaceModel;
}

type WorkspaceView = MatchWorkspaceModel["tabs"][number]["key"];
type HeatmapLayer = Extract<WorkspaceSpatialPoint["kind"], "death" | "kill" | "grenade">;

export function MatchWorkspace({ model }: MatchWorkspaceProps) {
  const [view, setView] = useState<WorkspaceView>("overview");
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
            {view === "rounds" && <RoundExplorer model={model} />}
            {view === "players" && <PlayerStoryPanel model={model} />}
            {view === "economy" && (
              <Panel title="经济走势">
                <EconomyPanel points={model.economy} teamAName={model.teams.teamA.name} teamBName={model.teams.teamB.name} />
              </Panel>
            )}
            {view === "weapons" && <WeaponsView model={model} />}
            {view === "duels" && <DuelsView model={model} />}
            {view === "map" && <MapWorkspace model={model} />}
            {view === "replay" && <ReplayViewer replay={model.replay} map={model.map.view} />}
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
            <ModuleAction icon={<Film size={16} />} label="2D 回放" value={model.replay.available ? `${model.replay.sampleRate ?? 0} Hz` : "无回放"} detail={model.replay.capabilities.hasDefuseKit ? "含拆弹器状态" : "无拆弹器状态"} onClick={() => onNavigate("replay")} />
          </div>
        </Panel>
        <Panel title="地图状态">
          <MapModeList model={model} />
        </Panel>
      </aside>
    </div>
  );
}

function RoundExplorer({ model }: MatchWorkspaceProps) {
  const [selectedRound, setSelectedRound] = useState(model.rounds[0]?.roundNumber ?? 1);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const round = model.rounds.find((row) => row.roundNumber === selectedRound) ?? model.rounds[0];

  useEffect(() => {
    setShowAllEvents(false);
  }, [selectedRound]);

  if (!round) {
    return <Panel title="回合浏览"><p className="dak-muted">暂无回合数据</p></Panel>;
  }

  const eventLimit = 28;
  const visibleEvents = showAllEvents ? round.events : round.events.slice(0, eventLimit);
  const hiddenEventCount = round.events.length - visibleEvents.length;

  return (
    <div className="dak-selection-layout">
      <Panel title="回合时间线">
        <div className="dak-round-pills">
          {model.rounds.map((row) => (
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
        </div>
      </Panel>
      <Panel title={`R${round.roundNumber} 详情`}>
        <div className="dak-round-detail">
          <div className="dak-fact-grid">
            <Fact label="比分" value={round.scoreBefore} />
            <Fact label="胜方" value={round.winnerSide.toUpperCase()} />
            <Fact label="A 队经济" value={round.teamAEconomy} />
            <Fact label="B 队经济" value={round.teamBEconomy} />
          </div>
          <div className="dak-timeline">
            {visibleEvents.map((event) => (
              <div className="dak-timeline-row" key={event.id}>
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

function PlayerStoryPanel({ model }: MatchWorkspaceProps) {
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
        {selected.roundFacts.length > 0 && (
          <div className="dak-player-roundfacts">
            {selected.roundFacts.slice(0, 18).map((fact) => (
              <article className="dak-player-round-card" key={`${fact.steamId64}-${fact.roundNumber}`}>
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

export function ReplayViewer({ replay, map }: { replay: MatchWorkspaceModel["replay"]; map: MatchWorkspaceModel["map"]["view"] }) {
  const [roundNumber, setRoundNumber] = useState(replay.rounds[0]?.roundNumber ?? 1);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const round = replay.rounds.find((row) => row.roundNumber === roundNumber) ?? replay.rounds[0];

  useEffect(() => {
    setFrameIndex(0);
    setPlaying(false);
  }, [roundNumber]);

  useEffect(() => {
    if (!playing || !round || round.frameCount <= 1) return undefined;
    const msPerFrame = Math.max(35, 1000 / ((replay.sampleRate ?? 8) * speed));
    const timer = window.setInterval(() => {
      setFrameIndex((value) => {
        if (value >= round.frameCount - 1) {
          setPlaying(false);
          return round.frameCount - 1;
        }
        return value + 1;
      });
    }, msPerFrame);
    return () => window.clearInterval(timer);
  }, [playing, replay.sampleRate, round?.frameCount, speed]);

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

  const currentFrameIndex = Math.min(frameIndex, Math.max(round.frameCount - 1, 0));
  const currentTick = round.startTick + currentFrameIndex * round.tickStep;
  const currentPlayers = round.players
    .map((player) => ({ player, frame: player.frames[currentFrameIndex] ?? player.frames.find((frame) => frame.alive) ?? player.frames[0] }))
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
          <input
            className="dak-scrubber"
            type="range"
            min={0}
            max={Math.max(round.frameCount - 1, 0)}
            value={currentFrameIndex}
            onChange={(event) => setFrameIndex(Number(event.target.value))}
          />
          <button className="dak-icon-button" type="button" onClick={() => setFrameIndex((value) => Math.min(round.frameCount - 1, value + Math.max(1, Math.round((replay.sampleRate ?? 8) / 2))))} aria-label="前进">
            <ChevronRight size={17} />
          </button>
        </div>
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
          <Fact label="拆弹器" value={replay.capabilities.hasDefuseKit ? "可显示" : "无状态"} />
        </div>
      </Panel>
      <Panel title={`R${round.roundNumber} 2D 回放`}>
        <div
          className="dak-replay-stage"
          style={map.radarImageUrl ? { backgroundImage: `url(${map.radarImageUrl})` } : undefined}
        >
          <div className="dak-replay-gridlines" aria-hidden="true" />
          <KillFeed kills={round.kills} currentTick={currentTick} tickrate={replay.tickrate} />
          <GrenadeEffectLayer round={round} currentTick={currentTick} tickrate={replay.tickrate ?? 64} map={map} />
          <BombMarker bomb={round.bomb} currentTick={currentTick} tickrate={replay.tickrate ?? 64} map={map} />
          {currentPlayers.map(({ player, frame }) => (
            <div
              key={player.steamId64}
              className={`dak-replay-token dak-replay-token-${player.teamKey}${!frame.alive ? " dak-replay-token-dead" : ""}${frame.flashed ? " dak-replay-token-flashed" : ""}`}
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
            .map(({ player, frame }) => (
              <div
                className={`dak-frame-player-row${!frame.alive ? " dak-frame-player-row-dead" : ""}`}
                key={player.steamId64}
              >
                <span className={`dak-team-dot dak-team-dot-${player.teamKey}`} />
                <span className="dak-frame-player-num">{playerNumbers[player.steamId64] ?? "?"}</span>
                <span className="dak-frame-player-name">{player.name}</span>
                <div className="dak-hp-bar-wrap" title={`${frame.hp} HP`}>
                  <div className="dak-hp-bar" style={{ width: `${frame.hp}%`, background: hpBarColor(frame.hp) }} />
                </div>
                <small>
                  {frame.alive
                    ? `${frame.weapon ? displayWeaponName(frame.weapon) : "—"}${frame.hasDefuseKit ? " · kit" : ""}${frame.flashed ? " · flashed" : ""}`
                    : "阵亡"}
                </small>
              </div>
            ))}
        </div>
      </Panel>
    </div>
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
      <Panel title="开局对枪">
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

function replayFramePosition(frame: { x: number; y: number }, map: MatchWorkspaceModel["map"]["view"]) {
  const calibration = getMapCalibration(map.name);
  if (calibration) {
    const radar = worldToRadar(frame, calibration);
    if (!radar.outOfBounds) {
      return {
        left: `${(radar.x / calibration.radarSize) * 100}%`,
        top: `${(radar.y / calibration.radarSize) * 100}%`
      };
    }
  }
  return {
    left: `${Math.max(4, Math.min(96, 50 + frame.x / 70))}%`,
    top: `${Math.max(4, Math.min(96, 50 - frame.y / 70))}%`
  };
}

/** world 半径 → 相对舞台宽度的百分比；无标定时给一个保底视觉尺寸。 */
function replayRadiusPercent(radiusUnits: number, map: MatchWorkspaceModel["map"]["view"]): number {
  const calibration = getMapCalibration(map.name);
  if (!calibration) return 4;
  return (radiusUnits / calibration.scale / calibration.radarSize) * 100;
}

// 效果消失 tick 缺失时的保底时长（秒）；半径为近似游戏单位，只服务视觉示意。
const GRENADE_EFFECT_DEFAULTS: Record<string, { durationSeconds: number; radiusUnits: number; kind: "smoke" | "fire" | "he" | "flash" | "decoy" }> = {
  smoke: { durationSeconds: 18, radiusUnits: 144, kind: "smoke" },
  molotov: { durationSeconds: 7, radiusUnits: 120, kind: "fire" },
  incendiary: { durationSeconds: 7, radiusUnits: 120, kind: "fire" },
  hegrenade: { durationSeconds: 0.7, radiusUnits: 90, kind: "he" },
  flashbang: { durationSeconds: 0.7, radiusUnits: 70, kind: "flash" },
  decoy: { durationSeconds: 15, radiusUnits: 30, kind: "decoy" }
};

type ReplayRoundModel = MatchWorkspaceModel["replay"]["rounds"][number];

/** 道具效果（烟/火/爆/闪）+ 飞行轨迹叠加层，按 currentTick 过滤生命周期。 */
function GrenadeEffectLayer({ round, currentTick, tickrate, map }: {
  round: ReplayRoundModel;
  currentTick: number;
  tickrate: number;
  map: MatchWorkspaceModel["map"]["view"];
}) {
  return (
    <>
      {round.grenades.map((row, index) => {
        const spec = GRENADE_EFFECT_DEFAULTS[row.grenade];
        if (!spec) return null;
        const endTick = row.destroyTick ?? row.effectTick + spec.durationSeconds * tickrate;
        if (currentTick < row.effectTick || currentTick > endTick) return null;
        const sizePercent = replayRadiusPercent(spec.radiusUnits, map) * 2;
        return (
          <span
            key={`fx-${index}`}
            className={`dak-replay-fx dak-replay-fx-${spec.kind}`}
            style={{ ...replayFramePosition({ x: row.effectX, y: row.effectY }, map), width: `${sizePercent}%`, height: `${sizePercent}%` }}
            aria-hidden="true"
          />
        );
      })}
      {round.projectiles.map((proj, index) => {
        const frameIdx = Math.floor((currentTick - proj.startTick) / round.tickStep);
        if (frameIdx < 0 || frameIdx >= proj.x.length) return null;
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
function BombMarker({ bomb, currentTick, tickrate, map }: {
  bomb: ReplayRoundModel["bomb"];
  currentTick: number;
  tickrate: number;
  map: MatchWorkspaceModel["map"]["view"];
}) {
  if (!bomb || currentTick < bomb.plantTick) return null;
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
