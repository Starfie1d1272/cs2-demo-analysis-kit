import { canExportSnapshot, withCapabilityConditions } from "../lib/analysis-export";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../lib/queries/query-cache";
import { CapabilityBar, useCapability } from "../components/CapabilityBar";
import type { CapabilityRepairAction } from "../lib/capability-availability";
import { AnalysisExportButtons } from "../components/AnalysisExportButtons";
import { buildControlAnalysisResult } from "../lib/analysis-export-spatial";
import { withAnalysisExportEntries, type AnalysisExportSource } from "../lib/analysis-export";
import type { ControlPageState } from "../lib/spatial-view-state";
import type { Dispatch, SetStateAction } from "react";
import { usePageReady } from "../lib/use-page-ready";
/**
 * 雷达覆盖场（控图）——描述性地图控制，不上评分。
 *
 * 两个核心用途：① 赛事地图基线（地图可视性描述）② 队伍对基线的贡献差分。
 * 底层四基础场加性、持久化缓存，换 scope 秒切；不推导弱区、意图或对策。
 */
import { EmptyState } from "@cs2dak/react";
import { RadarFieldCanvas } from "@cs2dak/react";
import { getMapCalibration, hasLowerLevel } from "@cs2dak/maps/calibration";
import type { RadarField } from "@cs2dak/tactics";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { matchIdForEntry, type StudioDemoEntry } from "../lib/demo-entry";
import { getTeamAnalysisGroups, getAnalysisTeamSlots } from "../lib/queries/team-scope";
import type { IdentityOptions } from "../lib/identity";
import { buildScopeRadarFields } from "../lib/radar-field";

export interface RadarFieldViewProps {
  exportSource?: AnalysisExportSource | null;
  state: ControlPageState;
  onStateChange: Dispatch<SetStateAction<ControlPageState>>;
  onPageReady?: (keys: string[]) => void;
  onCapabilityRepair: (action: CapabilityRepairAction) => void;
  entries: StudioDemoEntry[];
  teamRenames?: Record<string, string>;
  selectedTeam?: string | null;
  selectedTeamKey?: string | null;
  identityOptions?: IdentityOptions;
  onOpenMatch: (entryId: string) => void;
  onSelectTeam?: (teamName: string | null, teamKey?: string) => void;
}

