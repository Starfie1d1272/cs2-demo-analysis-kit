/**
 * 雷达覆盖场（控图）——描述性地图控制，不上评分。
 *
 * 三个核心用途：① 赛事全量基线（地图客观可视性）② 队伍防守漏洞（守得低于联赛平均的格）
 * ③ 队伍进攻/防守倾向（队伍 − 联赛差分）。底层四基础场加性、持久化缓存，换 scope 秒切。
 */
import { EmptyState } from "@cs2dak/react";
import { RadarFieldCanvas } from "@cs2dak/react";
import { getMapCalibration } from "@cs2dak/maps";
import type { RadarField } from "@cs2dak/contract";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StudioDemoEntry } from "../lib/library";
import { buildScopeRadarField } from "../lib/radar-field";
import { displayTeamName, teamRenameGroups } from "../lib/identity";

export interface RadarFieldViewProps {
  entries: StudioDemoEntry[];
  teamRenames?: Record<string, string>;
}

const LEAGUE = "__league__";

export function RadarFieldView({ entries, teamRenames = {} }: RadarFieldViewProps) {
  const maps = useMemo(() => {
    const set = new Map<string, number>();
    for (const e of entries) if (getMapCalibration(e.meta.mapName)) set.set(e.meta.mapName, (set.get(e.meta.mapName) ?? 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const [mapName, setMapName] = useState<string | null>(null);
  const activeMap = mapName ?? maps[0]?.[0] ?? null;
  const [scopeSel, setScopeSel] = useState<string>(LEAGUE);

  const entriesOfMap = useMemo(
    () => (activeMap ? entries.filter((e) => e.meta.mapName === activeMap) : []),
    [entries, activeMap]
  );
  const teams = useMemo(
    () => teamRenameGroups(entriesOfMap.map((e) => ({ teamA: e.meta.teamAName, teamB: e.meta.teamBName })), teamRenames),
    [entriesOfMap, teamRenames]
  );

  const [field, setField] = useState<RadarField | null>(null);
  const [baseline, setBaseline] = useState<RadarField | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const reqToken = useRef(0);

  useEffect(() => {
    if (!activeMap || entriesOfMap.length === 0) {
      setField(null);
      setBaseline(null);
      return;
    }
    const token = ++reqToken.current;
    const matchIds = entriesOfMap.map((e) => e.id);
    const isTeam = scopeSel !== LEAGUE;
    setProgress({ done: 0, total: matchIds.length });

    void (async () => {
      const league = await buildScopeRadarField({
        matchIds,
        scope: { kind: "league", team: null },
        onProgress: (done, total) => {
          if (token === reqToken.current) setProgress({ done, total });
        },
      });
      let team: RadarField | null = null;
      if (isTeam) {
        team = await buildScopeRadarField({
          matchIds,
          scope: { kind: "team", team: scopeSel },
          includeTeam: (raw) => displayTeamName(raw, teamRenames) === scopeSel,
        });
      }
      if (token !== reqToken.current) return;
      setField(team ?? league);
      setBaseline(team ? league : null);
      setProgress(null);
    })();
  }, [activeMap, scopeSel, entriesOfMap, teamRenames]);

  if (maps.length === 0) {
    return <EmptyState title="暂无可分析地图" hint="先导入若干含回放（replay）的 demo，再来看覆盖场。" />;
  }

  return (
    <div className="stu-radar-field">
      <div className="stu-subtabs" role="tablist" aria-label="地图">
        {maps.map(([m, n]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={activeMap === m}
            className={activeMap === m ? "stu-subtab stu-subtab-active" : "stu-subtab"}
            onClick={() => { setMapName(m); setScopeSel(LEAGUE); }}
          >
            {m} <small>{n}</small>
          </button>
        ))}
      </div>

      <div className="dak-heatmap-player-filter" aria-label="对象">
        <button
          type="button"
          className={scopeSel === LEAGUE ? "stu-chip stu-chip-active" : "stu-chip"}
          onClick={() => setScopeSel(LEAGUE)}
        >
          赛事基线
        </button>
        {teams.map((t) => (
          <button
            key={t.displayName}
            type="button"
            className={scopeSel === t.displayName ? "stu-chip stu-chip-active" : "stu-chip"}
            title={t.originals.length > 1 ? `已合并：${t.originals.join(" / ")}` : undefined}
            onClick={() => setScopeSel(t.displayName)}
          >
            {t.displayName}
          </button>
        ))}
      </div>

      {progress && (
        <div className="stu-notice" role="status">
          计算覆盖场 {progress.done}/{progress.total} 场（首次较慢，结果已缓存，之后秒开）…
        </div>
      )}

      {!progress && field && <RadarFieldCanvas field={field} baseline={baseline} map={{ name: activeMap!, radarImageUrl: `./maps/radars/${activeMap}.png` }} />}
      {!progress && !field && activeMap && (
        <EmptyState title="该地图暂无覆盖场数据" hint="所选范围内没有含回放的长枪局。" />
      )}
    </div>
  );
}
