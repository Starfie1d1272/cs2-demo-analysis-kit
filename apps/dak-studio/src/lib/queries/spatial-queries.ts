import { buildObservedMapPoolComparison, type ObservedMapPoolRow } from '@cs2dak/analytics';
import type { TacticalRoundFact } from '@cs2dak/tactics';
import { withTacticalDisplayGroupKeys } from '../tactical-display-groups';
import { buildPlayerMapRoleEvidence, buildTeamMapResponsibilityEvidence } from '@cs2dak/tactics';
import {
  buildDoubleAwpAnalyses,
  buildPlayerMapRoleProfiles,
  buildPlayerMapPool,
  buildPlayerMapPerformance,
  buildTeamMapRoleMatrices,
} from '@cs2dak/analytics';
import {
  createAnalysisBucket,
  cachedQuery,
  readPersistedValue,
  writePersistedValue,
  ensureAnalysisDataReady,
  beginStoredAnalysis,
  endStoredAnalysis,
  withStoredAnalysis,
} from './query-cache';
import { assertCurrentFacts } from '../facts-readiness';
import { getFactsStore } from '../facts-store';
import { getDerivedCacheStore } from '../derived-cache';
import type {
  DoubleAwpAnalysis,
  PlayerMapRoleEvidence,
  PlayerMapRoleProfile,
  PlayerMapPoolRow,
  RoleDeclaration,
  TeamMapRoleMatrix,
  TeamMapResponsibilityEvidence,
} from '@cs2dak/tactics';
import { entryDate, matchIdForEntry, type StudioDemoEntry } from '../demo-entry';
import { displayTeamName } from '../team-identity';

import type { IdentityOptions } from '../identity';
import { roleGroups, type RoleTeamGroup } from './team-scope';
import { keyOf, missingFactsError } from './query-scope';
const SMALL_CACHE_LIMIT = 3;

const mapRoleEvidenceCache = createAnalysisBucket<MapRoleEvidenceSummary>();
/** Persistable, declaration-independent role evidence. Declarations are intentionally merged only at presentation call time. */
export interface MapRoleEvidenceSummary {
  playerEvidence: PlayerMapRoleEvidence[];
  teamEvidence: TeamMapResponsibilityEvidence[];
  groups: RoleTeamGroup[];
  teamIdentityMap: Record<string, string>;
}

