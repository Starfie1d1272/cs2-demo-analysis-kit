import { buildObservedMapPoolComparison, type ObservedMapPoolRow } from "@cs2dak/analytics";
import type { TacticalRoundFact } from "@cs2dak/tactics";
import { withTacticalDisplayGroupKeys } from "../tactical-display-groups";
import { buildPlayerMapRoleEvidence, buildTeamMapResponsibilityEvidence } from "@cs2dak/tactics";
import { buildDoubleAwpAnalyses, buildPlayerMapRoleProfiles, buildPlayerMapPool, buildPlayerMapPerformance, buildTeamMapRoleMatrices } from "@cs2dak/analytics";
import { createAnalysisBucket, cachedQuery, readPersistedValue, writePersistedValue, ensureAnalysisDataReady, getAnalysisDataGeneration, assertAnalysisGeneration } from "./query-cache";
import { assertCurrentFacts } from "../facts-readiness";
import { getFactsStore } from "../facts-store";
import type { DoubleAwpAnalysis, PlayerMapRoleEvidence, PlayerMapRoleProfile, PlayerMapPoolRow, RoleDeclaration, TeamMapRoleMatrix, TeamMapResponsibilityEvidence } from "@cs2dak/tactics";
import { entryDate, matchIdForEntry, type StudioDemoEntry } from "../library";
import { displayTeamName } from "../identity";

import type { IdentityOptions } from "../identity";
import { keyOf, missingFactsError } from "./query-scope";
const SMALL_CACHE_LIMIT = 3;

const mapRoleEvidenceCache = createAnalysisBucket<MapRoleEvidenceSummary>();
/** Persistable, declaration-independent role evidence. Declarations are intentionally merged only at presentation call time. */
export interface MapRoleEvidenceSummary {
  playerEvidence: PlayerMapRoleEvidence[];
  teamEvidence: TeamMapResponsibilityEvidence[];
}

function roleTeamIdentityMap(entries: StudioDemoEntry[], identity?: IdentityOptions): Record<string, string> {
  return Object.fromEntries(entries.flatMap((entry) => {
    const matchId = matchIdForEntry(entry);
    return [
      [`${matchId}:teamA`, displayTeamName(entry.meta.teamAName, identity?.teamRenames)],
      [`${matchId}:teamB`, displayTeamName(entry.meta.teamBName, identity?.teamRenames)],
    ];
  }));
}

export function getMapRoleEvidence(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<MapRoleEvidenceSummary> {
  const teamIdentityMap = roleTeamIdentityMap(entries, identity);
  const teamMappingKey = Object.entries(teamIdentityMap).sort(([a], [b]) => a.localeCompare(b)).map(([raw, canonical]) => `${raw}=${canonical}`).join("|");
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:map-role-evidence:v4:team-map=${teamMappingKey}`;
  return cachedQuery(mapRoleEvidenceCache, key, SMALL_CACHE_LIMIT, () => assertCurrentFacts(entries), async (generation) => {
    const persisted = await readPersistedValue<MapRoleEvidenceSummary>(key, generation);
    if (persisted) return persisted;
    const factsStore = getFactsStore();
    const matchIds = entries.map(matchIdForEntry);
    const [playerPositionRounds, teamShapeRounds] = await Promise.all([
      factsStore.getPlayerPositionRounds({ matchIds }),
      factsStore.getTeamShapeRounds({ matchIds }),
    ]);
    if (entries.length > 0 && playerPositionRounds.length === 0 && teamShapeRounds.length === 0) throw missingFactsError("地图职责证据");
    const options = { identityMap: identity?.map, teamIdentityMap };
    const playerEvidence = buildPlayerMapRoleEvidence({ playerPositionRounds, teamShapeRounds }, options)
      .filter((row) => selectedTeams.length === 0 || selectedTeams.includes(row.teamKey));
    const teamEvidence = buildTeamMapResponsibilityEvidence({ playerPositionRounds, teamShapeRounds }, options)
      .filter((row) => selectedTeams.length === 0 || selectedTeams.includes(row.teamKey));
    const summary = { playerEvidence, teamEvidence };
    await writePersistedValue(key, summary, generation);
    return summary;
  });
}

/** Declarations are input only: they never enter persisted evidence/cache keys and never overwrite automatic inference. */
export async function getPlayerMapRoleProfiles(
  entries: StudioDemoEntry[],
  declarations: RoleDeclaration[] = [],
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<PlayerMapRoleProfile[]> {
  const evidence = await getMapRoleEvidence(entries, identity, selectedTeams);
  return buildPlayerMapRoleProfiles(evidence.playerEvidence, declarations, { matchTimes: Object.fromEntries(entries.map((entry) => {
    const date = entryDate(entry);
    return [matchIdForEntry(entry), date ? `${date}T00:00:00.000Z` : null];
  })) });
}

export async function getTeamMapRoleMatrices(
  entries: StudioDemoEntry[],
  declarations: RoleDeclaration[] = [],
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<TeamMapRoleMatrix[]> {
  const evidence = await getMapRoleEvidence(entries, identity, selectedTeams);
  return buildTeamMapRoleMatrices(evidence.teamEvidence, buildPlayerMapRoleProfiles(evidence.playerEvidence, declarations, { matchTimes: Object.fromEntries(entries.map((entry) => {
    const date = entryDate(entry);
    return [matchIdForEntry(entry), date ? `${date}T00:00:00.000Z` : null];
  })) }));
}

export async function getDoubleAwpAnalysis(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<DoubleAwpAnalysis[]> {
  assertCurrentFacts(entries);
  await ensureAnalysisDataReady();
  const generation = getAnalysisDataGeneration();
  const factsStore = getFactsStore();
  const matchIds = entries.map(matchIdForEntry);
  const [rows, positions] = await Promise.all([factsStore.getTeamAwpRounds({ matchIds }), factsStore.getPlayerPositionRounds({ matchIds })]);
  const teams = roleTeamIdentityMap(entries, identity);
  const players = new Map(positions.map((row) => [`${row.matchId}:${row.playerIndex}`, (() => {
    const mapped = identity?.map[row.steamId64];
    return mapped == null ? `steam:${row.steamId64}` : typeof mapped === "string" ? mapped : mapped.playerKey;
  })()]));
  assertAnalysisGeneration(generation);
  return buildDoubleAwpAnalyses(rows, {
    teamKeyFor: (matchId, rawTeamKey) => teams[`${matchId}:${rawTeamKey}`] ?? `${matchId}:${rawTeamKey}`,
    playerKeyFor: (matchId, playerIndex) => players.get(`${matchId}:${playerIndex}`) ?? `${matchId}:player:${playerIndex}`,
  }).filter((row) => selectedTeams.length === 0 || selectedTeams.includes(row.teamKey));
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
