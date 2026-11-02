import { useEffect, useState } from "react";
import { DoubleAwpAnalysisPanel, EmptyState, TeamMapRoleMatrixPanel } from "@cs2dak/react";
import type { DoubleAwpAnalysis, TeamMapRoleMatrix } from "@cs2dak/tactics";
import { getDoubleAwpAnalysis, getTeamMapRoleMatrices } from "../../lib/queries/spatial-queries";
import { getFactsStore } from "../../lib/facts-store";
import { matchIdForEntry, type StudioDemoEntry } from "../../lib/demo-entry";
import { loadRoleDeclarations } from "../../lib/role-declarations";
import type { IdentityOptions } from "../../lib/identity";
import type { OpenEvidence } from "../../lib/evidence-continuation";
import type { TeamRolesState } from "../../lib/studio-page-state";

export function TeamRolesPanel({ entries, teamName, identityOptions, state, onStateChange, onOpenEvidence, onPageReady }: {
  entries: StudioDemoEntry[]; teamName: string; identityOptions?: IdentityOptions;
  state: TeamRolesState; onStateChange: (state: TeamRolesState) => void;
  onOpenEvidence: OpenEvidence; onPageReady?: (keys: string[]) => void;
}) {
  const [matrices, setMatrices] = useState<TeamMapRoleMatrix[] | null>(null);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [doubleAwp, setDoubleAwp] = useState<DoubleAwpAnalysis[] | null>(null);
  const [doubleAwpError, setDoubleAwpError] = useState<string | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const matrixSide = state.matrixSide;
  const matrixMap = state.matrixMapName ?? matrices?.[0]?.mapName ?? null;
  const setMatrixMap = (matrixMapName: string) => onStateChange({ ...state, matrixMapName });
  const setMatrixSide = (matrixSide: "t" | "ct") => onStateChange({ ...state, matrixSide });
  useEffect(() => {
    if (!entries.length) { setMatrices(null); return; }
    let cancelled = false;
    setMatrices(null); setMatrixError(null);
    void loadRoleDeclarations().then(value => getTeamMapRoleMatrices(entries, value.declarations.map(row => row.declaration), identityOptions, [teamName]))
      .then(value => { if (!cancelled) setMatrices(value); })
      .catch(reason => { if (!cancelled) setMatrixError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [entries, teamName, identityOptions?.version]);
  useEffect(() => {
    if (!entries.length) { setDoubleAwp(null); setDoubleAwpError(null); return; }
    let cancelled = false;
    setDoubleAwp(null); setDoubleAwpError(null);
    void getDoubleAwpAnalysis(entries, identityOptions, [teamName])
      .then(value => { if (!cancelled) setDoubleAwp(value); })
      .catch(reason => { if (!cancelled) setDoubleAwpError((reason instanceof Error ? reason.message : String(reason)) || "读取失败"); });
    return () => { cancelled = true; };
  }, [entries, teamName, identityOptions?.version]);
  useEffect(() => {
    let cancelled = false;
    setPlayerNames({});
    void getFactsStore().getPlayerMatchStats({ matchIds: entries.map(matchIdForEntry) }).then(rows => {
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
    if (!onPageReady || (entries.length > 0 && ((!matrices && !matrixError) || (!doubleAwp && !doubleAwpError)))) return;
    onPageReady(Array.from(document.querySelectorAll<HTMLElement>("[id]"), node => node.id));
  }, [onPageReady, entries.length, matrices, matrixError, doubleAwp, doubleAwpError]);
  const matrixMaps = [...new Set((matrices ?? []).map(row => row.mapName))];
  const activeMatrix = matrices?.find(row => row.mapName === matrixMap && row.side === matrixSide) ?? null;
  if (!entries.length) return <div className="stu-view"><EmptyState variant="insufficient" title="聚合范围为空" hint="请调整分析范围。" /></div>;
  const rolePanels = <>
          <section className="stu-card" id="team:map-roles">
            <div className="stu-card-head"><h3>地图位置职责</h3><div className="stu-chip-row" role="tablist" aria-label="职责矩阵筛选">{matrixMaps.map((map) => <button key={map} type="button" className={matrixMap === map ? "stu-chip stu-chip-active" : "stu-chip"} onClick={() => setMatrixMap(map)}>{map.replace("de_", "")}</button>)}{(["t", "ct"] as const).map((side) => <button key={side} type="button" className={matrixSide === side ? "stu-chip stu-chip-active" : "stu-chip"} onClick={() => setMatrixSide(side)}>{side.toUpperCase()}</button>)}</div></div>
            {matrixError ? <EmptyState variant="error" title="职责矩阵不可用" hint={matrixError} /> : matrices === null ? <div className="stu-loading">读取地图位置事实…</div> : <TeamMapRoleMatrixPanel state={state.tables.roles ?? { sort: { key: "sample", direction: "desc" }, page: 0 }} onStateChange={table => onStateChange({ ...state, tables: { ...state.tables, roles: table } })} matrix={activeMatrix} playerNames={playerNames} onOpenEvidence={(evidence) => { const entry = entries.find((row) => matchIdForEntry(row) === evidence.matchId); if (entry && matrixMap) onOpenEvidence({ entryId: entry.id, evidence, sourceKey: "team:map-roles" }); }} />}
          </section>
          <section className="stu-card" id="team:double-awp">
            <div className="stu-card-head"><h3>双 AWP 条件统计</h3></div>
            {doubleAwpError ? <EmptyState variant="error" title="双 AWP 统计不可用" hint={doubleAwpError} /> : doubleAwp === null ? <div className="stu-loading">读取 AWP 回合事实…</div> : <DoubleAwpAnalysisPanel model={doubleAwp.find((row) => row.side === matrixSide) ?? null} playerNames={playerNames} onOpenEvidence={(evidence) => { const entry = entries.find((row) => matchIdForEntry(row) === evidence.matchId); if (entry) onOpenEvidence({ entryId: entry.id, evidence, sourceKey: "team:double-awp" }); }} />}
          </section>
  </>;
  return <div className="stu-view"><header className="stu-view-header"><h1>位置与职责 · {teamName}</h1></header>{rolePanels}</div>;
}