export function getMapRoleEvidence(
  entries: StudioDemoEntry[],
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<MapRoleEvidenceSummary> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:map-role-evidence:v7`;
  return cachedQuery(
    mapRoleEvidenceCache,
    key,
    SMALL_CACHE_LIMIT,
    () => assertCurrentFacts(entries),
    entries,
    async (generation) => {
      const persisted = await readPersistedValue<MapRoleEvidenceSummary>(key, generation);
      if (persisted) return persisted;
      const { teamIdentityMap, groups, selectedKeys } = await roleGroups(
        entries,
        identity,
        selectedTeams,
      );
      const selected = new Set(selectedKeys);
      const factsStore = getFactsStore();
      const matchIds = entries.map(matchIdForEntry);
      const [playerPositionRounds, teamShapeRounds] = await Promise.all([
        factsStore.getPlayerPositionRounds({ matchIds }),
        factsStore.getTeamShapeRounds({ matchIds }),
      ]);
      if (entries.length > 0 && playerPositionRounds.length === 0 && teamShapeRounds.length === 0)
        throw missingFactsError('地图职责证据');
      const options = { identityMap: identity?.map, teamIdentityMap };
      const playerEvidence = buildPlayerMapRoleEvidence(
        { playerPositionRounds, teamShapeRounds },
        options,
      ).filter((row) => selectedTeams.length === 0 || selected.has(row.teamKey));
      const teamEvidence = buildTeamMapResponsibilityEvidence(
        { playerPositionRounds, teamShapeRounds },
        options,
      ).filter((row) => selectedTeams.length === 0 || selected.has(row.teamKey));
      const summary = { playerEvidence, teamEvidence, groups, teamIdentityMap };
      await writePersistedValue(key, summary, generation);
      return summary;
    },
  );
}

function scopedRoleDeclarations(
  declarations: RoleDeclaration[],
  evidence: MapRoleEvidenceSummary,
): RoleDeclaration[] {
  return declarations.flatMap((declaration) => {
    const scope = declaration.teamScope;
    if (scope?.kind === 'entity')
      return evidence.groups.some((g) => g.key === scope.key)
        ? [{ ...declaration, teamKey: scope.key }]
        : [];
    if (scope?.kind === 'observation') {
      const key = evidence.teamIdentityMap[`${scope.matchId}:${scope.slot}`];
      return key ? [{ ...declaration, teamKey: key }] : [];
    }
    if (declaration.teamKey == null) return [declaration];
    const matches = evidence.groups.filter((group) => group.names.includes(declaration.teamKey!));
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
  return buildPlayerMapRoleProfiles(
    evidence.playerEvidence,
    scopedRoleDeclarations(declarations, evidence),
    {
      aggregatedEvidence: evidence.teamEvidence.flatMap((row) => row.players),
      matchTimes: Object.fromEntries(
        entries.map((entry) => {
          const date = entryDate(entry);
          return [matchIdForEntry(entry), date ? `${date}T00:00:00.000Z` : null];
        }),
      ),
    },
  ).map((profile) => ({
    ...profile,
    teamGroup: evidence.groups.find((group) => group.key === profile.teamKey)!,
  }));
}

export async function getTeamMapRoleMatrices(
  entries: StudioDemoEntry[],
  declarations: RoleDeclaration[] = [],
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<Array<TeamMapRoleMatrix & { teamGroup: RoleTeamGroup }>> {
  const evidence = await getMapRoleEvidence(entries, identity, selectedTeams);
  return buildTeamMapRoleMatrices(
    evidence.teamEvidence,
    buildPlayerMapRoleProfiles(
      evidence.playerEvidence,
      scopedRoleDeclarations(declarations, evidence),
      {
        aggregatedEvidence: evidence.teamEvidence.flatMap((row) => row.players),
        matchTimes: Object.fromEntries(
          entries.map((entry) => {
            const date = entryDate(entry);
            return [matchIdForEntry(entry), date ? `${date}T00:00:00.000Z` : null];
          }),
        ),
      },
    ),
  ).map((matrix) => ({
    ...matrix,
    teamGroup: evidence.groups.find((group) => group.key === matrix.teamKey)!,
  }));
}

export async function getDoubleAwpAnalysis(
  entries: StudioDemoEntry[],
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<DoubleAwpAnalysis[]> {
  assertCurrentFacts(entries);
  await ensureAnalysisDataReady();
  const snapshot = await beginStoredAnalysis(entries);
  const factsStore = getFactsStore();
  const matchIds = entries.map(matchIdForEntry);
  const [rows, positions] = await Promise.all([
    factsStore.getTeamAwpRounds({ matchIds }),
    factsStore.getPlayerPositionRounds({ matchIds }),
  ]);
  const { teamIdentityMap: teams, selectedKeys } = await roleGroups(
    entries,
    identity,
    selectedTeams,
  );
  const selected = new Set(selectedKeys);
  const players = new Map(
    positions.map((row) => [
      `${row.matchId}:${row.playerIndex}`,
      (() => {
        const mapped = identity?.map[row.steamId64];
        return mapped == null
          ? `steam:${row.steamId64}`
          : typeof mapped === 'string'
            ? mapped
            : mapped.playerKey;
      })(),
    ]),
  );
  await endStoredAnalysis(entries, snapshot);
  return buildDoubleAwpAnalyses(rows, {
    teamKeyFor: (matchId, rawTeamKey) =>
      teams[`${matchId}:${rawTeamKey}`] ?? `${matchId}:${rawTeamKey}`,
    playerKeyFor: (matchId, playerIndex) =>
      players.get(`${matchId}:${playerIndex}`) ?? `${matchId}:player:${playerIndex}`,
  }).filter((row) => selectedTeams.length === 0 || selected.has(row.teamKey));
}

export interface PlayerMapPoolResult {
  rows: PlayerMapPoolRow[];
  unsupportedMapNames: string[];
}
export async function getPlayerMapPool(
  entries: StudioDemoEntry[],
  playerKey: string,
  roleProfile: PlayerMapRoleProfile | null,
  identity?: IdentityOptions,
): Promise<PlayerMapPoolResult> {
  assertCurrentFacts(entries);
  await ensureAnalysisDataReady();
  const snapshot = await beginStoredAnalysis(entries);
  const matchIds = entries.map(matchIdForEntry);
  const facts = getFactsStore();
  const [cohortRows, weaponRows] = await Promise.all([
    facts.getRrSignalRows({ matchIds }),
    facts.getPlayerWeapons({ matchIds }),
  ]);
  await endStoredAnalysis(entries, snapshot);
  const result = buildPlayerMapPerformance({
    playerKey,
    identityMap: identity?.map ?? {},
    cohortRows,
    weaponRows,
    matches: entries.map((entry) => ({
      matchId: matchIdForEntry(entry),
      mapName: entry.meta.mapName,
      teamAScore: entry.meta.teamAScore,
      teamBScore: entry.meta.teamBScore,
    })),
  });
  return {
    rows: buildPlayerMapPool(result.rows, roleProfile),
    unsupportedMapNames: result.unsupportedMapNames,
  };
}

/** Display grouping keys are local lenses, not frozen Tournament identities. */
export function getObservedMapPool(
  facts: readonly TacticalRoundFact[],
  own: string | null,
  opponent: string | null,
  renames: Record<string, string>,
): ObservedMapPoolRow[] {
  const norm = (name: string) => displayTeamName(name, renames).trim().toLowerCase();
  const select = (name: string | null) =>
    withTacticalDisplayGroupKeys(
      name ? facts.filter((row) => norm(row.teamName) === norm(name)) : [],
      renames,
    );
  return buildObservedMapPoolComparison({
    mapNames: [...new Set(facts.map((row) => row.mapName))].sort(),
    ownRounds: select(own),
    opponentRounds: select(opponent),
  });
}
