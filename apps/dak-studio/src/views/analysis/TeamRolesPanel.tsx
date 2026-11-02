import { withStoredAnalysis } from "../../lib/queries/query-cache";
import { canExportSnapshot, withCapabilityConditions, unionExportEntries, withAnalysisExportEntries } from "../../lib/analysis-export";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../../lib/queries/query-cache";
import { CapabilityBar, useCapability } from "../../components/CapabilityBar";
import type { CapabilityRepairAction } from "../../lib/capability-availability";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AnalysisExportButtons } from "../../components/AnalysisExportButtons";
import { buildTeamRolesAnalysisResult } from "../../lib/analysis-export-roles";
import type { AnalysisExportSource } from "../../lib/analysis-export";
import { DoubleAwpAnalysisPanel, EmptyState, TeamMapRoleMatrixPanel } from "@cs2dak/react";
import type { DoubleAwpAnalysis, TeamMapRoleMatrix } from "@cs2dak/tactics";
import { getDoubleAwpAnalysis, getTeamMapRoleMatrices, getRoleTeamEntries, type RoleTeamGroup } from "../../lib/queries/spatial-queries";
import { getFactsStore } from "../../lib/facts-store";
import { matchIdForEntry, type StudioDemoEntry } from "../../lib/demo-entry";
import { loadRoleDeclarations } from "../../lib/identity-commands";
import { type IdentityOptions } from "../../lib/identity";
import type { OpenEvidence } from "../../lib/evidence-continuation";
import type { TeamRolesState } from "../../lib/studio-page-state";

