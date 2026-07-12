/**
 * 雷达覆盖场（控图）——描述性地图控制，不上评分。
 *
 * 两个核心用途：① 赛事地图基线（地图可视性描述）② 队伍对基线的贡献差分。
 * 底层四基础场加性、持久化缓存，换 scope 秒切；不推导弱区、意图或对策。
 */
import { EmptyState } from "@cs2dak/react";
import { RadarFieldCanvas } from "@cs2dak/react";
import { getMapCalibration } from "@cs2dak/maps";
import type { RadarField } from "@cs2dak/contract";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StudioDemoEntry } from "../lib/library";
import { buildScopeRadarFields } from "../lib/radar-field";
import { displayTeamName, teamRenameGroups } from "../lib/identity";

export interface RadarFieldViewProps {
  entries: StudioDemoEntry[];
  teamRenames?: Record<string, string>;
  selectedTeam?: string | null;
  onSelectTeam?: (teamName: string | null) => void;
}

export function RadarFieldView({ entries, teamRenames = {}, selectedTeam = null, onSelectTeam }: RadarFieldViewProps) {
  const maps = useMemo(() => {
    const set = new Map<string, number>();
    for (const e of entries) if (getMapCalibration(e.meta.mapName)) set.set(e.meta.mapName, (set.get(e.meta.mapName) ?? 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const [mapName, setMapName] = useState<string | null>(null);
  const activeMap = mapName ?? maps[0]?.[0] ?? null;

  const entriesOfMap = useMemo(
    () => (activeMap ? entries.filter((e) => e.meta.mapName === activeMap) : []),
    [entries, activeMap]
  );
  const teams = useMemo(
    () => teamRenameGroups(entriesOfMap.map((e) => ({ teamA: e.meta.teamAName, teamB: e.meta.teamBName })), teamRenames),
    [entriesOfMap, teamRenames]
  );
  const teamMatchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entriesOfMap) {
      const names = new Set([
        displayTeamName(entry.meta.teamAName, teamRenames),
        displayTeamName(entry.meta.teamBName, teamRenames),
      ]);
      for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [entriesOfMap, teamRenames]);

  const activeTeam = selectedTeam && teams.some((team) => team.displayName === selectedTeam) ? selectedTeam : null;
  const invalidTeamForMap = selectedTeam !== null && activeTeam === null;

  useEffect(() => {
    if (activeMap && maps.some(([name]) => name === activeMap)) return;
    setMapName(null);
    onSelectTeam?.(null);
  }, [activeMap, maps, onSelectTeam]);

  const [field, setField] = useState<RadarField | null>(null);
  const [baseline, setBaseline] = useState<RadarField | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const reqToken = useRef(0);

  useEffect(() => {
    if (!activeMap || entriesOfMap.length === 0 || invalidTeamForMap) {
      setField(null);
      setBaseline(null);
      setProgress(null);
      return;
    }
    const token = ++reqToken.current;
    const abort = new AbortController();
    const matchIds = entriesOfMap.map((e) => e.id);
    const isTeam = activeTeam !== null;
    setProgress({ done: 0, total: matchIds.length });

    void (async () => {
      try {
        const { league, team } = await buildScopeRadarFields({
          matchIds,
          team: isTeam
            ? { name: activeTeam, includeTeam: (raw) => displayTeamName(raw, teamRenames) === activeTeam }
            : undefined,
          signal: abort.signal,
          onProgress: (done, total) => {
            if (token === reqToken.current && !abort.signal.aborted) setProgress({ done, total });
          },
        });
        if (token !== reqToken.current || abort.signal.aborted) return;
        setField(team ?? league);
        setBaseline(team ? league : null);
        setProgress(null);
      } catch {
        if (token !== reqToken.current || abort.signal.aborted) return;
        setField(null);
        setBaseline(null);
        setProgress(null);
      }
    })();
    return () => abort.abort();
  }, [activeMap, activeTeam, entriesOfMap, invalidTeamForMap, teamRenames]);

  if (maps.length === 0) {
    return <EmptyState title="暂无可分析地图" hint="先导入若干含回放（replay）的 demo，再来看覆盖场。" />;
  }

  return (
    <div className="stu-radar-field">
      <div className="stu-card stu-radar-field-head">
        <div>
          <h3>控图覆盖场</h3>
          <p className="stu-muted">
            基线 = 当前全局范围中 {activeMap} 的 {entriesOfMap.length} 场；
            队伍视图 = 该队在这些场次里的贡献。覆盖场仅作描述性观察，不自动识别弱区或生成对策。
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
        {teams.map((t) => (
          <button
            key={t.displayName}
            type="button"
            className={activeTeam === t.displayName ? "stu-chip stu-chip-active" : "stu-chip"}
            title={t.originals.length > 1 ? `已合并：${t.originals.join(" / ")}` : undefined}
            onClick={() => onSelectTeam?.(t.displayName)}
          >
            {t.displayName} <small>{teamMatchCounts.get(t.displayName) ?? 0}</small>
          </button>
        ))}
      </div>

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

      {!invalidTeamForMap && !progress && field && <RadarFieldCanvas field={field} baseline={baseline} map={{ name: activeMap!, radarImageUrl: `./maps/radars/${activeMap}.png` }} />}
      {!invalidTeamForMap && !progress && !field && activeMap && (
        <EmptyState title="该地图暂无覆盖场数据" hint="所选范围内没有含回放的长枪局。" />
      )}
    </div>
  );
}
