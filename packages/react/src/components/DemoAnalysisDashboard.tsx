import type { DemoViewModel } from "@cs2dak/contract";
import { Activity, Crosshair, Gauge, ListChecks, Map, ShieldAlert, Table2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { EconomyPanel } from "./EconomyPanel";
import { HeatmapCanvas } from "./HeatmapCanvas";
import { QaReportPanel } from "./QaReportPanel";
import { RoundTimeline } from "./RoundTimeline";
import { ScoreboardTable } from "./ScoreboardTable";

export interface DemoAnalysisDashboardProps {
  model: DemoViewModel;
}

type ViewKey = "overview" | "rounds" | "spatial" | "qa";

export function DemoAnalysisDashboard({ model }: DemoAnalysisDashboardProps) {
  const [view, setView] = useState<ViewKey>("overview");
  const topPlayer = model.scoreboard[0];
  const economySwing = useMemo(
    () => model.economy.reduce((max, point) => Math.max(max, Math.abs(point.advantage)), 0),
    [model.economy]
  );

  return (
    <main className="dak-shell">
      <div className="dak-workspace">
        <header className="dak-header">
          <div>
            <div className="dak-eyebrow">CS2 Demo Analysis Kit</div>
            <h1 className="dak-title">{model.title}</h1>
            <p className="dak-subtitle">{model.subtitle}</p>
          </div>
          <div className="dak-scoreblock">
            <div className="dak-scoreline">{model.scoreline}</div>
            <div className="dak-mapline">{model.map.name}</div>
          </div>
        </header>

        <section className="dak-kpi-strip">
          <Metric icon={<Gauge size={16} />} label="最高 V2 RR" value={topPlayer ? topPlayer.accountRR.toFixed(3) : "0.000"} detail={topPlayer?.name ?? "暂无选手"} />
          <Metric icon={<Crosshair size={16} />} label="最高 ADR" value={topPlayer ? topPlayer.adr.toFixed(1) : "0.0"} detail="来自伤害统计" />
          <Metric icon={<Activity size={16} />} label="最大装备差" value={`$${economySwing.toLocaleString()}`} detail={`${model.economy.length} 回合`} />
          <Metric icon={<ShieldAlert size={16} />} label="数据检查" value={model.qa.summary.issueCount.toString()} detail={model.qa.ok ? "通过" : "需要检查"} />
        </section>

        <nav className="dak-tabs" aria-label="Analysis views">
          <TabButton active={view === "overview"} icon={<Table2 size={16} />} label="总览" onClick={() => setView("overview")} />
          <TabButton active={view === "rounds"} icon={<ListChecks size={16} />} label="回合" onClick={() => setView("rounds")} />
          <TabButton active={view === "spatial"} icon={<Map size={16} />} label="地图" onClick={() => setView("spatial")} />
          <TabButton active={view === "qa"} icon={<ShieldAlert size={16} />} label="检查" onClick={() => setView("qa")} />
        </nav>

        {view === "overview" && (
          <div className="dak-grid">
            <section className="dak-stack">
              <Panel title="选手数据 / RR">
              <ScoreboardTable rows={model.scoreboard} />
              </Panel>
              <Panel title="经济走势">
              <EconomyPanel
                points={model.economy}
                teamAName={model.teams.teamA.name}
                teamBName={model.teams.teamB.name}
              />
              </Panel>
            </section>

            <aside className="dak-stack">
              <Panel title="地图热力图">
                <HeatmapCanvas map={model.map} points={model.heatmap} />
              </Panel>
              <Panel title="回合事件">
              <RoundTimeline events={model.timeline} />
              </Panel>
            </aside>
          </div>
        )}

        {view === "rounds" && (
          <div className="dak-grid dak-grid-even">
            <Panel title="回合事件">
              <RoundTimeline events={model.timeline} />
            </Panel>
            <Panel title="选手回合明细">
              <div className="dak-roundfact-list">
                {model.playerRoundFacts.slice(0, 80).map((fact) => (
                  <div className="dak-roundfact-row" key={`${fact.roundNumber}-${fact.steamId64}`}>
                    <span className="dak-badge">R{fact.roundNumber}</span>
                    <span>{fact.name}</span>
                    <span className="dak-muted">{sideLabel(fact.side)} · {economyLabel(fact.economyType)}</span>
                    <span className="dak-mono">{fact.kills}/{fact.deaths}/{fact.assists}</span>
                    <span className="dak-tags">{fact.kastTags.length > 0 ? fact.kastTags.map(kastLabel).join("、") : "无贡献回合"}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {view === "spatial" && (
          <div className="dak-grid dak-grid-even">
            <Panel title="热力图">
              <HeatmapCanvas map={model.map} points={model.heatmap} />
            </Panel>
            <Panel title="经济走势">
              <EconomyPanel points={model.economy} teamAName={model.teams.teamA.name} teamBName={model.teams.teamB.name} />
            </Panel>
          </div>
        )}

        {view === "qa" && (
          <Panel title="数据检查">
            <QaReportPanel report={model.qa} />
          </Panel>
        )}
      </div>
    </main>
  );
}

function sideLabel(side: string) {
  return side === "t" ? "进攻方" : "防守方";
}

function economyLabel(type: string | null) {
  const labels: Record<string, string> = {
    pistol: "手枪局",
    eco: "ECO",
    semi: "半起",
    force: "强起",
    full: "长枪"
  };
  return type ? labels[type] ?? type : "未知经济";
}

function kastLabel(tag: string) {
  const labels: Record<string, string> = {
    kill: "击杀",
    assist: "助攻",
    survive: "存活",
    trade: "被补枪"
  };
  return labels[tag] ?? tag;
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

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={active ? "dak-tab dak-tab-active" : "dak-tab"} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
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
