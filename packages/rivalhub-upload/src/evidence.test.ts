import { readFile } from "node:fs/promises";
import { beforeAll, expect, it } from "vitest";
import type { DemoPackage } from "@cs2dak/contract";
import { aggregatePlayerRoundPerformanceFacts, buildPlayerRoundPerformanceFacts, extractTournamentSourceFacts, projectTournamentMapFacts, loadDemoPackageFromZip } from "@cs2dak/core/evidence";
import { buildTournamentAnalytics } from "@cs2dak/tournament";
import { buildRivalHubDemoEvidenceV1, fixtureIdentity, fixtureTarget, resolveRivalHubParticipants, normalizeRivalHubDemoPackage } from "./evidence";

let stableFixture: DemoPackage;
let evidenceFixture: DemoPackage;
beforeAll(async () => {
  const bytes = await readFile("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip");
  stableFixture = await loadDemoPackageFromZip(bytes);
  evidenceFixture = await loadDemoPackageFromZip(bytes, { profile: "evidence" });
});
const target = fixtureTarget();
const identities = (pkg = stableFixture) => new Map(pkg.players.map((player, index) => [player.steamId64, fixtureIdentity(player, index, target)]));
const build = (pkg = stableFixture) => buildRivalHubDemoEvidenceV1(pkg, target, identities(pkg));

it("projects every whole-map player summary from Core canonical performance facts", () => {
  const canonicalIdentities = identities();
  const evidence = build() as {
    summaries: { playerMaps: Array<Record<string, unknown>> };
  };

  const performanceBySteamId = aggregatePlayerRoundPerformanceFacts(buildPlayerRoundPerformanceFacts(stableFixture));
  expect(evidence.summaries.playerMaps).toEqual(stableFixture.players.map((player) => {
    const summary = performanceBySteamId.get(player.steamId64)!;
    return {
      steamId64: canonicalIdentities.get(player.steamId64)!.steamId64,
      teamKey: player.teamKey,
      rounds: summary.rounds,
      kills: summary.kills,
      deaths: summary.deaths,
      assists: summary.assists,
      damage: summary.damage,
      kastRounds: summary.kastRounds,
      headshots: summary.headshots,
      firstKills: summary.firstKills,
      firstDeaths: summary.firstDeaths,
      tradeKills: summary.tradeKills,
      twoKillRounds: summary.twoKillRounds,
      threeKillRounds: summary.threeKillRounds,
      fourKillRounds: summary.fourKillRounds,
      fiveKillRounds: summary.fiveKillRounds,
      clutchAttempts: summary.clutch.attempts,
      clutchWins: summary.clutch.wins,
    };
  }));
});

it("keeps stable identity despite identical display names and rejects colliding target teams", () => {
  const renamed = { ...stableFixture, match: { ...stableFixture.match, teamA: { ...stableFixture.match.teamA, name: "Same" }, teamB: { ...stableFixture.match.teamB, name: "Same" } }, players: stableFixture.players.map(player => ({ ...player, name: "Renamed" })) };
  const baseline = build();
  const result = build(renamed);
  expect(result.sourceFacts).toEqual(baseline.sourceFacts);
  expect(result.semanticFacts).toEqual(baseline.semanticFacts);
  expect(result.summaries).toEqual(baseline.summaries);
  expect(() => buildRivalHubDemoEvidenceV1(renamed, { ...target, entryBId: target.entryAId }, identities()))
    .toThrow("teamA and teamB must differ");
  const identity = { teamEntityKeys: { teamA: target.entryAId, teamB: target.entryBId }, playerEntityKeys: Object.fromEntries([...identities()].map(([id, player]) => [id, player.steamId64])) };
  const first = projectTournamentMapFacts(extractTournamentSourceFacts({ matchId: "map-1", pkg: stableFixture }, identity));
  const second = projectTournamentMapFacts(extractTournamentSourceFacts({ matchId: "map-2", pkg: renamed }, identity));
  const merged = buildTournamentAnalytics([first, second]);
  expect(merged.teams).toHaveLength(2);
  expect(merged.teams.find(row => row.team.entityKey === target.entryAId))
    .toMatchObject({ mapCount: 2, rounds: stableFixture.rounds.length * 2 });
});

it("omits optional streams without changing Evidence V1 and blocks genuine source errors", () => {
  expect(build(evidenceFixture)).toEqual(build());
  expect(() => build({ ...stableFixture, playerStats: undefined } as unknown as DemoPackage)).toThrow(/playerStats/);
  const corrupt = { ...stableFixture, match: { ...stableFixture.match, teamA: { ...stableFixture.match.teamA, score: stableFixture.match.teamA.score + 1 } } };
  expect(() => build(corrupt)).toThrow("score.round_winners_mismatch");
});

it("resolves a reversed online lineup and refuses an unrecognized member", () => {
  const lineup = stableFixture.players.map((player, index) => ({
    steamId64: player.steamId64, name: player.name,
    userId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    eventRosterMemberId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    isStarter: true, entryId: player.teamKey === "teamA" ? target.entryBId : target.entryAId,
  }));
  const resolved = resolveRivalHubParticipants(stableFixture, target, lineup);
  expect(resolved.orientation).toBe("reversed");
  const normalized = normalizeRivalHubDemoPackage(stableFixture, resolved.orientation);
  expect(normalized.match.teamA.score).toBe(stableFixture.match.teamB.score);
  expect(normalized.rounds[0]?.teamASide).toBe(stableFixture.rounds[0]?.teamBSide);
  const outsider = { ...lineup[0]!, steamId64: "76561198000000099" };
  expect(() => resolveRivalHubParticipants(stableFixture, target, [outsider, ...lineup.slice(1)]))
    .toThrow("Demo 缺少在线名单成员");
});
