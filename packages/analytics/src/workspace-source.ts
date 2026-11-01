import type { AnalysisBundle, DemoPackage } from "@cs2dak/contract";
import { toPlayerRoundFacts, type PlayerRoundPerformanceFacts } from "@cs2dak/core";

/** Guard the source join; event semantics remain owned by Core. */
export function assertWorkspaceSource(
  pkg: DemoPackage,
  bundle: AnalysisBundle,
  facts: PlayerRoundPerformanceFacts,
): void {
  const mismatch = () => { throw new Error("Workspace analysis does not match its Demo source"); };
  if (bundle.provenance.sourceDemoHash !== (pkg.manifest.demo?.hash ?? null)
    || bundle.sourceSchemaVersion !== pkg.manifest.schemaVersion
    || bundle.mapName !== pkg.match.mapName
    || bundle.tickrate !== pkg.match.tickrate
    || bundle.teams.teamA.score !== pkg.match.teamA.score
    || bundle.teams.teamB.score !== pkg.match.teamB.score
    || bundle.teams.teamA.name !== (pkg.match.teamA.name ?? "Team A")
    || bundle.teams.teamB.name !== (pkg.match.teamB.name ?? "Team B")) mismatch();

  // Hashless local sources are supported. Compare the canonical projected rows
  // as well: equal display names and map names do not establish source identity.
  const expected = toPlayerRoundFacts(facts);
  const rowKey = (row: { roundNumber: number; steamId64: string }) => `${row.roundNumber}:${row.steamId64}`;
  const actual = new Map(bundle.playerRoundFacts.map(row => [rowKey(row), row]));
  if (actual.size !== expected.length || actual.size !== bundle.playerRoundFacts.length) mismatch();
  for (const row of expected) {
    const candidate = actual.get(rowKey(row));
    if (!candidate) { mismatch(); return; }
    const fields = Object.keys(row) as Array<keyof typeof row>;
    if (JSON.stringify(fields.map(field => row[field])) !== JSON.stringify(fields.map(field => candidate[field]))) mismatch();
  }
  const roster = new Map(pkg.players.map(player => [player.steamId64, player.teamKey]));
  if (bundle.scoreboard.length !== roster.size
    || new Set(bundle.scoreboard.map(player => player.steamId64)).size !== roster.size
    || bundle.scoreboard.some(player => roster.get(player.steamId64) !== player.teamKey)) mismatch();
}
