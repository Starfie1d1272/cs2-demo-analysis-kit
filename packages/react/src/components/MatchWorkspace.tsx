import type { MatchWorkspaceModel, WorkspaceReplayFrame, WorkspaceReplayRound, WorkspaceSpatialPoint } from "@cs2dak/contract";
import { Activity, BarChart3, ChevronLeft, ChevronRight, Crosshair, Film, Gauge, ListChecks, Map, Pause, Play, ShieldCheck, Table2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EconomyPanel } from "./EconomyPanel";
import { HeatmapCanvas } from "./HeatmapCanvas";
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
              <Panel title="经济走势" eyebrow="CS Demo Manager economy pattern">
                <EconomyPanel points={model.economy} teamAName={model.teams.teamA.name} teamBName={model.teams.teamB.name} />
              </Panel>
            )}
            {view === "map" && <MapWorkspace model={model} />}
            {view === "replay" && <ReplayViewer replay={model.replay} />}
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
        <Panel title="比赛主线" eyebrow="pr1maly match breakdown pattern">
          <div className="dak-story-list">
            {model.overview.story.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </Panel>
        <Panel title="选手数据 / RR" eyebrow="AWPy stats as calculation reference">
          <ScoreboardTable rows={model.scoreboard} />
        </Panel>
      </section>
      <aside className="dak-stack">
        <Panel title="模块入口" eyebrow="all rows are actionable">
          <div className="dak-module-actions">
            <ModuleAction icon={<ListChecks size={16} />} label="回合浏览" value={`${model.rounds.length} 回合`} detail="横向 timeline + selected round events" onClick={() => onNavigate("rounds")} />
            <ModuleAction icon={<Users size={16} />} label="选手视角" value={`${model.players.length} 名选手`} detail="RR breakdown + round facts" onClick={() => onNavigate("players")} />
            <ModuleAction icon={<Map size={16} />} label="地图图层" value={`${model.map.points.length} 点`} detail={model.map.status.message ?? "kill/death/grenade layers"} onClick={() => onNavigate("map")} />
            <ModuleAction icon={<Film size={16} />} label="2D 回放" value={model.replay.available ? `${model.replay.sampleRate ?? 0} Hz` : "无回放"} detail={model.replay.capabilities.hasDefuseKit ? "含拆弹器状态" : "无拆弹器状态"} onClick={() => onNavigate("replay")} />
          </div>
        </Panel>
        <Panel title="地图状态" eyebrow="data availability">
          <MapModeList model={model} />
        </Panel>
      </aside>
    </div>
  );
}