export function RadarFieldView({ exportSource, onCapabilityRepair, entries, teamRenames = {}, selectedTeam = null, selectedTeamKey = null, identityOptions, onSelectTeam, onPageReady, state, onStateChange, onOpenMatch }: RadarFieldViewProps) {
  const maps = useMemo(() => {
    const set = new Map<string, number>();
    for (const e of entries) if (getMapCalibration(e.meta.mapName)) set.set(e.meta.mapName, (set.get(e.meta.mapName) ?? 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const { mapName, economy } = state;
  const setMapName = (mapName: string | null) => onStateChange(current => ({ ...current, mapName }));
  const setEconomy = (economy: "gun" | "all") => onStateChange(current => ({ ...current, economy }));
  const activeMap = mapName ?? maps[0]?.[0] ?? null;

  const entriesOfMap = useMemo(
    () => (activeMap ? entries.filter((e) => e.meta.mapName === activeMap) : []),
    [entries, activeMap]
  );
  const capability = useCapability(entriesOfMap, "control");
  const eligibleEntries = capability.eligible;
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupSnapshot, setGroupSnapshot] = useState<{ key: string; groups: Awaited<ReturnType<typeof getTeamAnalysisGroups>>; slots: Awaited<ReturnType<typeof getAnalysisTeamSlots>> } | null>(null);
  const groupKey = JSON.stringify([entriesOfMap.map(entry => entry.id), selectedTeamKey, selectedTeam, identityOptions?.version, analysis.generation]);
  useEffect(() => {
    let cancelled = false;
    if (analysis.status !== "ready") return () => { cancelled = true; };
    setGroupError(null);
    void Promise.all([getTeamAnalysisGroups(entriesOfMap, identityOptions), getAnalysisTeamSlots(entriesOfMap, identityOptions, selectedTeamKey ? [selectedTeamKey] : selectedTeam ? [selectedTeam] : [])])
      .then(([groups, slots]) => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setGroupSnapshot({ key: groupKey, groups, slots }); } })
      .catch(reason => { if (!cancelled) { setGroupSnapshot(null); setGroupError(reason instanceof Error ? reason.message : String(reason)); } });
    return () => { cancelled = true; };
  }, [entriesOfMap, groupKey, identityOptions?.version, analysis]);
  const groups = groupSnapshot?.key === groupKey ? groupSnapshot.groups : [];
  const slots = groupSnapshot?.key === groupKey ? groupSnapshot.slots : null;
  const matches = groups.filter(group => selectedTeamKey ? group.key === selectedTeamKey : selectedTeam != null && group.names.includes(selectedTeam));
  const activeGroup = matches.length === 1 ? matches[0]! : null;
  const activeTeam = activeGroup?.label ?? (!selectedTeamKey && matches.length > 1 ? selectedTeam : null);
  const invalidTeamForMap = selectedTeam !== null && groupSnapshot?.key === groupKey && !activeTeam;
  const groupsReady = groupSnapshot?.key === groupKey;

  const missingSelectedMap = mapName !== null && !maps.some(([name]) => name === mapName);

  const requestKey = JSON.stringify([eligibleEntries?.map(entry => entry.id), activeMap, activeTeam, economy, teamRenames]);
  const [snapshot, setSnapshot] = useState<{ key: string; generation: number; field: RadarField | null; baseline: RadarField | null } | null>(null);
  const field = snapshot?.key === requestKey ? snapshot.field : null;
  const baseline = snapshot?.key === requestKey ? snapshot.baseline : null;
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const reqToken = useRef(0);
  const [fieldReady, setFieldReady] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  usePageReady(!activeMap || entriesOfMap.length === 0 || invalidTeamForMap || fieldReady, onPageReady);

  useEffect(() => {
    if (!activeMap || !eligibleEntries || eligibleEntries.length === 0 || invalidTeamForMap || !groupsReady) {
      setProgress(null);
      setFieldReady(true);
      return;
    }
    if (analysis.status !== "ready") return;
    setFieldReady(false);
    setFieldError(null);
    const token = ++reqToken.current;
    const abort = new AbortController();
    const matchIds = eligibleEntries.map((e) => e.id);
    const isTeam = activeTeam !== null;
    setProgress({ done: 0, total: matchIds.length });

    void (async () => {
      try {
        const { league, team } = await buildScopeRadarFields({
          matchIds,
          economy,
          team: isTeam
            ? { name: activeTeam, includeTeam: (_raw, slot, id) => { const entry = eligibleEntries.find(item => item.id === id); return !!entry && !!slots?.get(matchIdForEntry(entry))?.has(slot); } }
            : undefined,
          signal: abort.signal,
          onProgress: (done, total) => {
            if (token === reqToken.current && !abort.signal.aborted) setProgress({ done, total });
          },
        });
        if (token !== reqToken.current || abort.signal.aborted) return;
        assertAnalysisGeneration(analysis.generation);
        setSnapshot({ key: requestKey, generation: analysis.generation, field: isTeam ? team : league, baseline: team ? league : null });
        setProgress(null);
        setFieldReady(true);
      } catch (reason) {
        if (token !== reqToken.current || abort.signal.aborted) return;
        setFieldError(reason instanceof Error ? reason.message : String(reason));
        setProgress(null);
        setFieldReady(true);
      }
    })();
    return () => abort.abort();
  }, [activeMap, activeTeam, eligibleEntries, invalidTeamForMap, groupsReady, slots, teamRenames, economy, requestKey, analysis]);

  if (missingSelectedMap) {
    return <div className="stu-radar-field">
      <EmptyState variant="insufficient" title={`${mapName} 在当前范围没有样本`} hint={maps.length > 0 ? "请选择其他地图，或调整分析范围以恢复该地图的比赛。" : "请调整分析范围或导入该地图的比赛。"} />
      {maps.length > 0 && <div className="stu-subtabs" role="tablist" aria-label="选择其他地图">
        {maps.map(([name, count]) => <button key={name} type="button" role="tab" aria-selected={false} className="stu-subtab" onClick={() => setMapName(name)}>{name} <small>{count}</small></button>)}
      </div>}
    </div>;
  }
  if (maps.length === 0) {
    return <EmptyState title="暂无可分析地图" hint="先导入若干含回放（replay）的 demo，再来看覆盖场。" />;
  }

  return (
    <div className="stu-radar-field">
      <div className="stu-card stu-radar-field-head">
        <div>
          <h3>控图覆盖场</h3>
          {exportSource && field && fieldReady && !progress && !fieldError && !capability.error && !capability.stale && !invalidTeamForMap && canExportSnapshot(snapshot, analysis) && <AnalysisExportButtons capture={() => buildControlAnalysisResult(withCapabilityConditions(withAnalysisExportEntries(exportSource, entriesOfMap.filter(entry => field.scope.matchIds.includes(entry.id) || baseline?.scope.matchIds.includes(entry.id))), capability.availability), field, baseline, state)} />}
          <p className="stu-muted">
            基线 = 当前全局范围中 {activeMap} 的 {entriesOfMap.length} 场；
            队伍视图 = 该队在这些场次里的贡献。覆盖场展示选定范围内的空间分布。
          </p>
        </div>
        <span className="stu-radar-field-badge">首次计算后会缓存</span>
      </div>

      <div className="stu-subtabs" role="tablist" aria-label="地图">
        {maps.map(([m, n]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={activeMap === m}
            className={activeMap === m ? "stu-subtab stu-subtab-active" : "stu-subtab"}
            onClick={() => setMapName(m)}
          >
            {m} <small>{n}</small>
          </button>
        ))}
      </div>

      <label className="stu-card stu-radar-field-scope">
        回合经济
        <select className="stu-select" value={economy} onChange={(event) => setEconomy(event.target.value as "gun" | "all")}>
          <option value="gun">长枪局</option>
          <option value="all">全部回合</option>
        </select>
      </label>

      <div className="stu-card stu-radar-field-scope" aria-label="对象">
        <span className="stu-muted">对象</span>
        <button
          type="button"
          className={selectedTeam === null ? "stu-chip stu-chip-active" : "stu-chip"}
          onClick={() => onSelectTeam?.(null)}
          title={`当前全局范围 · ${activeMap} · ${entriesOfMap.length} 场`}
        >
          赛事地图基线 <small>{entriesOfMap.length}</small>
        </button>
        {groups.map((group) => (
          <button key={group.key} type="button" className={activeGroup?.key === group.key ? "stu-chip stu-chip-active" : "stu-chip"}
            onClick={() => onSelectTeam?.(group.name, group.key)}>
            {group.label} <small>{group.matchIds.length}</small>
          </button>
        ))}
      </div>

      <details className="stu-card"><summary>查看样本比赛</summary><p className="stu-muted">仅列出当前地图、范围和所选队伍的比赛；覆盖格不提供回合反查。</p>
        {entriesOfMap.filter(entry => !selectedTeam || !!slots?.get(matchIdForEntry(entry))?.size).map(entry => <button key={entry.id} type="button" className="stu-button-sm" onClick={() => onOpenMatch(entry.id)}>{entry.meta.teamAName} vs {entry.meta.teamBName} · {entry.meta.mapName}</button>)}
      </details>

      {groupError && <p role="alert">队伍分组读取失败：{groupError}</p>}
      {invalidTeamForMap && (
        <EmptyState
          variant="insufficient"
          title="当前队伍在此地图没有样本"
          hint="请选择该地图中的其他队伍，或明确切回赛事地图基线。"
        />
      )}

      {!invalidTeamForMap && progress && (
        <div className="stu-notice" role="status">
          计算 {activeMap} 覆盖场 {progress.done}/{progress.total} 场（首次较慢，结果已缓存，之后秒开）…
        </div>
      )}

      {field && (progress || fieldError || analysis.status !== "ready" || snapshot?.generation !== analysis.generation) && <p className="stu-muted" role="status">{fieldError || analysis.status === "error" ? "更新失败，显示旧版本结果。" : "正在更新，显示旧版本结果。"}</p>}
      {capability.availability && <CapabilityBar availability={capability.availability} onRepair={onCapabilityRepair} />}
      {capability.error && <p role="alert">能力读取失败：{capability.error} <button type="button" className="stu-button-sm" onClick={capability.retry}>重试</button>{capability.availability && " · 显示旧版本"}</p>}
      {!invalidTeamForMap && field && <RadarFieldCanvas field={field} baseline={baseline} map={{ name: activeMap!, radarImageUrl: `./maps/radars/${activeMap}.png`, lowerRadarImageUrl: getMapCalibration(activeMap!) && hasLowerLevel(getMapCalibration(activeMap!)!) ? `./maps/radars/${activeMap}_lower.png` : null }} state={{ mode: state.mode, second: state.second, level: state.level }} onStateChange={view => onStateChange(current => ({ ...current, ...view }))} />}
      {!invalidTeamForMap && !progress && !field && activeMap && capability.availability && !capability.error && !capability.stale && (
        fieldError ? <EmptyState variant="error" title="覆盖场加载失败" hint={fieldError} />
          : <EmptyState title="该地图暂无覆盖场数据" hint="所选范围和经济条件内没有含回放的回合。" />
      )}
    </div>
  );
}
