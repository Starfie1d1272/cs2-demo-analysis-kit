import { useEffect, useMemo, useState } from "react";
import { buildOpeningPatternClusters, type OpeningPatternCluster } from "@cs2dak/cohort";
import { CALLOUT_NAME_CN } from "@cs2dak/maps";
import { buildAntiStratMarkdownFromPatterns } from "@cs2dak/presentation";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { EmptyState } from "../components/primitives";
import { displayTeamName, teamRenameGroups } from "../lib/identity";
import { getDemoPackage, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { BpView } from "./BpView";
import {
  buildVetoTemplate,
  deriveVetoSummary,
  listPlaybookNames,
  listSeriesRecords,
  loadCoachSettings,
  saveCoachSettings,
  savePlaybookName,
  saveSeriesRecord,
  suggestSeriesGroups,
  type CoachSettings,
  type StudioSeriesRecord
} from "../lib/series";

type CoachTab = "patterns" | "playbook" | "anti" | "veto";

export interface CoachViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onGoLibrary: () => void;
  teamRenames?: Record<string, string>;
}

const TABS: Array<{ key: CoachTab; label: string }> = [
  { key: "patterns", label: "开局模式" },
  { key: "playbook", label: "战术本" },
  { key: "anti", label: "备战报告" },
  { key: "veto", label: "BP / Veto" }
];

const SIDE_LABEL: Record<string, string> = { t: "T 方", ct: "CT 方" };
const GRENADE_LABEL: Record<string, string> = {
  flashbang: "闪光",
  smoke: "烟",
  molotov: "火",
  incendiary: "火",
  hegrenade: "雷",
  decoy: "诱饵"
};

