import { getDerivedCacheStore } from "../derived-cache";
import { matchIdForEntry, type StudioDemoEntry } from "../demo-entry";
import type { IdentityOptions } from "../identity";
import { displayTeamName } from "../team-identity";
import { withStoredAnalysis } from "./query-cache";
import { withTeamRenames } from "./query-scope";
import { groupAnalysisTeams } from "./tournament-groups";

export interface RoleTeamGroup {
  key: string;
  label: string;
  names: string[];
  ambiguousNames: string[];
  scopes: Array<{ label: string; teamKey?: string; teamScope?: { kind: "entity"; key: string } | { kind: "observation"; matchId: string; slot: "teamA" | "teamB" } }>;
}

export async function roleGroups(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []) {
  const matchIds = entries.map(matchIdForEntry);
  const stored = await getDerivedCacheStore().getTournament({ matchIds });
  const byMatch = new Map(stored.map(row => [row.matchId, row]));
  const input = entries.map(entry => {
    const matchId = matchIdForEntry(entry);
    return byMatch.get(matchId) ?? { matchId, mapName: entry.meta.mapName,
      teams: { teamA: entry.meta.teamAName, teamB: entry.meta.teamBName },
      teamEntityKeys: { teamA: `observed-team:${matchId}:teamA`, teamB: `observed-team:${matchId}:teamB` } };
  });
  const renamed = withTeamRenames(input, identity?.teamRenames);
  const grouped = groupAnalysisTeams(renamed, selectedTeams);
  const teamIdentityMap: Record<string, string> = {};
  const groups = new Map<string, RoleTeamGroup>();
  grouped.facts.forEach((fact, i) => {
    for (const slot of ["teamA", "teamB"] as const) {
      const key = fact.teamEntityKeys[slot], original = input[i]!;
      const name = original.teams[slot];
      teamIdentityMap[`${fact.matchId}:${slot}`] = key;
      const group = groups.get(key) ?? { key, label: fact.teams[slot], names: [], ambiguousNames: [], scopes: [] };
      if (!group.names.includes(name)) group.names.push(name);
      const unbound = original.teamEntityKeys[slot] === `observed-team:${fact.matchId}:${slot}`;
      const collision = unbound && renamed[i]!.teams.teamA === renamed[i]!.teams.teamB;
      const scope: RoleTeamGroup["scopes"][number] = collision
        ? { label: fact.teams[slot], teamScope: { kind: "observation", matchId: fact.matchId, slot } }
        : unbound ? { label: name, teamKey: name }
        : { label: name, teamScope: { kind: "entity", key } };
      if (!group.scopes.some(item => JSON.stringify([item.teamKey, item.teamScope]) === JSON.stringify([scope.teamKey, scope.teamScope]))) group.scopes.push(scope);
      groups.set(key, group);
    }
  });
  const values = [...groups.values()];
  for (const group of values) group.ambiguousNames = group.names.filter(name => values.filter(other => other.names.includes(name)).length > 1);
  return { groups: values, teamIdentityMap, selectedKeys: grouped.selectedKeys };
}

export async function getAnalysisTeamAssignments(entries: StudioDemoEntry[], identity: IdentityOptions | undefined, selectedTeams: string[]) {
  return roleGroups(entries, identity, selectedTeams);
}

/** Resolve the selected group(s) to their observed sides in each match. */
export async function getAnalysisTeamSlots(entries: StudioDemoEntry[], identity: IdentityOptions | undefined, selectedTeams: string[]): Promise<Map<string, Set<"teamA" | "teamB">> | null> {
  if (!selectedTeams.length) return null;
  const { teamIdentityMap, selectedKeys } = await roleGroups(entries, identity, selectedTeams);
  const selected = new Set(selectedKeys);
  return new Map(entries.map(entry => {
    const matchId = matchIdForEntry(entry);
    return [matchId, new Set((["teamA", "teamB"] as const).filter(slot => selected.has(teamIdentityMap[`${matchId}:${slot}`]!)))];
  }));
}

/** Selector groups and their matching entries use the same local grouping as role evidence. */
export function getTeamAnalysisGroups(entries: StudioDemoEntry[], identity?: IdentityOptions): Promise<Array<{ key: string; name: string; names: string[]; label: string; matchIds: string[] }>> {
  return withStoredAnalysis(entries, async () => {
    const { groups, teamIdentityMap } = await roleGroups(entries, identity);
    return groups.map(group => ({
      key: group.key,
      name: [...new Set(group.names.map(name => displayTeamName(name, identity?.teamRenames)))].sort((a, b) => a.localeCompare(b))[0]!,
      names: [...new Set(group.names.map(name => displayTeamName(name, identity?.teamRenames)))],
      label: group.label,
      matchIds: [...new Set(entries.map(matchIdForEntry).filter(matchId =>
        (["teamA", "teamB"] as const).some(slot => teamIdentityMap[`${matchId}:${slot}`] === group.key)))],
    })).sort((a, b) => b.matchIds.length - a.matchIds.length || a.name.localeCompare(b.name));
  }, true);
}

export async function getRoleTeamEntries(entries: StudioDemoEntry[], identity: IdentityOptions | undefined, team: string): Promise<StudioDemoEntry[]> {
  return withStoredAnalysis(entries, async () => {
    const grouped = await roleGroups(entries, identity, [team]);
    const selected = new Set(grouped.selectedKeys);
    return entries.filter(entry => ["teamA", "teamB"].some(slot => selected.has(grouped.teamIdentityMap[`${matchIdForEntry(entry)}:${slot}`]!)));
  }, true);
}

