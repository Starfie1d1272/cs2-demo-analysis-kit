import { buildObservedMapPoolComparison, type ObservedMapPoolRow } from "@cs2dak/analytics";
import type { TacticalRoundFact } from "@cs2dak/tactics";
import { withTacticalDisplayGroupKeys } from "../tactical-display-groups";
import { buildPlayerMapRoleEvidence, buildTeamMapResponsibilityEvidence } from "@cs2dak/tactics";
import { buildDoubleAwpAnalyses, buildPlayerMapRoleProfiles, buildPlayerMapPool, buildPlayerMapPerformance, buildTeamMapRoleMatrices } from "@cs2dak/analytics";
import { createAnalysisBucket, cachedQuery, readPersistedValue, writePersistedValue, ensureAnalysisDataReady, getAnalysisDataGeneration, assertAnalysisGeneration } from "./query-cache";
import { assertCurrentFacts } from "../facts-readiness";
import { getFactsStore } from "../facts-store";
import { getDerivedCacheStore } from "../derived-cache";
import { groupAnalysisTeams } from "./tournament-groups";
import { withTeamRenames } from "./query-scope";
import type { DoubleAwpAnalysis, PlayerMapRoleEvidence, PlayerMapRoleProfile, PlayerMapPoolRow, RoleDeclaration, TeamMapRoleMatrix, TeamMapResponsibilityEvidence } from "@cs2dak/tactics";
import { entryDate, matchIdForEntry, type StudioDemoEntry } from "../demo-entry";
import { displayTeamName } from "../team-identity";

import type { IdentityOptions } from "../identity";
import { keyOf, missingFactsError } from "./query-scope";
const SMALL_CACHE_LIMIT = 3;

const mapRoleEvidenceCache = createAnalysisBucket<MapRoleEvidenceSummary>();
/** Persistable, declaration-independent role evidence. Declarations are intentionally merged only at presentation call time. */
export interface MapRoleEvidenceSummary {
  playerEvidence: PlayerMapRoleEvidence[];
  teamEvidence: TeamMapResponsibilityEvidence[];
  groups: RoleTeamGroup[];
  teamIdentityMap: Record<string, string>;
}

export interface RoleTeamGroup {
  key: string;
  label: string;
  names: string[];
  ambiguousNames: string[];
  scopes: Array<{ label: string; teamKey?: string; teamScope?: RoleDeclaration["teamScope"] }>;
}

