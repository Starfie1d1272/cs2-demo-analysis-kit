import { type TournamentInsights, type DuelInsightsFacts } from "@cs2dak/analytics";
import { CACHE_VERSION } from "./query-cache";
import { FACTS_REVISION } from "../analysis-manifest";
import { entryDate, matchIdForEntry, type StudioDemoEntry } from "../demo-entry";
import { originalTeamNamesForDisplay } from "../identity";

export function seasonCacheKey(
  entries: StudioDemoEntry[],
  identityVersion?: number,
  selectedTeams: string[] = [],
  factsRevision = FACTS_REVISION,
): string {
  const factsPart = `:facts=${factsRevision}`;
  const idPart = identityVersion ? `:idv${identityVersion}` : "";
  const teamPart = selectedTeams.length > 0 ? `:teams=${[...selectedTeams].sort().join(",")}` : "";
  return `v${CACHE_VERSION}${factsPart}${idPart}${teamPart}:` + entries.map((entry) => {
    return `${entry.id}@${matchIdForEntry(entry)}`;
  }).sort().join("|");
}

export const keyOf = seasonCacheKey;

export function orderedMatchIds(entries: StudioDemoEntry[]): string[] {
  return [...entries].sort((a, b) => (entryDate(a) ?? "9999").localeCompare(entryDate(b) ?? "9999") || a.id.localeCompare(b.id)).map(matchIdForEntry);
}

export function selectedOriginalTeams(selectedTeams: string[], renames?: Record<string, string>): Set<string> {
  return new Set(selectedTeams.flatMap((team) => originalTeamNamesForDisplay(team, renames ?? {})));
}

export function allowedTeamKeysByMatch(
  entries: StudioDemoEntry[],
  selectedTeams: string[],
  renames?: Record<string, string>,
): Map<string, Set<"teamA" | "teamB">> | null {
  if (selectedTeams.length === 0) return null;
  const selected = selectedOriginalTeams(selectedTeams, renames);
  return new Map(entries.map((entry) => {
    const keys = new Set<"teamA" | "teamB">();
    if (selected.has(entry.meta.teamAName)) keys.add("teamA");
    if (selected.has(entry.meta.teamBName)) keys.add("teamB");
    return [matchIdForEntry(entry), keys];
  }));
}

export function filterDuelFactsByTeam(
  facts: DuelInsightsFacts[],
  selectedTeams: string[],
  renames?: Record<string, string>,
): DuelInsightsFacts[] {
  if (selectedTeams.length === 0) return facts;
  const selected = selectedOriginalTeams(selectedTeams, renames);
  return facts.map((fact) => {
    const selectedSteamIds = new Set(Object.entries(fact.teamNamesBySteamId)
      .filter(([, teamName]) => selected.has(teamName))
      .map(([steamId]) => steamId));
    const involvedInDuel = (row: { killerSteamId64: string; victimSteamId64: string }) =>
      selectedSteamIds.has(row.killerSteamId64) || selectedSteamIds.has(row.victimSteamId64);
    return {
      ...fact,
      duelRows: fact.duelRows.filter(involvedInDuel),
      openingRows: fact.openingRows.filter(involvedInDuel),
      mechanicsRows: fact.mechanicsRows.filter((row) => selectedSteamIds.has(row.steamId64)),
      // 对枪投影只缩窄焦点队的机制聚合；保留下来的击杀仍需要对手队伍
      // 上下文，不能把 victim/killer 的队名映射一并删除。
      teamNamesBySteamId: fact.teamNamesBySteamId,
    };
  });
}

/**
 * 队伍透镜（match 级）：按队伍过滤 TournamentInsights 的各队伍数组。
 * insights 由已 `withTeamRenames` 的 facts 构建，teamName 是显示名，
 * 故直接按 selectedTeams（显示名）匹配，不走 originalTeamNamesForDisplay。
 */
export function filterTournamentInsightsByTeam(insights: TournamentInsights, selectedTeams: string[]): TournamentInsights {
  if (selectedTeams.length === 0) return insights;
  const selected = new Set(selectedTeams);
  const byTeam = <T extends { teamName: string }>(rows: T[]) => rows.filter((row) => selected.has(row.teamName));
  return {
    ...insights,
    teamPistols: byTeam(insights.teamPistols),
    ecoUpsets: byTeam(insights.ecoUpsets),
    teamManAdvantageConversions: byTeam(insights.teamManAdvantageConversions),
    teamEconomySummaries: byTeam(insights.teamEconomySummaries),
  };
}

export function missingFactsError(scope: string): Error {
  return new Error(`${scope} 缺少本地持久化 facts，请重新导入或执行 facts 回填后再打开。`);
}

/**
 * 只替换 facts 的展示队名；Tournament 归并仍使用已持久化的 stable entity ID。
 * 两个不同 ID 即使同名也保持独立，改名不会建立或移除身份绑定。
 * cache key 已并入 identity.version（改名 +1），无需额外失效处理。
 */
export function withTeamRenames<T extends { teams: Record<string, string> }>(
  facts: T[],
  renames?: Record<string, string>
): T[] {
  if (!renames || Object.keys(renames).length === 0) return facts;
  return facts.map((f) => ({
    ...f,
    teams: Object.fromEntries(Object.entries(f.teams).map(([k, v]) => [k, renames[v] ?? v]))
  }));
}
