import { ChevronDown, ChevronUp, Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { matchDateFromFileName, type StudioDemoEntry } from "../lib/library";

/**
 * 聚合范围控制（CS Demo Manager 的 player filters 形态）：
 * 地图多选 + 单场勾选，选手档案与排行榜共享同一份范围状态（state 在 App）。
 */

export interface CohortScopeState {
  /** 选中的地图；空数组 = 不按地图过滤。 */
  maps: string[];
  /** 选中的标签（任一命中即可）；空数组 = 不按标签过滤。 */
  tags: string[];
  /** 选中的队伍（A/B 任一命中即可）；空数组 = 不按队伍过滤。 */
  teams: string[];
  /** 手动排除的 demo id。 */
  excludedIds: string[];
}

export const EMPTY_SCOPE: CohortScopeState = { maps: [], tags: [], teams: [], excludedIds: [] };

export function applyScope(entries: StudioDemoEntry[], scope: CohortScopeState): StudioDemoEntry[] {
  const excluded = new Set(scope.excludedIds);
  return entries.filter(
    (entry) =>
      (scope.maps.length === 0 || scope.maps.includes(entry.meta.mapName)) &&
      (scope.tags.length === 0 || entry.tags.some((tag) => scope.tags.includes(tag))) &&
      (scope.teams.length === 0 ||
        scope.teams.includes(entry.meta.teamAName) ||
        scope.teams.includes(entry.meta.teamBName)) &&
      !excluded.has(entry.id)
  );
}

export interface CohortScopeProps {
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onChange: (scope: CohortScopeState) => void;
}

export function CohortScope({ entries, scope, onChange }: CohortScopeProps) {
  const [expanded, setExpanded] = useState(false);
  const maps = useMemo(() => [...new Set(entries.map((e) => e.meta.mapName))].sort(), [entries]);
  const tags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))].sort(), [entries]);
  const teams = useMemo(
    () => [...new Set(entries.flatMap((e) => [e.meta.teamAName, e.meta.teamBName]))].sort(),
    [entries]
  );
  const effective = applyScope(entries, scope);
  const filtered = effective.length !== entries.length;

  const toggleMap = (map: string) => {
    const next = scope.maps.includes(map) ? scope.maps.filter((m) => m !== map) : [...scope.maps, map];
    onChange({ ...scope, maps: next });
  };
  const toggleTag = (tag: string) => {
    const next = scope.tags.includes(tag) ? scope.tags.filter((t) => t !== tag) : [...scope.tags, tag];
    onChange({ ...scope, tags: next });
  };
  const toggleTeam = (team: string) => {
    const next = scope.teams.includes(team) ? scope.teams.filter((t) => t !== team) : [...scope.teams, team];
    onChange({ ...scope, teams: next });
  };
  const toggleEntry = (id: string) => {
    const next = scope.excludedIds.includes(id)
      ? scope.excludedIds.filter((x) => x !== id)
      : [...scope.excludedIds, id];
    onChange({ ...scope, excludedIds: next });
  };

  return (
    <div className={filtered ? "stu-scope stu-scope-filtered" : "stu-scope"}>
      <div className="stu-scope-bar">
        <span className="stu-scope-label">
          <Filter size={13} />
          聚合范围 <b>{effective.length}</b>/{entries.length} 场
        </span>
        <div className="stu-chip-row">
          <button
            type="button"
            className={scope.maps.length === 0 ? "stu-chip stu-chip-active" : "stu-chip"}
            onClick={() => onChange({ ...scope, maps: [] })}
          >
            全部地图
          </button>
          {maps.map((map) => (
            <button
              key={map}
              type="button"
              className={scope.maps.includes(map) ? "stu-chip stu-chip-active" : "stu-chip"}
              onClick={() => toggleMap(map)}
            >
              {map}
            </button>
          ))}
        </div>
        {teams.length > 1 && (
          <div className="stu-chip-row">
            <button
              type="button"
              className={scope.teams.length === 0 ? "stu-chip stu-chip-active" : "stu-chip"}
              onClick={() => onChange({ ...scope, teams: [] })}
            >
              全部队伍
            </button>
            {teams.map((team) => (
              <button
                key={team}
                type="button"
                className={scope.teams.includes(team) ? "stu-chip stu-chip-active" : "stu-chip"}
                onClick={() => toggleTeam(team)}
              >
                {team}
              </button>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="stu-chip-row">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={scope.tags.includes(tag) ? "stu-chip stu-chip-active" : "stu-chip"}
                onClick={() => toggleTag(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="stu-scope-toggle" onClick={() => setExpanded((v) => !v)}>
          按场次筛选 {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {filtered && (
          <button type="button" className="stu-scope-reset" onClick={() => onChange(EMPTY_SCOPE)}>
            重置
          </button>
        )}
      </div>
      {expanded && (
        <div className="stu-scope-list">
          {entries.map((entry) => {
            const included = effective.some((e) => e.id === entry.id);
            const date = matchDateFromFileName(entry.fileName);
            return (
              <label key={entry.id} className={included ? "stu-scope-item" : "stu-scope-item stu-scope-item-off"}>
                <input
                  type="checkbox"
                  checked={!scope.excludedIds.includes(entry.id)}
                  onChange={() => toggleEntry(entry.id)}
                />
                <span className="stu-map-badge">{entry.meta.mapName}</span>
                <span className="stu-scope-item-title">
                  {entry.meta.teamAName} {entry.meta.teamAScore}:{entry.meta.teamBScore} {entry.meta.teamBName}
                </span>
                {date && <small className="stu-dim">{date}</small>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