export function TeamRolesPanel({ exportSource, onCapabilityRepair, entries, teamName, teamKey, identityOptions, state, onStateChange, onOpenEvidence, onPageReady }: {
  exportSource?: AnalysisExportSource | null;
  onCapabilityRepair: (action: CapabilityRepairAction) => void; entries: StudioDemoEntry[]; teamName: string; teamKey?: string; identityOptions?: IdentityOptions;
  state: TeamRolesState; onStateChange: (state: TeamRolesState) => void;
  onOpenEvidence: OpenEvidence; onPageReady?: (keys: string[]) => void;
}) {
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const [scopedRoleEntries, setScopedRoleEntries] = useState<StudioDemoEntry[] | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setScopedRoleEntries(null); setScopeError(null);
    if (analysis.status !== "ready") return () => { cancelled = true; };
    void getRoleTeamEntries(entries, identityOptions, teamKey ?? teamName).then(value => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setScopedRoleEntries(value); } })
      .catch(error => { if (!cancelled) setScopeError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [entries, teamName, teamKey, identityOptions?.version, analysis]);
  const capability = useCapability(scopedRoleEntries ?? [], "map-role");
  const roleEntries = capability.eligible;
  const awpCapability = useCapability(scopedRoleEntries ?? [], "team-awp");
  const awpEntries = awpCapability.eligible;
  const [roleSnapshot, setRoleSnapshot] = useState<{ key: string; generation: number; value: Array<TeamMapRoleMatrix & { teamGroup: RoleTeamGroup }> } | null>(null);
  const roleKey = JSON.stringify([roleEntries?.map(entry => entry.id), teamName, teamKey, identityOptions?.version]);
  const matrices = roleSnapshot?.key === roleKey ? roleSnapshot.value : null;
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [awpSnapshot, setAwpSnapshot] = useState<{ key: string; generation: number; value: DoubleAwpAnalysis[] } | null>(null);
  const awpKey = JSON.stringify([awpEntries?.map(entry => entry.id), teamName, teamKey, identityOptions?.version]);
  const doubleAwp = awpSnapshot?.key === awpKey ? awpSnapshot.value : null;
  const [doubleAwpError, setDoubleAwpError] = useState<string | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [matrixTeam, setMatrixTeam] = useState<string | null>(null);
  const matrixSide = state.matrixSide;
  const matrixMap = state.matrixMapName ?? matrices?.[0]?.mapName ?? null;
  const setMatrixMap = (matrixMapName: string) => onStateChange({ ...state, matrixMapName });
  const setMatrixSide = (matrixSide: "t" | "ct") => onStateChange({ ...state, matrixSide });
  useEffect(() => {
    if (!scopedRoleEntries || !roleEntries) return;
    if (!roleEntries.length) { setRoleSnapshot({ key: roleKey, generation: analysis.generation, value: [] }); return; }
    if (analysis.status !== "ready") return;
    let cancelled = false;
    setMatrixError(null);
    void loadRoleDeclarations().then(value => getTeamMapRoleMatrices(roleEntries, value.declarations.map(row => row.declaration), identityOptions, [teamKey ?? teamName]))
      .then(value => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setRoleSnapshot({ key: roleKey, generation: analysis.generation, value }); } })
      .catch(reason => { if (!cancelled) setMatrixError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [scopedRoleEntries, roleEntries, teamName, identityOptions?.version, roleKey, analysis]);
  useEffect(() => {
    if (!scopedRoleEntries || !awpEntries) return;
    if (!awpEntries.length) { setAwpSnapshot({ key: awpKey, generation: analysis.generation, value: [] }); setDoubleAwpError(null); return; }
    if (analysis.status !== "ready") return;
    let cancelled = false;
    setDoubleAwpError(null);
    void getDoubleAwpAnalysis(awpEntries, identityOptions, [teamKey ?? teamName])
      .then(value => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setAwpSnapshot({ key: awpKey, generation: analysis.generation, value }); } })
      .catch(reason => { if (!cancelled) setDoubleAwpError((reason instanceof Error ? reason.message : String(reason)) || "读取失败"); });
    return () => { cancelled = true; };
  }, [scopedRoleEntries, awpEntries, teamName, identityOptions?.version, awpKey, analysis]);
  useEffect(() => {
    let cancelled = false;
    setPlayerNames({});
    void withStoredAnalysis(entries, () => getFactsStore().getPlayerMatchStats({ matchIds: entries.map(matchIdForEntry) })).then(rows => {
      if (cancelled) return;
      const names: Record<string, string> = {};
      for (const row of rows) {
        const mapped = identityOptions?.map[row.steamId64];
        const key = mapped == null ? `steam:${row.steamId64}` : typeof mapped === "string" ? mapped : mapped.playerKey;
        const name = typeof mapped === "object" && mapped.displayName ? mapped.displayName : row.playerName;
        names[row.steamId64] = name; names[`steam:${row.steamId64}`] = name; names[key] = name;
      }
      setPlayerNames(names);
    }).catch(() => { /* 名称读取失败时保留身份键，不阻止观察。 */ });
    return () => { cancelled = true; };
  }, [entries, identityOptions?.version]);
  useEffect(() => {
    if (!onPageReady || (entries.length > 0 && ((!matrices && !matrixError && !capability.error) || (!doubleAwp && !doubleAwpError && !awpCapability.error)))) return;
    onPageReady(Array.from(document.querySelectorAll<HTMLElement>("[id]"), node => node.id));
  }, [onPageReady, entries.length, matrices, matrixError, capability.error, doubleAwp, doubleAwpError, awpCapability.error]);
  const matrixTeams = [...new Map((matrices ?? []).map(row => [row.teamKey, row.teamGroup])).values()];
  const activeTeam = matrixTeams.some(team => team.key === matrixTeam) ? matrixTeam : matrixTeams[0]?.key;
  const teamMatrices = (matrices ?? []).filter(row => row.teamKey === activeTeam);
  const matrixMaps = [...new Set(teamMatrices.map(row => row.mapName))];
  const activeMap = matrixMaps.some(map => map === matrixMap) ? matrixMap : matrixMaps[0];
  const activeMatrix = teamMatrices.find(row => row.mapName === activeMap && row.side === matrixSide) ?? null;
  const activeAwp = doubleAwp?.find(row => row.teamKey === (activeTeam ?? doubleAwp[0]?.teamKey) && row.side === matrixSide) ?? null;
  if (!entries.length) return <div className="stu-view"><EmptyState variant="insufficient" title="聚合范围为空" hint="请调整分析范围。" /></div>;
  const rolePanels = <>
          <section className="stu-card" id="team:map-roles">
              {scopedRoleEntries && capability.availability && <CapabilityBar availability={capability.availability} onRepair={onCapabilityRepair} />}
              {capability.error && <p role="alert">地图位置能力读取失败：{capability.error} <button type="button" className="stu-button-sm" onClick={capability.retry}>重试</button>{capability.availability && " · 显示旧版本"}</p>}
            <div className="stu-card-head"><h3>地图位置职责</h3><div className="stu-chip-row" role="tablist" aria-label="职责矩阵筛选">{matrixTeams.length > 1 && matrixTeams.map(team => <button key={team.key} type="button" className={activeTeam === team.key ? "stu-chip stu-chip-active" : "stu-chip"} onClick={() => setMatrixTeam(team.key)}>{team.label}</button>)}{matrixMaps.map((map) => <button key={map} type="button" className={activeMap === map ? "stu-chip stu-chip-active" : "stu-chip"} onClick={() => setMatrixMap(map)}>{map.replace("de_", "")}</button>)}{(["t", "ct"] as const).map((side) => <button key={side} type="button" className={matrixSide === side ? "stu-chip stu-chip-active" : "stu-chip"} onClick={() => setMatrixSide(side)}>{side.toUpperCase()}</button>)}</div></div>
            {matrices && (matrixError || analysis.status !== "ready" || roleSnapshot?.generation !== analysis.generation) && <p className="stu-muted" role="status">{matrixError || analysis.status === "error" ? "更新失败，显示旧版本结果。" : "正在更新，显示旧版本结果。"}</p>}
            {scopeError ? <EmptyState variant="error" title="职责矩阵不可用" hint={scopeError} /> : !scopedRoleEntries ? <div className="stu-loading">读取队伍范围…</div> : matrixError && !matrices ? <EmptyState variant="error" title="职责矩阵不可用" hint={matrixError} /> : matrices === null && !capability.error ? <div className="stu-loading">读取地图位置事实…</div> : matrices === null ? null : roleEntries?.length === 0 && matrices.length === 0 ? (capability.error ? null : <p className="stu-muted" role="status">当前范围暂无可用比赛，请查看上方原因和操作。</p>) : <TeamMapRoleMatrixPanel state={state.tables.roles ?? { sort: { key: "sample", direction: "desc" }, page: 0 }} onStateChange={table => onStateChange({ ...state, tables: { ...state.tables, roles: table } })} matrix={activeMatrix} playerNames={playerNames} onOpenEvidence={(evidence) => { const entry = entries.find((row) => matchIdForEntry(row) === evidence.matchId); if (entry && matrixMap) onOpenEvidence({ entryId: entry.id, evidence, sourceKey: "team:map-roles" }); }} />}
          </section>
          <section className="stu-card" id="team:double-awp">
            <div className="stu-card-head"><h3>双 AWP 条件统计</h3></div>
            {scopedRoleEntries && awpCapability.availability && <CapabilityBar availability={awpCapability.availability} onRepair={onCapabilityRepair} />}
            {awpCapability.error && <p role="alert">AWP 能力读取失败：{awpCapability.error} <button type="button" className="stu-button-sm" onClick={awpCapability.retry}>重试</button>{awpCapability.availability && " · 显示旧版本"}</p>}
            {doubleAwp && (doubleAwpError || analysis.status !== "ready" || awpSnapshot?.generation !== analysis.generation) && <p role="status" className="stu-muted">{doubleAwpError || analysis.status === "error" ? "更新失败，显示旧版本结果。" : "正在更新，显示旧版本结果。"}</p>}
            {scopeError ? <EmptyState variant="error" title="双 AWP 统计不可用" hint={scopeError} /> : !scopedRoleEntries ? <div className="stu-loading">读取队伍范围…</div> : doubleAwpError && !doubleAwp ? <EmptyState variant="error" title="双 AWP 统计不可用" hint={doubleAwpError} /> : doubleAwp === null && !awpCapability.error ? <div className="stu-loading">读取 AWP 回合事实…</div> : doubleAwp === null ? null : awpEntries?.length === 0 && doubleAwp.length === 0 ? (awpCapability.error ? null : <p className="stu-muted" role="status">当前范围暂无可用比赛，请查看上方原因和操作。</p>) : <DoubleAwpAnalysisPanel model={activeAwp} playerNames={playerNames} onOpenEvidence={(evidence) => { const entry = entries.find((row) => matchIdForEntry(row) === evidence.matchId); if (entry) onOpenEvidence({ entryId: entry.id, evidence, sourceKey: "team:double-awp" }); }} />}
          </section>
  </>;
  const roleCurrent = !!activeMatrix && !matrixError && !capability.error &&
    !capability.stale && canExportSnapshot(roleSnapshot, analysis);
  const awpCurrent = !!activeAwp && !doubleAwpError && !awpCapability.error &&
    !awpCapability.stale && canExportSnapshot(awpSnapshot, analysis);
  const omitted = [
    !roleCurrent ? "位置职责矩阵未导出：无当前可用结果或正在更新。" : null,
    !awpCurrent ? "双 AWP 统计未导出：无当前可用结果或正在更新。" : null,
  ].filter((value): value is string => value !== null);
  return <div className="stu-view">
    <header className="stu-view-header">
      <h1>位置与职责 · {teamName}</h1>
      {exportSource && (roleCurrent || awpCurrent) && <AnalysisExportButtons capture={() => {
        const source = withCapabilityConditions(
          withAnalysisExportEntries(exportSource, unionExportEntries(
            roleCurrent ? roleEntries : null, awpCurrent ? awpEntries : null,
          )),
          roleCurrent ? capability.availability : null,
          awpCurrent ? awpCapability.availability : null,
        );
        return buildTeamRolesAnalysisResult(source, roleCurrent ? activeMatrix : null,
          awpCurrent ? activeAwp : null, state, playerNames, teamName, omitted);
      }} />}
    </header>
    {rolePanels}
  </div>;
}
