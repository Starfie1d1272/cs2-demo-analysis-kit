import type { MatchWorkspaceModel, WorkspaceReplayRound, WorkspaceSpatialPoint } from "@cs2dak/contract";
import { Activity, BarChart3, Crosshair, Film, Gauge, ListChecks, Map, ShieldCheck, Table2, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { EconomyPanel } from "./EconomyPanel";
import { HeatmapCanvas } from "./HeatmapCanvas";
import { ScoreboardTable } from "./ScoreboardTable";

export interface MatchWorkspaceProps {
  model: MatchWorkspaceModel;
}

type WorkspaceView = MatchWorkspaceModel["tabs"][number]["key"];

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

        <section className="dak-kpi-strip">
          {model.overview.kpis.map((kpi) => (
            <Metric key={kpi.key} icon={iconForKpi(kpi.key)} label={kpi.label} value={kpi.value} detail={kpi.detail} />
          ))}
        </section>

        <section className="dak-module-strip" aria-label="Workspace modules">
          <ModuleSummary icon={<ListChecks size={15} />} label="回合" value={`${model.rounds.length}`} detail="可按回合浏览事件" />
          <ModuleSummary icon={<Users size={15} />} label="选手" value={`${model.players.length}`} detail="RR 与个人故事" />
          <ModuleSummary icon={<Map size={15} />} label="地图" value={`${model.map.points.length}`} detail={model.map.status.message ?? "空间点已就绪"} />
          <ModuleSummary icon={<Film size={15} />} label="回放" value={replayDetail} detail={model.replay.capabilities.hasDefuseKit ? "含拆弹器状态" : "无拆弹器状态"} />
        </section>

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
            </button>
          ))}
        </nav>

        {view === "overview" && <OverviewView model={model} />}
        {view === "rounds" && <RoundExplorer model={model} />}
        {view === "players" && <PlayerStoryPanel model={model} />}
        {view === "economy" && (
          <Panel title="经济走势">
            <EconomyPanel points={model.economy} teamAName={model.teams.teamA.name} teamBName={model.teams.teamB.name} />
          </Panel>
        )}
        {view === "map" && <MapWorkspace model={model} />}
        {view === "replay" && <ReplayViewer replay={model.replay} />}
      </div>
    </main>
  );
}

function OverviewView({ model }: MatchWorkspaceProps) {
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
        <Panel title="回合入口">
          <RoundMiniList model={model} />
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
  const round = model.rounds.find((row) => row.roundNumber === selectedRound) ?? model.rounds[0];

  if (!round) {
    return <Panel title="回合浏览"><p className="dak-muted">暂无回合数据</p></Panel>;
  }

  return (
    <div className="dak-grid">
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
            {round.events.slice(0, 28).map((event) => (
              <div className="dak-timeline-row" key={event.id}>
                <span className="dak-mono dak-muted">{event.clockLabel}</span>
                <span className="dak-badge">{event.type}</span>
                <span>{event.label}</span>
              </div>
            ))}
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
        <div className="dak-breakdown">
          {selected.rrBreakdown.map((part) => (
            <div className="dak-breakdown-row" key={part.key}>
              <span>{part.label}</span>
              <meter min="-1" max="1" value={Math.max(-1, Math.min(1, part.value))} />
              <b className="dak-mono">{part.value.toFixed(3)}</b>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MapWorkspace({ model }: MatchWorkspaceProps) {
  const heatmapPoints = model.map.points
    .filter((point): point is WorkspaceSpatialPoint & { kind: "kill" | "death" | "grenade" } => (
      point.kind === "kill" || point.kind === "death" || point.kind === "grenade"
    ));

  return (
    <div className="dak-grid dak-grid-even">
      <Panel title="地图热力图">
        <HeatmapCanvas map={model.map.view} points={heatmapPoints} />
      </Panel>
      <Panel title="空间图层">
        <MapModeList model={model} />
        {model.map.status.message && <p className="dak-muted dak-note">{model.map.status.message}</p>}
      </Panel>
    </div>
  );
}

function ReplayViewer({ replay }: { replay: MatchWorkspaceModel["replay"] }) {
  const [roundNumber, setRoundNumber] = useState(replay.rounds[0]?.roundNumber ?? 1);
  const round = replay.rounds.find((row) => row.roundNumber === roundNumber) ?? replay.rounds[0];

  if (!replay.available || !round) {
    return <Panel title="2D 回放"><p className="dak-muted">该导出包不含回放流。</p></Panel>;
  }

  const firstFramePlayers = round.players.map((player) => ({ player, frame: player.frames.find((frame) => frame.alive) ?? player.frames[0] })).filter((row) => row.frame);

  return (
    <div className="dak-grid">
      <Panel title="回放控制">
        <div className="dak-replay-meta">
          <Fact label="采样率" value={`${replay.sampleRate ?? 0} Hz`} />
          <Fact label="Tickrate" value={`${replay.tickrate ?? 0}`} />
          <Fact label="拆弹器" value={replay.capabilities.hasDefuseKit ? "可显示" : "无状态"} />
          <Fact label="C4 位置" value={replay.capabilities.hasBombPosition ? "可显示" : "暂不显示"} />
        </div>
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
      </Panel>
      <Panel title={`R${round.roundNumber} 2D 帧预览`}>
        <div className="dak-replay-stage">
          {firstFramePlayers.map(({ player, frame }) => (
            <div
              key={player.steamId64}
              className={`dak-replay-token dak-replay-token-${player.teamKey}`}
              style={{ left: `${normalizeFrameCoord(frame!.x)}%`, top: `${normalizeFrameCoord(-frame!.y)}%` }}
              title={`${player.name} · ${frame!.hp} HP${frame!.hasDefuseKit ? " · 拆弹器" : ""}`}
            >
              <span>{player.name.slice(0, 2)}</span>
              {frame!.hasDefuseKit && <i>kit</i>}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function RoundMiniList({ model }: MatchWorkspaceProps) {
  return (
    <div className="dak-mini-rounds">
      {model.rounds.slice(0, 12).map((round) => (
        <div className="dak-mini-round" key={round.roundNumber}>
          <span className="dak-badge">R{round.roundNumber}</span>
          <span>{round.winnerSide.toUpperCase()}</span>
          <span className="dak-muted">{round.events.length} 事件</span>
        </div>
      ))}
    </div>
  );
}

function MapModeList({ model }: MatchWorkspaceProps) {
  return (
    <div className="dak-mode-list">
      {model.map.modes.map((mode) => (
        <div className="dak-mode-row" key={mode.key}>
          <span>{mode.label}</span>
          <b className="dak-mono">{mode.count}</b>
        </div>
      ))}
    </div>
  );
}

function ModuleSummary({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="dak-module-summary">
      <div className="dak-module-icon">{icon}</div>
      <div>
        <b>{label}</b>
        <span>{value}</span>
        <small>{detail}</small>
      </div>
    </div>
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

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dak-panel">
      <div className="dak-panel-header">
        <h2 className="dak-panel-title">{title}</h2>
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
