import type {
  CohortFact,
  DuelFact,
  FactsScope,
  FactsStore,
  LineupFact,
  MatchWorkspaceFact,
  MechanicsSamplesFact,
  OpeningTrailFact,
  PlayerInsightFact,
  PlayerMatchStatsFact,
  PlayerWeaponFact,
  TeamComparisonFact,
  TournamentFact,
  UtilityValueFact,
} from "./fact-types";
import { getStorage, type RecordStore, type StorageAdapter } from "./storage";
import type { PlayerMechanicsFact } from "@cs2dak/core";
import type { SeasonCohortFactRow } from "@cs2dak/cohort";
import type {
  DuelInsightsFacts,
  TeamComparisonFacts,
  TournamentFacts,
  UtilityValueSummary,
} from "@cs2dak/presentation";
import type { PlayerPositionRoundFact, TacticalRoundFact, TeamAwpRoundFact, TeamShapeRoundFact } from "@cs2dak/core";

export const FACTS_NAMESPACE = "facts";
export const DERIVED_MATCH_NAMESPACE = "derived:match-v1";

const FACT_TABLES = [
  "player_match_stats",
  "player_weapons",
  "mechanics_samples",
  "cohort_rows",
  "lineups",
  "tactical_rounds",
  "player_position_rounds",
  "team_shape_rounds",
  "team_awp_rounds",
] as const;
const DERIVED_TABLES = ["player_insights", "tournament_facts", "team_comparison_facts", "duel_facts", "match_workspace", "opening_trails", "utility_value"] as const;

/** Studio storage overview 使用的 facts 记录命名空间清单。 */
export const FACTS_RECORD_NAMESPACES = FACT_TABLES.map((table) => `${FACTS_NAMESPACE}:${table}`);
export const DERIVED_CACHE_RECORD_NAMESPACES = DERIVED_TABLES.map((table) => `${DERIVED_MATCH_NAMESPACE}:${table}`);

function inScope(row: { matchId: string; playerKey?: string; mapName?: string; steamId64?: string }, scope?: FactsScope): boolean {
  if (!scope) return true;
  if (scope.matchIds && !scope.matchIds.includes(row.matchId)) return false;
  const steamId64 = row.steamId64 ?? "";
  if (scope.playerKeys && scope.steamIds) {
    if ((!row.playerKey || !scope.playerKeys.includes(row.playerKey)) && !scope.steamIds.includes(steamId64)) return false;
  } else {
    if (scope.playerKeys && (!row.playerKey || !scope.playerKeys.includes(row.playerKey))) return false;
    if (scope.steamIds && !scope.steamIds.includes(steamId64)) return false;
  }
  if (scope.mapNames && (!row.mapName || !scope.mapNames.includes(row.mapName))) return false;
  return true;
}

/** 用新行整体替换某 matchId 的旧行，键范围删除由具体 StorageAdapter 执行。 */
async function replaceRows<T extends { matchId: string }>(
  store: RecordStore,
  rows: Array<[string, T]>,
  matchId: string,
): Promise<void> {
  await store.deleteByPrefix(matchId);
  if (rows.length > 0) await Promise.all(rows.map(([key, row]) => store.put(key, row)));
}

const ROW_KEY_SEP = "\t";

function rowKey(...parts: string[]): string {
  return parts.join(ROW_KEY_SEP);
}

