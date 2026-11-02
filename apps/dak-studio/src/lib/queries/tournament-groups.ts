/** Local analysis grouping only; never persist these keys as team identities. */
export function groupAnalysisTeams<T extends {
  matchId: string;
  mapName: string;
  teams: Record<"teamA" | "teamB", string>;
  teamEntityKeys: Record<"teamA" | "teamB", string>;
}>(facts: T[], selectedTeams: string[] = []): { facts: T[]; selectedKeys: string[] } {
  const selected = new Set(selectedTeams);
  const selectedKeys = new Set<string>();
  const namesByKey = new Map<string, Set<string>>();
  const grouped = facts.map((fact) => {
    const teamEntityKeys = { ...fact.teamEntityKeys };
    for (const slot of ["teamA", "teamB"] as const) {
      const name = fact.teams[slot];
      if (teamEntityKeys[slot] === `observed-team:${fact.matchId}:${slot}`) {
        teamEntityKeys[slot] = fact.teams.teamA === fact.teams.teamB
          ? `analysis-team-observation:${JSON.stringify([fact.matchId, slot])}`
          : `analysis-team-name:${JSON.stringify(name)}`;
      }
      const key = teamEntityKeys[slot];
      if (selected.has(name) || selected.has(key)) selectedKeys.add(key);
      const names = namesByKey.get(key) ?? new Set<string>();
      names.add(name);
      namesByKey.set(key, names);
    }
    return { ...fact, teamEntityKeys };
  });
  // A stable binding may have several observed names. Match Tournament's
  // deterministic label choice so the result does not depend on input order.
  const names = new Map([...namesByKey].map(([key, values]) => [key, [...values].sort((a, b) => a.localeCompare(b))[0]!]));
  const keysByName = new Map<string, string[]>();
  for (const [key, name] of names) keysByName.set(name, [...(keysByName.get(name) ?? []), key]);
  for (const keys of keysByName.values()) keys.sort();
  const matchIds = [...new Set(facts.map((fact) => fact.matchId))].sort();
  return {
    selectedKeys: [...selectedKeys],
    facts: grouped.map((fact) => ({ ...fact, teams: Object.fromEntries((["teamA", "teamB"] as const).map((slot) => {
      const key = fact.teamEntityKeys[slot];
      const name = names.get(key)!;
      const peers = keysByName.get(name)!;
      const qualifier = key.startsWith("analysis-team-observation:")
        ? `${fact.mapName} · 第 ${matchIds.indexOf(fact.matchId) + 1} 场 · ${slot === "teamA" ? "A" : "B"} 方`
        : key.startsWith("analysis-team-name:") ? "名称分组" : `绑定队伍 ${peers.indexOf(key) + 1}`;
      return [slot, peers.length > 1 ? `${name} · ${qualifier}` : name];
    })) as T["teams"] })),
  };
}
