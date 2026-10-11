import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import type { DemoPackage } from "@cs2dak/contract";
import { buildTournamentAnalytics, buildTournamentPerformanceAnalytics } from "@cs2dak/tournament";
import { loadDemoPackageFromZip } from "./loader";
import {
  extractTournamentSourceFacts, observedTournamentIdentity, projectTournamentMapFacts,
  projectTournamentPerformanceMapFacts, type TournamentIdentity,
} from "./tournament-facts";

let pkg: DemoPackage;
let identity: TournamentIdentity;
beforeAll(async () => {
  pkg = await loadDemoPackageFromZip(await readFile("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip"));
  identity = { ...observedTournamentIdentity("source", pkg.players), teamEntityKeys: { teamA: "entry-alpha", teamB: "entry-bravo" } };
});
const freeze = (matchId: string, source = pkg, ids = identity) => projectTournamentMapFacts(extractTournamentSourceFacts({ matchId, pkg: source }, ids));

describe("canonical frozen Tournament identity", () => {
  it("team display names and player nicknames cannot change either frozen projection", () => {
    const renamed = { ...pkg, match: { ...pkg.match, teamA: { ...pkg.match.teamA, name: "Same name" }, teamB: { ...pkg.match.teamB, name: "Same name" } }, players: pkg.players.map(player => ({ ...player, name: "Same nickname" })) };
    expect(freeze("m1", renamed)).toEqual(freeze("m1"));
    expect(projectTournamentPerformanceMapFacts({ matchId: "m1", pkg: renamed }, identity)).toEqual(projectTournamentPerformanceMapFacts({ matchId: "m1", pkg }, identity));
  });
  it("the same stable IDs merge across maps despite label changes, with additive statistics", () => {
    const first = freeze("m1");
    const renamed = { ...pkg, match: { ...pkg.match, teamA: { ...pkg.match.teamA, name: "Renamed" } } };
    const second = freeze("m2", renamed);
    const analytics = buildTournamentAnalytics([first, second]);
    expect(analytics.teams).toHaveLength(2);
    const alpha = analytics.teams.find(row => row.team.entityKey === "entry-alpha")!;
    expect(alpha).toMatchObject({ mapCount: 2, rounds: pkg.rounds.length * 2, roundWins: first.teamMaps.teamA.roundWins * 2 });
    expect(alpha.pistol.opportunities).toBe(first.teamConversions.teamA.pistol.opportunities * 2);
    const perf = projectTournamentPerformanceMapFacts({ matchId: "m1", pkg }, identity);
    const merged = buildTournamentPerformanceAnalytics([perf, { ...perf, mapKey: "other-map", matchKey: "m2" }]);
    expect(merged.teams).toHaveLength(2);
    expect(merged.players[0]!.slices.overall.sample.rounds).toBe(pkg.rounds.length * 2);
  });
  it("different stable IDs stay separate even when their labels are identical", () => {
    const first = freeze("m1");
    const second = freeze("m2", pkg, { ...identity, teamEntityKeys: { teamA: "other-alpha", teamB: "other-bravo" } });
    const labels = { teams: Object.fromEntries(["entry-alpha", "entry-bravo", "other-alpha", "other-bravo"].map(id => [id, "Same name"])) };
    expect(buildTournamentAnalytics([first, second], { labels }).teams).toHaveLength(4);
  });
  it("rejects missing team IDs, missing player IDs, and actual team identity collisions", () => {
    expect(() => freeze("m1", pkg, { ...identity, teamEntityKeys: { teamA: "", teamB: "entry-bravo" } })).toThrow("explicit stable team IDs");
    expect(() => freeze("m1", pkg, { ...identity, playerEntityKeys: {} })).toThrow("explicit stable player ID");
    const collision = { ...identity, teamEntityKeys: { teamA: "entry-alpha", teamB: "entry-alpha" } };
    expect(() => freeze("m1", pkg, collision)).toThrow("teamA and teamB must differ");
    expect(() => projectTournamentPerformanceMapFacts({ matchId: "m1", pkg }, collision)).toThrow("teamA and teamB must differ");
  });
});