export function createFactsStore(adapter: StorageAdapter, namespace = FACTS_NAMESPACE): FactsStore {
  const playerStats = adapter.records(`${namespace}:player_match_stats`);
  const playerInsights = adapter.records(`${DERIVED_MATCH_NAMESPACE}:player_insights`);
  const playerWeapons = adapter.records(`${namespace}:player_weapons`);
  const mechanics = adapter.records(`${namespace}:mechanics_samples`);
  const cohortRows = adapter.records(`${namespace}:cohort_rows`);
  const tournamentFacts = adapter.records(`${DERIVED_MATCH_NAMESPACE}:tournament_facts`);
  const teamComparisonFacts = adapter.records(`${DERIVED_MATCH_NAMESPACE}:team_comparison_facts`);
  const duelFacts = adapter.records(`${DERIVED_MATCH_NAMESPACE}:duel_facts`);
  const matchWorkspace = adapter.records(`${DERIVED_MATCH_NAMESPACE}:match_workspace`);
  const openingTrails = adapter.records(`${DERIVED_MATCH_NAMESPACE}:opening_trails`);
  const lineups = adapter.records(`${namespace}:lineups`);
  const tacticalRounds = adapter.records(`${namespace}:tactical_rounds`);
  const playerPositionRounds = adapter.records(`${namespace}:player_position_rounds`);
  const teamShapeRounds = adapter.records(`${namespace}:team_shape_rounds`);
  const teamAwpRounds = adapter.records(`${namespace}:team_awp_rounds`);
  const utilityValueFacts = adapter.records(`${DERIVED_MATCH_NAMESPACE}:utility_value`);

  return {
    async putMatchFacts(facts) {
      await Promise.all([
        replaceRows(playerStats, facts.playerMatchStats.map((row) => [rowKey(row.matchId, row.playerKey), row]), facts.matchId),
        replaceRows(playerInsights, facts.playerInsights.map((row) => [rowKey(row.matchId, row.playerKey), row]), facts.matchId),
        replaceRows(playerWeapons, facts.playerWeapons.map((row) => [rowKey(row.matchId, row.playerKey, row.weapon), row]), facts.matchId),
        replaceRows(mechanics, facts.mechanicsSamples.map((row) => [rowKey(row.matchId, row.playerKey, row.weapon), row]), facts.matchId),
        replaceRows(cohortRows, facts.cohortRows.map((row) => [rowKey(row.matchId, row.playerKey), row]), facts.matchId),
        replaceRows(tournamentFacts, facts.tournamentFacts.map((row) => [row.matchId, row]), facts.matchId),
        replaceRows(teamComparisonFacts, facts.teamComparisonFacts.map((row) => [row.matchId, row]), facts.matchId),
        replaceRows(duelFacts, facts.duelFacts.map((row) => [row.matchId, row]), facts.matchId),
        replaceRows(matchWorkspace, facts.matchWorkspace.map((row) => [row.matchId, row]), facts.matchId),
        replaceRows(openingTrails, facts.openingTrails.map((row) => [rowKey(row.matchId, row.playerKey), row]), facts.matchId),
        replaceRows(lineups, facts.lineups.map((row) => [row.matchId, row]), facts.matchId),
        replaceRows(tacticalRounds, facts.tacticalRounds.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.side), row]), facts.matchId),
        replaceRows(playerPositionRounds, facts.playerPositionRounds.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.teamKey, String(row.playerIndex)), row]), facts.matchId),
        replaceRows(teamShapeRounds, facts.teamShapeRounds.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.teamKey), row]), facts.matchId),
        replaceRows(teamAwpRounds, facts.teamAwpRounds.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.teamKey), row]), facts.matchId),
        replaceRows(utilityValueFacts, facts.utilityValueFacts.map((row) => [row.matchId, row]), facts.matchId),
      ]);
    },
    async getPlayerMatchStats(scope) {
      return (await playerStats.getAll<PlayerMatchStatsFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerName.localeCompare(b.playerName));
    },
    async getPlayerInsights(scope) {
      return (await playerInsights.getAll<PlayerInsightFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerName.localeCompare(b.playerName));
    },
    async getPlayerWeapons(scope) {
      return (await playerWeapons.getAll<PlayerWeaponFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.weapon.localeCompare(b.weapon));
    },
    async getMechanicsRows(scope) {
      const rows = (await mechanics.getAll<MechanicsSamplesFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey) || a.weapon.localeCompare(b.weapon));
      const byMatch = new Map<string, PlayerMechanicsFact[]>();
      for (const row of rows) {
        const bucket = byMatch.get(row.matchId) ?? [];
        bucket.push(row.row);
        byMatch.set(row.matchId, bucket);
      }
      return [...byMatch.entries()].map(([matchId, matchRows]) => ({ matchId, rows: matchRows }));
    },
    async getCohortRows(scope) {
      return (await cohortRows.getAll<CohortFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey))
        .map((row) => row.row);
    },
    async getTournamentFacts(scope) {
      return (await tournamentFacts.getAll<TournamentFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId))
        .map((row) => row.row);
    },
    async getTeamComparisonFacts(scope) {
      return (await teamComparisonFacts.getAll<TeamComparisonFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId))
        .map((row) => row.row);
    },
    async getDuelFacts(scope) {
      return (await duelFacts.getAll<DuelFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId))
        .map((row) => row.row);
    },
    async getMatchWorkspace(matchId) {
      return (await matchWorkspace.get<MatchWorkspaceFact>(matchId)) ?? null;
    },
    async getOpeningTrails(scope) {
      return (await openingTrails.getAll<OpeningTrailFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.playerKey.localeCompare(b.playerKey));
    },
    async getLineups(scope) {
      return (await lineups.getAll<LineupFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId));
    },
    async getTacticalRounds(scope) {
      return (await tacticalRounds.getAll<TacticalRoundFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber || a.side.localeCompare(b.side));
    },
    async getPlayerPositionRounds(scope) {
      return (await playerPositionRounds.getAll<PlayerPositionRoundFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber || a.teamKey.localeCompare(b.teamKey) || a.playerIndex - b.playerIndex);
    },
    async getTeamShapeRounds(scope) {
      return (await teamShapeRounds.getAll<TeamShapeRoundFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber || a.teamKey.localeCompare(b.teamKey));
    },
    async getTeamAwpRounds(scope) {
      return (await teamAwpRounds.getAll<TeamAwpRoundFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId) || a.roundNumber - b.roundNumber || a.teamKey.localeCompare(b.teamKey));
    },
    async getUtilityValueFacts(scope) {
      return (await utilityValueFacts.getAll<UtilityValueFact>())
        .filter((row) => inScope(row, scope))
        .sort((a, b) => a.matchId.localeCompare(b.matchId))
        .map((row) => row.row);
    },
    async getUtilityValueFactMatchIds(scope) {
      return [...new Set(
        (await utilityValueFacts.getAll<UtilityValueFact>())
          .filter((row) => inScope(row, scope))
          .map((row) => row.matchId),
      )].sort();
    },
    async deleteMatchFacts(matchId) {
      await Promise.all([
        playerStats,
        playerInsights,
        playerWeapons,
        mechanics,
        cohortRows,
        tournamentFacts,
        teamComparisonFacts,
        duelFacts,
        matchWorkspace,
        openingTrails,
        lineups,
        tacticalRounds,
        playerPositionRounds,
        teamShapeRounds,
        teamAwpRounds,
        utilityValueFacts,
      ].map((store) => store.deleteByPrefix(matchId)));
    },
  };
}

let factsStore: FactsStore | null = null;

export function getFactsStore(): FactsStore {
  return (factsStore ??= createFactsStore(getStorage()));
}
