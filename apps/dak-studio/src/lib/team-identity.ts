export interface TeamRenameGroup {
  displayName: string;
  originals: string[];
  matchCount: number;
}

export function displayTeamName(teamName: string, teamRenames: Record<string, string> = {}): string {
  return teamRenames[teamName] ?? teamName;
}

export function teamRenameGroups(
  matches: Array<{ teamA: string; teamB: string }>,
  teamRenames: Record<string, string> = {}
): TeamRenameGroup[] {
  const byDisplay = new Map<string, { originals: Set<string>; matchIds: Set<number> }>();
  matches.forEach((match, index) => {
    for (const rawName of [match.teamA, match.teamB]) {
      const display = displayTeamName(rawName, teamRenames);
      const group = byDisplay.get(display) ?? { originals: new Set<string>(), matchIds: new Set<number>() };
      group.originals.add(rawName);
      group.matchIds.add(index);
      byDisplay.set(display, group);
    }
  });
  return [...byDisplay.entries()]
    .map(([displayName, group]) => ({
      displayName,
      originals: [...group.originals].sort(),
      matchCount: group.matchIds.size
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function originalTeamNamesForDisplay(displayName: string, teamRenames: Record<string, string> = {}): string[] {
  const names = new Set<string>([displayName]);
  for (const [original, display] of Object.entries(teamRenames)) {
    if (display === displayName || original === displayName) names.add(original);
  }
  return [...names].sort();
}
