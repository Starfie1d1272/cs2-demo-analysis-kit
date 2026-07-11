import { ChevronDown, ChevronUp, Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { entryDate, type StudioDemoEntry } from "../lib/library";
import { displayTeamName, teamRenameGroups } from "../lib/identity";

/**
 * 聚合范围控制（CS Demo Manager 的 player filters 形态）：
 * 地图多选 + 单场勾选，选手档案与排行榜共享同一份范围状态（state 在 App）。
 */

/**
 * 聚合范围分两层：
 * - **语料层**（`maps` / `tags` / `excludedIds`）：决定加载/聚合哪些 demo（`applyScope`）。
 *   地图即一整场 demo，按图过滤等价于窄化 demo 列表，故归语料层。
 * - **透镜层**（`teams`）：不重新聚合 demo，只在已加载的 facts 上按队伍筛行（下推到
 *   `FactsScope.allowedTeamsByMatch`）。选队伍不丢对手与其他队伍交手的对局，切换队伍也无需
 *   重选 demo。
 */
export interface CohortScopeState {
  /** 语料层·赛事；空数组 = 全部 demo。 */
  eventIds: string[];
  /** 语料层·地图；空数组 = 不按地图过滤。 */
  maps: string[];
  /** 语料层·标签（任一命中即可）；空数组 = 不按标签过滤。 */
  tags: string[];
  /** 透镜层·队伍（A/B 任一命中即可）；只筛行级数据，不窄化 demo 语料。 */
  teams: string[];
  /** 语料层·手动排除的 demo id。 */
  excludedIds: string[];
}

export const EMPTY_SCOPE: CohortScopeState = { eventIds: [], maps: [], tags: [], teams: [], excludedIds: [] };

export interface CohortScopeEvent {
  id: string;
  name: string;
  entryIds: string[];
}

/** 只按语料层（地图/标签/排除）窄化 demo 集合；队伍是透镜，不在此过滤。 */
export function applyScope(
  entries: StudioDemoEntry[],
  scope: CohortScopeState,
  events: CohortScopeEvent[] = []
): StudioDemoEntry[] {
  const excluded = new Set(scope.excludedIds);
  const scopedEventIds = scope.eventIds.length > 0 && events.length > 0
    ? new Set(events.filter((event) => scope.eventIds.includes(event.id)).flatMap((event) => event.entryIds))
    : null;
  return entries.filter(
    (entry) =>
      (!scopedEventIds || scopedEventIds.has(entry.id)) &&
      (scope.maps.length === 0 || scope.maps.includes(entry.meta.mapName)) &&
      (scope.tags.length === 0 || entry.tags.some((tag) => scope.tags.includes(tag))) &&
      !excluded.has(entry.id)
  );
}

export interface CohortScopeProps {
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onChange: (scope: CohortScopeState) => void;
  teamRenames?: Record<string, string>;
  events?: CohortScopeEvent[];
  /** AnalysisContext 只允许一个 Team focus；旧多选透镜不再作为 App owner。 */
  teamSelection?: "multiple" | "single-focus";
}

export function CohortScope({ entries, scope, onChange, teamRenames = {}, events = [], teamSelection = "multiple" }: CohortScopeProps) {
  const [expanded, setExpanded] = useState(false);
  const maps = useMemo(() => [...new Set(entries.map((e) => e.meta.mapName))].sort(), [entries]);
  const tags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))].sort(), [entries]);
  const teams = useMemo(
    () => teamRenameGroups(entries.map((e) => ({ teamA: e.meta.teamAName, teamB: e.meta.teamBName })), teamRenames),
    [entries, teamRenames]
  );
  const effective = applyScope(entries, scope, events);
  const filtered = effective.length !== entries.length;

  const toggleEvent = (eventId: string) => {
    const next = scope.eventIds.includes(eventId)
      ? scope.eventIds.filter((id) => id !== eventId)
      : [...scope.eventIds, eventId];
    onChange({ ...scope, eventIds: next });
  };
  const toggleMap = (map: string) => {
    const next = scope.maps.includes(map) ? scope.maps.filter((m) => m !== map) : [...scope.maps, map];
    onChange({ ...scope, maps: next });
  };
  const toggleTag = (tag: string) => {
    const next = scope.tags.includes(tag) ? scope.tags.filter((t) => t !== tag) : [...scope.tags, tag];
    onChange({ ...scope, tags: next });
  };
  const toggleTeam = (team: string) => {
    const next = scope.teams.includes(team)
      ? scope.teams.filter((t) => t !== team)
      : teamSelection === "single-focus" ? [team] : [...scope.teams, team];
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
        {events.length > 0 && (
          <div className="stu-chip-row">
            <button
              type="button"
              className={scope.eventIds.length === 0 ? "stu-chip stu-chip-active" : "stu-chip"}
              onClick={() => onChange({ ...scope, eventIds: [] })}
            >
              全部 demo
            </button>
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                className={scope.eventIds.includes(event.id) ? "stu-chip stu-chip-active" : "stu-chip"}
                title={`${event.entryIds.length} 场`}
                onClick={() => toggleEvent(event.id)}
              >
                {event.name}
              </button>
            ))}
          </div>
        )}
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
                key={team.displayName}
                type="button"
                className={scope.teams.includes(team.displayName) ? "stu-chip stu-chip-active" : "stu-chip"}
                title={team.originals.length > 1 ? `已合并：${team.originals.join(" / ")}` : undefined}
                onClick={() => toggleTeam(team.displayName)}
              >
                {team.displayName}
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
            const date = entryDate(entry);
            return (
              <label key={entry.id} className={included ? "stu-scope-item" : "stu-scope-item stu-scope-item-off"}>
                <input
                  type="checkbox"
                  checked={!scope.excludedIds.includes(entry.id)}
                  onChange={() => toggleEntry(entry.id)}
                />
                <span className="stu-map-badge">{entry.meta.mapName}</span>
                <span className="stu-scope-item-title">
                  {displayTeamName(entry.meta.teamAName, teamRenames)} {entry.meta.teamAScore}:{entry.meta.teamBScore}{" "}
                  {displayTeamName(entry.meta.teamBName, teamRenames)}
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
