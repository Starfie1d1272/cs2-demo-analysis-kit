/** Map display names to product grouping keys without changing canonical identities. */
import { displayTeamName } from './team-identity.js';

export function withTacticalDisplayGroupKeys<T extends { teamName: string; opponentName: string }>(
  rows: readonly T[],
  teamRenames: Record<string, string>,
): Array<T & { teamIdentity: string; opponentIdentity: string }> {
  const displayGroup = (name: string) => displayTeamName(name, teamRenames).trim().toLowerCase();
  return rows.map((row) => ({
    ...row,
    teamIdentity: displayGroup(row.teamName),
    opponentIdentity: displayGroup(row.opponentName),
  }));
}