function RoundExplorer({ model }: MatchWorkspaceProps) {
  const [selectedRound, setSelectedRound] = useState(model.rounds[0]?.roundNumber ?? 1);
  const round = model.rounds.find((row) => row.roundNumber === selectedRound) ?? model.rounds[0];

  if (!round) {
    return <Panel title="回合浏览"><p className="dak-muted">暂无回合数据</p></Panel>;
  }

  return (
    <div className="dak-grid">
      <Panel title="回合时间线" eyebrow="RivalHub compact round strip pattern">
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
      <Panel title={`R${round.roundNumber} 详情`} eyebrow="event stream">
        <div className="dak-round-detail">
          <div className="dak-fact-grid">
            <Fact label="比分" value={round.scoreBefore} />
            <Fact label="胜方" value={round.winnerSide.toUpperCase()} />
            <Fact label="A 队经济" value={round.teamAEconomy} />
            <Fact label="B 队经济" value={round.teamBEconomy} />
          </div>
          <div className="dak-timeline">
            {round.events.slice(0, 28).map((event) => (
              <div className="dak-timeline-row" key={event.id}>
                <span className="dak-mono dak-muted">{event.clockLabel}</span>
                <span className="dak-badge">{event.type}</span>
                <span>{event.label}</span>
              </div>
            ))}
            {round.events.length > 28 && <div className="dak-timeline-more">还有 {round.events.length - 28} 条事件</div>}
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

  return (
    <div className="dak-grid">
      <Panel title="选手列表" eyebrow="CS Demo Manager player sidebar pattern">
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
      <Panel title={`${selected.row.name} 个人故事`} eyebrow="pr1maly narrative + RR accounts">
        <div className="dak-story-list">
          {selected.summary.map((line) => <p key={line}>{line}</p>)}
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
          <div className="dak-roundfact-list dak-player-roundfacts">
            {selected.roundFacts.slice(0, 14).map((fact) => (
              <div className="dak-roundfact-row" key={`${fact.steamId64}-${fact.roundNumber}`}>
                <span className="dak-badge">R{fact.roundNumber}</span>
                <span>{fact.teamKey}</span>
                <span>{fact.side.toUpperCase()}</span>
                <span className="dak-mono">{fact.kills}/{fact.deaths}/{fact.assists}</span>
                <span className="dak-tags">{roundFactSummary(fact)}</span>
              </div>
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
      <Panel title="地图热力图" eyebrow="RivalHub canvas + CS Demo Manager heatmap renderer pattern">
        <HeatmapCanvas map={model.map.view} points={heatmapPoints} mode={layer} onModeChange={setLayer} />
      </Panel>
      <Panel title="空间图层" eyebrow="clickable layers only">
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
        <MapModeList model={model} mutedKinds={["death", "kill", "grenade"]} />
        {model.map.status.message && <p className="dak-muted dak-note">{model.map.status.message}</p>}
      </Panel>
    </div>
  );
}

function ReplayViewer({ replay }: { replay: MatchWorkspaceModel["replay"] }) {
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
      <Panel title="回放控制" eyebrow="cs2-2d-demoviewer playback protocol pattern">
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
          <Fact label="C4 位置" value={replay.capabilities.hasBombPosition ? "可显示" : "暂不显示"} />
        </div>
      </Panel>
      <Panel title={`R${round.roundNumber} 2D 回放`} eyebrow="current frame player state">
        <div className="dak-replay-stage">
          <div className="dak-replay-gridlines" aria-hidden="true" />
          {currentPlayers.map(({ player, frame }) => (
            <div
              key={player.steamId64}
              className={`dak-replay-token dak-replay-token-${player.teamKey}${!frame.alive ? " dak-replay-token-dead" : ""}${frame.flashed ? " dak-replay-token-flashed" : ""}`}
              style={{ left: `${normalizeFrameCoord(frame.x)}%`, top: `${normalizeFrameCoord(-frame.y)}%`, transform: `translate(-50%, -50%) rotate(${frame.yaw}deg)` }}
              title={`${player.name} · ${frame.hp} HP${frame.hasDefuseKit ? " · 拆弹器" : ""}${frame.flashed ? " · flashed" : ""}`}
            >
              <span style={{ transform: `rotate(${-frame.yaw}deg)` }}>{player.name.slice(0, 2)}</span>
              {frame.hasDefuseKit && <i style={{ transform: `rotate(${-frame.yaw}deg)` }}>kit</i>}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="当前帧选手" eyebrow="player state sidebar">
        <div className="dak-frame-player-list">
          {currentPlayers.map(({ player, frame }) => (
            <div className="dak-frame-player-row" key={player.steamId64}>
              <span className={`dak-team-dot dak-team-dot-${player.teamKey}`} />
              <span>{player.name}</span>
              <b className="dak-mono">{frame.hp} HP</b>
              <small>{frame.weapon ?? "unarmed"}{frame.hasDefuseKit ? " · kit" : ""}{frame.flashed ? " · flashed" : ""}</small>
            </div>
          ))}
        </div>
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
  if (key === "map") return <Map size={16} />;
  return <Film size={16} />;
}

function detailForTab(key: WorkspaceView, model: MatchWorkspaceModel, replayDetail: string) {
  if (key === "overview") return model.scoreline;
  if (key === "rounds") return `${model.rounds.length} rounds`;
  if (key === "players") return `${model.players.length} players`;
  if (key === "economy") return `${model.economy.length} rows`;
  if (key === "map") return `${model.map.points.length} points`;
  return replayDetail;
}

function roundFactSummary(fact: MatchWorkspaceModel["players"][number]["roundFacts"][number]) {
  const tags: string[] = [...fact.kastTags];
  if (fact.openingDuel !== "none") tags.push(`open:${fact.openingDuel}`);
  if (fact.tradeKills > 0) tags.push(`trade+${fact.tradeKills}`);
  if (fact.tradedDeaths > 0) tags.push("traded");
  if (fact.flashAssists > 0) tags.push(`flash+${fact.flashAssists}`);
  if (!fact.survived) tags.push("death");
  return tags.join(", ") || fact.economyType || "standard";
}

function normalizeFrameCoord(value: number): number {
  return Math.max(4, Math.min(96, 50 + value / 70));
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