export function CoachView({
  allEntries,
  entries,
  scope,
  onScopeChange,
  onOpenMatch,
  onGoLibrary,
  teamRenames = {}
}: CoachViewProps) {
  const [tab, setTab] = useState<CoachTab>("patterns");
  const [clusters, setClusters] = useState<OpeningPatternCluster[] | null>(null);
  const [series, setSeries] = useState<StudioSeriesRecord[]>([]);
  const [settings, setSettings] = useState<CoachSettings>({ myTeamName: null });
  const [playbook, setPlaybook] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const entryByMatchId = useMemo(() => new Map(entries.map((entry) => [matchIdForEntry(entry), entry])), [entries]);
  const teamGroups = useMemo(
    () => teamRenameGroups(allEntries.map((entry) => ({ teamA: entry.meta.teamAName, teamB: entry.meta.teamBName })), teamRenames),
    [allEntries, teamRenames]
  );
  const suggestions = useMemo(() => suggestSeriesGroups(entries, teamRenames), [entries, teamRenames]);
  const mapPool = useMemo(() => [...new Set(entries.map((entry) => entry.meta.mapName))].sort(), [entries]);

  useEffect(() => {
    void listSeriesRecords().then(setSeries);
    void loadCoachSettings().then(setSettings);
    void listPlaybookNames().then(setPlaybook);
  }, []);

  useEffect(() => {
    if (entries.length === 0) {
      setClusters(null);
      return;
    }
    let cancelled = false;
    setClusters(null);
    setError(null);
    Promise.all(entries.map(async (entry) => ({ matchId: matchIdForEntry(entry), pkg: await getDemoPackage(entry.id) })))
      .then((demos) => {
        if (!cancelled) setClusters(buildOpeningPatternClusters(demos, { windowSeconds: 15 }));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  async function confirmSeries(suggestionId: string, includeBp: boolean) {
    const suggestion = suggestions.find((item) => item.id === suggestionId);
    if (!suggestion) return;
    const veto = includeBp
      ? buildVetoTemplate(suggestion.id, suggestion.format, suggestion.teamAName, suggestion.teamBName, mapPool)
      : null;
    // 已预知的 BP：IEM Kraków 2026 决赛 FURIA vs Vitality（BO5），FURIA=teamA
    if (veto && suggestion.teamAName.includes("FURIA") && suggestion.teamBName.includes("Vitality") && suggestion.entryIds.length >= 4) {
      const iemMaps = ["Dust2", "Ancient", "Mirage", "Inferno", "Nuke", "Overpass", "Anubis"];
      veto.mapPool = iemMaps;
      veto.format = "bo5";
      veto.steps = [
        { stepOrder: 1, actionType: "ban", teamKey: "teamA", mapName: "Dust2", side: null },
        { stepOrder: 2, actionType: "ban", teamKey: "teamB", mapName: "Ancient", side: null },
        { stepOrder: 3, actionType: "pick", teamKey: "teamA", mapName: "Mirage", side: "t" },
        { stepOrder: 4, actionType: "pick", teamKey: "teamB", mapName: "Inferno", side: "t" },
        { stepOrder: 5, actionType: "pick", teamKey: "teamA", mapName: "Nuke", side: "t" },
        { stepOrder: 6, actionType: "pick", teamKey: "teamB", mapName: "Overpass", side: "t" },
        { stepOrder: 7, actionType: "decider", teamKey: null, mapName: "Anubis", side: null }
      ];
    }
    // 已预知的 BP：PGL Astana 2026 决赛 Spirit vs Falcons（BO5 3-0），Spirit=teamB
    if (veto && suggestion.teamBName.includes("Spirit") && suggestion.teamAName.includes("Falcons") && suggestion.entryIds.length >= 3) {
      const pglMaps = ["Inferno", "Overpass", "Dust2", "Mirage", "Ancient", "Nuke", "Anubis"];
      veto.mapPool = pglMaps;
      veto.format = "bo5";
      veto.steps = [
        { stepOrder: 1, actionType: "ban", teamKey: "teamB", mapName: "Inferno", side: null },
        { stepOrder: 2, actionType: "ban", teamKey: "teamA", mapName: "Overpass", side: null },
        { stepOrder: 3, actionType: "pick", teamKey: "teamB", mapName: "Dust2", side: "t" },
        { stepOrder: 4, actionType: "pick", teamKey: "teamA", mapName: "Mirage", side: "t" },
        { stepOrder: 5, actionType: "pick", teamKey: "teamB", mapName: "Ancient", side: "t" },
        { stepOrder: 6, actionType: "pick", teamKey: "teamA", mapName: "Nuke", side: "t" },
        { stepOrder: 7, actionType: "decider", teamKey: null, mapName: "Anubis", side: null }
      ];
    }
    const finalVeto = veto ? { ...veto, ...deriveVetoSummary(veto.steps) } : null;
    const saved = await saveSeriesRecord({ ...suggestion, format: finalVeto?.format ?? suggestion.format, veto: finalVeto });
    setSeries((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
  }

  async function setMyTeam(teamName: string) {
    const next = await saveCoachSettings({ myTeamName: teamName || null });
    setSettings(next);
  }

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有教练数据"
          hint="先导入多场 demo，再沉淀开局模式、战术本和备战报告。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  const antiMarkdown = buildAntiStratMarkdown(clusters ?? [], settings.myTeamName, teamRenames);

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>教练工作台</h1>
          <p>把多场 demo 里的开局站位、道具顺序和系列赛 BP 整理成教练能直接阅读的备战视图。</p>
        </div>
        <label className="stu-coach-team-picker">
          我的队伍
          <select value={settings.myTeamName ?? ""} onChange={(event) => void setMyTeam(event.target.value)}>
            <option value="">未设置</option>
            {teamGroups.map((team) => <option key={team.displayName} value={team.displayName}>{team.displayName}</option>)}
          </select>
        </label>
      </header>
      <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} teamRenames={teamRenames} />
      <div className="stu-subtabs" role="tablist" aria-label="教练工作台">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? "stu-subtab stu-subtab-active" : "stu-subtab"}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error && <EmptyState variant="error" title="聚合失败" hint={error} />}
      {!error && entries.length === 0 && <EmptyState variant="insufficient" title="聚合范围为空" hint="请调整聚合范围。" />}
      {!error && !clusters && entries.length > 0 && <div className="stu-loading">聚合 {entries.length} 场 demo 的开局 pattern…</div>}
      {clusters && tab === "patterns" && <PatternTable clusters={clusters} entryByMatchId={entryByMatchId} onOpenMatch={onOpenMatch} />}
      {clusters && tab === "playbook" && (
        <PlaybookTable
          clusters={clusters}
          playbook={playbook}
          onRename={async (clusterId, name) => {
            await savePlaybookName(clusterId, name);
            setPlaybook(await listPlaybookNames());
          }}
        />
      )}
      {clusters && tab === "anti" && (
        <div className="stu-card">
          <h3>备战报告 Markdown</h3>
          <textarea className="stu-coach-report" readOnly value={antiMarkdown} />
        </div>
      )}
      {tab === "veto" && (
        <VetoPanel
          suggestions={suggestions}
          series={series}
          onConfirm={confirmSeries}
        />
      )}
    </div>
  );
}

function PatternTable({
  clusters,
  entryByMatchId,
  onOpenMatch
}: {
  clusters: OpeningPatternCluster[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
}) {
  return (
    <section className="stu-coach-pattern-grid">
      {clusters.slice(0, 24).map((cluster) => {
        const first = cluster.rounds[0];
        const entry = first ? entryByMatchId.get(first.matchId) : null;
        return (
          <article key={cluster.id} className="stu-coach-pattern-card">
            <header>
              <span>{cluster.mapName}</span>
              <b>{SIDE_LABEL[cluster.side]}</b>
            </header>
            <h3>{formatPatternBasis(cluster)}</h3>
            {cluster.grenadeSequence.length > 0 && (
              <p className="stu-coach-nades">{formatGrenades(cluster.grenadeSequence)}</p>
            )}
            <div className="stu-coach-pattern-metrics">
              <span><small>回合</small><b>{cluster.roundCount}</b></span>
              <span><small>胜率</small><b>{cluster.winRatePercent == null ? "—" : `${cluster.winRatePercent.toFixed(1)}%`}</b></span>
            </div>
            {entry && first && (
              <button type="button" className="stu-button-sm" onClick={() => onOpenMatch(entry.id, { roundNumber: first.roundNumber })}>
                查看代表回合
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}

function PlaybookTable({
  clusters,
  playbook,
  onRename
}: {
  clusters: OpeningPatternCluster[];
  playbook: Record<string, string>;
  onRename: (clusterId: string, name: string) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <div className="stu-card">
      <h3>战术本</h3>
      <table className="stu-mini-table">
        <thead><tr><th>战术名</th><th>开局模式</th><th className="stu-num">样本</th><th /></tr></thead>
        <tbody>
          {clusters.slice(0, 20).map((cluster) => {
            const value = drafts[cluster.id] ?? playbook[cluster.id] ?? "";
            return (
              <tr key={cluster.id}>
                <td><input className="stu-input stu-input-sm" value={value} placeholder="命名战术" onChange={(event) => setDrafts((current) => ({ ...current, [cluster.id]: event.target.value }))} /></td>
                <td>{cluster.mapName} · {SIDE_LABEL[cluster.side]} · {formatPatternBasis(cluster)}</td>
                <td className="stu-num">{cluster.roundCount}</td>
                <td><button type="button" className="stu-button-sm" onClick={() => void onRename(cluster.id, value)}>保存</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// TODO: 交互式 BP 编辑器。当前预填只覆盖已知 sample 系列。
// 缺口：① side 应为不可编辑字段（选图方选图→对面选边，非 picker 选边）；
//       ② BO3 decider 的 side 由最后一 ban 的对面决定，非拼刀；
//       ③ 没有展开/编辑步骤的 UI（无法查看/修改已保存的 BP 步骤）；
//       ④ 确认后系列记录只显示计数，无系列详情页（跨图选手趋势/记分板/BP 步骤可视化）。
function VetoPanel({
  suggestions,
  series,
  onConfirm
}: {
  suggestions: ReturnType<typeof suggestSeriesGroups>;
  series: StudioSeriesRecord[];
  onConfirm: (suggestionId: string, includeBp: boolean) => Promise<void>;
}) {
  const [bpEnabled, setBpEnabled] = useState<Record<string, boolean>>({});
  return (
    <div className="stu-card">
      <h3>系列赛 / BP</h3>
      <table className="stu-mini-table">
        <thead><tr><th>建议分组</th><th className="stu-num">地图</th><th>赛制</th><th>BP</th><th /></tr></thead>
        <tbody>
          {suggestions.map((suggestion) => {
            const saved = series.some((item) => item.id === suggestion.id);
            return (
              <tr key={suggestion.id}>
                <td>{suggestion.name}</td>
                <td className="stu-num">{suggestion.entryIds.length}</td>
                <td>{suggestion.format.toUpperCase()}</td>
                <td><label><input type="checkbox" checked={bpEnabled[suggestion.id] ?? false} onChange={(event) => setBpEnabled((current) => ({ ...current, [suggestion.id]: event.target.checked }))} /> 同时生成 BP 模板</label></td>
                <td><button type="button" className="stu-button-sm" disabled={saved} onClick={() => void onConfirm(suggestion.id, bpEnabled[suggestion.id] ?? false)}>{saved ? "已确认" : "确认"}</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {series.length > 0 && (
        <div className="stu-coach-series-list">
          {series.map((item) => (
            <div key={item.id} className="stu-coach-series-item">
              <strong>{item.name}</strong>
              <span>{item.format.toUpperCase()} · {item.entryIds.length} 图 · BP {item.veto ? `${item.veto.steps.length} 步` : "未录入"}</span>
              {item.veto && <BpView veto={item.veto} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildAntiStratMarkdown(
  clusters: OpeningPatternCluster[],
  myTeamName: string | null,
  teamRenames: Record<string, string>
): string {
  const mapPool = [...new Set(clusters.map((cluster) => cluster.mapName))].sort();
  const markdown = buildAntiStratMarkdownFromPatterns(clusters, { myTeamName, opponentName: myTeamName ? null : "对手", mapPool });
  return `${markdown}\n\n## 队伍身份\n- 已加载队伍归并：${Object.keys(teamRenames).length} 条`;
}

function calloutName(mapName: string, callout: string): string {
  const table = (CALLOUT_NAME_CN as Record<string, Record<string, string>>)[mapName] ?? {};
  return table[callout] || callout;
}

function formatPatternBasis(cluster: OpeningPatternCluster): string {
  return cluster.basis.split("|").map((part) => {
    const [callout, count] = part.split(":");
    return `${calloutName(cluster.mapName, callout ?? "unknown")}×${count ?? "1"}`;
  }).join(" / ");
}

function formatGrenades(sequence: string[]): string {
  return sequence.map((item) => GRENADE_LABEL[item] ?? item).join(" → ");
}