async function roleGroups(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []) {
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

export async function getRoleTeamEntries(entries: StudioDemoEntry[], identity: IdentityOptions | undefined, team: string): Promise<StudioDemoEntry[]> {
  const grouped = await roleGroups(entries, identity, [team]);
  const selected = new Set(grouped.selectedKeys);
  return entries.filter(entry => ["teamA", "teamB"].some(slot => selected.has(grouped.teamIdentityMap[`${matchIdForEntry(entry)}:${slot}`]!)));
}

export function getMapRoleEvidence(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<MapRoleEvidenceSummary> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:map-role-evidence:v6`;
  return cachedQuery(mapRoleEvidenceCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), async (generation) => {
    const persisted = await readPersistedValue<MapRoleEvidenceSummary>(key, generation);
    if (persisted) return persisted;
    const { teamIdentityMap, groups, selectedKeys } = await roleGroups(entries, identity, selectedTeams);
    const selected = new Set(selectedKeys);
    const factsStore = getFactsStore();
    const matchIds = entries.map(matchIdForEntry);
    const [playerPositionRounds, teamShapeRounds] = await Promise.all([
      factsStore.getPlayerPositionRounds({ matchIds }),
      factsStore.getTeamShapeRounds({ matchIds }),
    ]);
    if (entries.length > 0 && playerPositionRounds.length === 0 && teamShapeRounds.length === 0) throw missingFactsError("地图职责证据");
    const options = { identityMap: identity?.map, teamIdentityMap };
    const playerEvidence = buildPlayerMapRoleEvidence({ playerPositionRounds, teamShapeRounds }, options)
      .filter((row) => selectedTeams.length === 0 || selected.has(row.teamKey));
    const teamEvidence = buildTeamMapResponsibilityEvidence({ playerPositionRounds, teamShapeRounds }, options)
      .filter((row) => selectedTeams.length === 0 || selected.has(row.teamKey));
    const summary = { playerEvidence, teamEvidence, groups, teamIdentityMap };
    await writePersistedValue(key, summary, generation);
    return summary;
  });
}

function scopedRoleDeclarations(declarations: RoleDeclaration[], evidence: MapRoleEvidenceSummary): RoleDeclaration[] {
  return declarations.flatMap(declaration => {
    const scope = declaration.teamScope;
    if (scope?.kind === "entity") return evidence.groups.some(g => g.key === scope.key) ? [{ ...declaration, teamKey: scope.key }] : [];
    if (scope?.kind === "observation") {
      const key = evidence.teamIdentityMap[`${scope.matchId}:${scope.slot}`];
      return key ? [{ ...declaration, teamKey: key }] : [];
    }
    if (declaration.teamKey == null) return [declaration];
    const matches = evidence.groups.filter(group => group.names.includes(declaration.teamKey!));
    return matches.length === 1 ? [{ ...declaration, teamKey: matches[0]!.key }] : [];
  });
}

/** Declarations are input only: they never enter persisted evidence/cache keys and never overwrite automatic inference. */
export async function getPlayerMapRoleProfiles(
  entries: StudioDemoEntry[],
  declarations: RoleDeclaration[] = [],
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<Array<PlayerMapRoleProfile & { teamGroup: RoleTeamGroup }>> {
  const evidence = await getMapRoleEvidence(entries, identity, selectedTeams);
  return buildPlayerMapRoleProfiles(evidence.playerEvidence, scopedRoleDeclarations(declarations, evidence), { aggregatedEvidence: evidence.teamEvidence.flatMap(row => row.players), matchTimes: Object.fromEntries(entries.map((entry) => {
    const date = entryDate(entry);
    return [matchIdForEntry(entry), date ? `${date}T00:00:00.000Z` : null];
  })) }).map(profile => ({ ...profile, teamGroup: evidence.groups.find(group => group.key === profile.teamKey)! }));
}

export async function getTeamMapRoleMatrices(
  entries: StudioDemoEntry[],
  declarations: RoleDeclaration[] = [],
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<Array<TeamMapRoleMatrix & { teamGroup: RoleTeamGroup }>> {
  const evidence = await getMapRoleEvidence(entries, identity, selectedTeams);
  return buildTeamMapRoleMatrices(evidence.teamEvidence, buildPlayerMapRoleProfiles(evidence.playerEvidence, scopedRoleDeclarations(declarations, evidence), { aggregatedEvidence: evidence.teamEvidence.flatMap(row => row.players), matchTimes: Object.fromEntries(entries.map((entry) => {
    const date = entryDate(entry);
    return [matchIdForEntry(entry), date ? `${date}T00:00:00.000Z` : null];
  })) })).map(matrix => ({ ...matrix, teamGroup: evidence.groups.find(group => group.key === matrix.teamKey)! }));
}

export async function getDoubleAwpAnalysis(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<DoubleAwpAnalysis[]> {
  assertCurrentFacts(entries);
  await ensureAnalysisDataReady();
  const generation = getAnalysisDataGeneration();
  const factsStore = getFactsStore();
  const matchIds = entries.map(matchIdForEntry);
  const [rows, positions] = await Promise.all([factsStore.getTeamAwpRounds({ matchIds }), factsStore.getPlayerPositionRounds({ matchIds })]);
  const { teamIdentityMap: teams, selectedKeys } = await roleGroups(entries, identity, selectedTeams);
  const selected = new Set(selectedKeys);
  const players = new Map(positions.map((row) => [`${row.matchId}:${row.playerIndex}`, (() => {
    const mapped = identity?.map[row.steamId64];
    return mapped == null ? `steam:${row.steamId64}` : typeof mapped === "string" ? mapped : mapped.playerKey;
  })()]));
  assertAnalysisGeneration(generation);
  return buildDoubleAwpAnalyses(rows, {
    teamKeyFor: (matchId, rawTeamKey) => teams[`${matchId}:${rawTeamKey}`] ?? `${matchId}:${rawTeamKey}`,
    playerKeyFor: (matchId, playerIndex) => players.get(`${matchId}:${playerIndex}`) ?? `${matchId}:player:${playerIndex}`,
  }).filter((row) => selectedTeams.length === 0 || selected.has(row.teamKey));
}

export interface PlayerMapPoolResult { rows: PlayerMapPoolRow[]; unsupportedMapNames: string[] }
export async function getPlayerMapPool(entries: StudioDemoEntry[], playerKey: string, roleProfile: PlayerMapRoleProfile | null, identity?: IdentityOptions): Promise<PlayerMapPoolResult> {
  assertCurrentFacts(entries);
  await ensureAnalysisDataReady();
  const generation = getAnalysisDataGeneration();
  const matchIds = entries.map(matchIdForEntry);
  const facts = getFactsStore();
  const [cohortRows, weaponRows] = await Promise.all([facts.getRrSignalRows({ matchIds }), facts.getPlayerWeapons({ matchIds })]);
  assertAnalysisGeneration(generation);
  const result = buildPlayerMapPerformance({ playerKey, identityMap: identity?.map ?? {}, cohortRows, weaponRows,
    matches: entries.map(entry => ({ matchId: matchIdForEntry(entry), mapName: entry.meta.mapName, teamAScore: entry.meta.teamAScore, teamBScore: entry.meta.teamBScore })) });
  return { rows: buildPlayerMapPool(result.rows, roleProfile), unsupportedMapNames: result.unsupportedMapNames };
}

/** Display grouping keys are local lenses, not frozen Tournament identities. */
export function getObservedMapPool(facts: readonly TacticalRoundFact[], own: string | null, opponent: string | null, renames: Record<string, string>): ObservedMapPoolRow[] {
  const norm = (name: string) => displayTeamName(name, renames).trim().toLowerCase();
  const select = (name: string | null) => withTacticalDisplayGroupKeys(name ? facts.filter(row => norm(row.teamName) === norm(name)) : [], renames);
  return buildObservedMapPoolComparison({ mapNames: [...new Set(facts.map(row => row.mapName))].sort(), ownRounds: select(own), opponentRounds: select(opponent) });
}
