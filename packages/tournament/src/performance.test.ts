import { describe, expect, it } from "vitest";
import type {
  TournamentPerformanceMapFacts,
  TournamentPerformancePlayerRoundFact,
  TournamentPerformanceUtilityFact,
} from "./types";
import { buildTournamentPerformanceAnalytics } from "./performance";

function utility(overrides: Partial<TournamentPerformanceUtilityFact> = {}): TournamentPerformanceUtilityFact {
  return {
    flashesThrown: 0,
    enemyBlindSeconds: 0,
    teamBlindSeconds: 0,
    enemyBlindVictims: 0,
    flashAssists: 0,
    heThrows: 0,
    heDamage: 0,
    fireThrows: 0,
    fireDamage: 0,
    smokesThrown: 0,
    utilityKills: 0,
    utilityDamage: 0,
    ...overrides,
  };
}

function playerRound(overrides: Partial<TournamentPerformancePlayerRoundFact>): TournamentPerformancePlayerRoundFact {
  return {
    roundSeq: 1,
    playerEntityKey: "player-a",
    teamEntityKey: "team-a",
    side: "t",
    teamWonRound: true,
    kills: 0,
    deaths: 0,
    assists: 0,
    damage: 0,
    headshots: 0,
    survived: true,
    kast: false,
    tradeKills: 0,
    tradedDeaths: 0,
    openingDuel: "none",
    clutch: null,
    utility: utility(),
    ...overrides,
  };
}

function facts(overrides: Partial<TournamentPerformanceMapFacts> = {}): TournamentPerformanceMapFacts {
  return {
    semanticProfile: "evidence-v1/1.0",
    analysisVersion: "dak/1.1.0",
    mapKey: "map-1",
    matchKey: "match-1",
    mapName: "de_ancient",
    teamEntityKeys: { teamA: "team-a", teamB: "team-b" },
    playerRounds: [
      playerRound({
        roundSeq: 1,
        playerEntityKey: "player-a",
        teamEntityKey: "team-a",
        side: "t",
        teamWonRound: true,
        kills: 2,
        damage: 100,
        headshots: 1,
        kast: true,
        tradeKills: 1,
        openingDuel: "won",
        utility: utility({ flashesThrown: 1, enemyBlindSeconds: 2, enemyBlindVictims: 1, flashAssists: 1 }),
      }),
      playerRound({
        roundSeq: 1,
        playerEntityKey: "player-b",
        teamEntityKey: "team-b",
        side: "ct",
        teamWonRound: false,
        kills: 1,
        deaths: 1,
        damage: 30,
        headshots: 1,
        survived: false,
        openingDuel: "lost",
      }),
      playerRound({
        roundSeq: 2,
        playerEntityKey: "player-a",
        teamEntityKey: "team-a",
        side: "ct",
        teamWonRound: false,
        deaths: 1,
        survived: false,
        utility: utility({ heThrows: 1, heDamage: 40, utilityDamage: 40 }),
      }),
      playerRound({
        roundSeq: 2,
        playerEntityKey: "player-b",
        teamEntityKey: "team-b",
        side: "t",
        teamWonRound: true,
        kills: 1,
        kast: true,
        clutch: { opponentCount: 2, won: true },
        utility: utility({ fireThrows: 1, fireDamage: 20, smokesThrown: 1, utilityKills: 1, utilityDamage: 20 }),
      }),
    ],
    objectives: [
      { roundSeq: 1, type: "planted", playerEntityKey: "player-a", teamEntityKey: "team-a", side: "t", teamWonRound: true },
      { roundSeq: 2, type: "defused", playerEntityKey: "player-b", teamEntityKey: "team-b", side: "t", teamWonRound: true },
      { roundSeq: 2, type: "planted", playerEntityKey: null, teamEntityKey: null, side: null, teamWonRound: null },
    ],
    playerWeapons: [
      { playerEntityKey: "player-a", teamEntityKey: "team-a", weapon: "ak47", kills: 2, headshotKills: 1 },
      { playerEntityKey: "player-b", teamEntityKey: "team-b", weapon: "ak47", kills: 1, headshotKills: 1 },
      { playerEntityKey: "player-b", teamEntityKey: "team-b", weapon: "awp", kills: 1, headshotKills: 0 },
    ],
    ...overrides,
  };
}

describe("buildTournamentPerformanceAnalytics", () => {
  it("returns denominator-aware zero rows for empty input", () => {
    const result = buildTournamentPerformanceAnalytics([]);

    expect(result).toMatchObject({
      provenance: { semanticProfile: null, analysisVersions: [] },
      totals: { matchCount: 0, mapCount: 0, roundCount: 0 },
      players: [],
      teams: [],
      maps: [],
      weapons: [],
    });
    expect(result.totals.opening.successRate).toEqual({ successes: 0, attempts: 0, rate: null });
    expect(result.totals.utility.heDamagePerThrow.rate).toBeNull();
    expect(result.totals.objective.plantConversions.rate).toBeNull();
  });

  it("aggregates player, team, map, objective and weapon performance without multiplying team rounds", () => {
    const result = buildTournamentPerformanceAnalytics([facts()], {
      labels: { players: { "player-a": "Alpha" }, teams: { "team-a": "Team Alpha" } },
    });

    expect(result.provenance).toEqual({ semanticProfile: "evidence-v1/1.0", analysisVersions: ["dak/1.1.0"] });
    expect(result.totals).toMatchObject({ matchCount: 1, mapCount: 1, roundCount: 2 });
    expect(result.totals.opening).toMatchObject({
      firstKills: 1,
      firstDeaths: 1,
      attempts: 2,
      successRate: { successes: 1, attempts: 2, rate: 0.5 },
      attemptRate: { successes: 2, attempts: 2, rate: 1 },
      roundWinsAfterWinningOpeningDuel: 1,
      winRateAfterWinningOpeningDuel: { successes: 1, attempts: 1, rate: 1 },
    });
    expect(result.totals.utility).toMatchObject({
      flashesThrown: 1,
      enemyBlindSeconds: 2,
      heDamage: 40,
      fireDamage: 20,
      smokesThrown: 1,
      utilityKills: 1,
      utilityDamage: 60,
      enemyBlindSecondsPerFlash: { successes: 2, attempts: 1, rate: 2 },
      utilityDamagePerRound: { successes: 60, attempts: 2, rate: 30 },
    });
    expect(result.totals.objective).toEqual({
      plants: 2,
      defuses: 1,
      plantsConverted: 1,
      plantConversions: { successes: 1, attempts: 1, rate: 1 },
    });

    const playerA = result.players.find((row) => row.player.entityKey === "player-a")!;
    expect(playerA.player.displayName).toBe("Alpha");
    expect(playerA).toMatchObject({ teamEntityKeys: ["team-a"], matchCount: 1, mapCount: 1 });
    expect(playerA.slices.overall).toMatchObject({
      sample: { rounds: 2 },
      combat: { kills: 2, deaths: 1, assists: 0, damage: 100, headshots: 1, twoKillRounds: 1 },
      kast: { successes: 1, attempts: 2, rate: 0.5 },
      survival: { successes: 1, attempts: 2, rate: 0.5 },
      opening: { firstKills: 1, firstDeaths: 0, successRate: { successes: 1, attempts: 1, rate: 1 } },
      trade: { tradeKills: 1, tradedDeaths: 0, tradedOpeningDeaths: 0, tradedDeathsPerDeath: { successes: 0, attempts: 1, rate: 0 } },
      objective: { plants: 1, plantsConverted: 1, plantConversions: { successes: 1, attempts: 1, rate: 1 } },
    });
    expect(playerA.slices.t.sample.rounds).toBe(1);
    expect(playerA.slices.ct.sample.rounds).toBe(1);
    expect(playerA.weapons.find((row) => row.weapon === "ak47")).toMatchObject({
      kills: 2,
      headshotKills: 1,
      headshotRate: { successes: 1, attempts: 2, rate: 0.5 },
      killShare: { successes: 2, attempts: 2, rate: 1 },
    });

    const teamA = result.teams.find((row) => row.team.entityKey === "team-a")!;
    expect(teamA.team.displayName).toBe("Team Alpha");
    expect(teamA.roundCount).toBe(2);
    expect(teamA.slices.overall.sample.rounds).toBe(2);
    expect(teamA.slices.overall.utility.utilityDamagePerRound).toEqual({ successes: 40, attempts: 2, rate: 20 });
    expect(teamA.slices.t.sample.rounds).toBe(1);
    expect(teamA.slices.ct.sample.rounds).toBe(1);
    expect(teamA.slices.overall.objective).toMatchObject({ plants: 1, plantsConverted: 1 });

    expect(result.maps).toEqual([expect.objectContaining({ mapName: "de_ancient", matchCount: 1, mapCount: 1, roundCount: 2 })]);
    expect(result.weapons[0]).toMatchObject({
      weapon: "ak47",
      kills: 3,
      headshotKills: 2,
      headshotRate: { successes: 2, attempts: 3, rate: 2 / 3 },
      killShare: { successes: 3, attempts: 4, rate: 0.75 },
      topPlayer: { entityKey: "player-a", kills: 2 },
    });
  });

  it("is invariant to map and row order and keeps same-name identities separate", () => {
    const first = facts({ mapKey: "map-b", mapName: "de_mirage" });
    const second = facts({ mapKey: "map-a", mapName: "de_ancient", matchKey: "match-2" });
    const labels = { labels: { players: { "player-a": "Same" }, teams: { "team-a": "Same" } } };
    const forward = buildTournamentPerformanceAnalytics([first, second], labels);
    const reverse = buildTournamentPerformanceAnalytics([
      { ...second, playerRounds: [...second.playerRounds].reverse(), objectives: [...second.objectives].reverse(), playerWeapons: [...second.playerWeapons].reverse() },
      { ...first, playerRounds: [...first.playerRounds].reverse(), objectives: [...first.objectives].reverse(), playerWeapons: [...first.playerWeapons].reverse() },
    ], labels);

    expect(reverse).toEqual(forward);
    expect(forward.totals).toMatchObject({ matchCount: 2, mapCount: 2, roundCount: 4 });
    expect(forward.players).toHaveLength(2);
    expect(forward.teams).toHaveLength(2);
  });

  it("supports zero-opportunity nulls and the full T/CT player split", () => {
    const result = buildTournamentPerformanceAnalytics([facts({
      playerRounds: facts().playerRounds.map((row) => ({ ...row, openingDuel: "none", clutch: null, utility: utility() })),
      objectives: [],
      playerWeapons: [],
    })]);
    const player = result.players[0]!;

    expect(player.slices.overall.opening.successRate).toEqual({ successes: 0, attempts: 0, rate: null });
    expect(player.slices.overall.clutch.winRate).toEqual({ successes: 0, attempts: 0, rate: null });
    expect(player.slices.overall.utility.enemyBlindSecondsPerFlash).toEqual({ successes: 0, attempts: 0, rate: null });
    expect(player.slices.t.sample.rounds).toBe(1);
    expect(player.slices.ct.sample.rounds).toBe(1);
    expect(player.slices.t.combat.killsPerRound).toEqual({ successes: 2, attempts: 1, rate: 2 });
    expect(player.slices.ct.combat.killsPerRound).toEqual({ successes: 0, attempts: 1, rate: 0 });
  });

  it("fails fast with map and field paths for malformed facts", () => {
    expect(() => buildTournamentPerformanceAnalytics([facts({
      playerRounds: [...facts().playerRounds, facts().playerRounds[0]!],
    })])).toThrow("map-1.playerRounds[4]");
    expect(() => buildTournamentPerformanceAnalytics([facts({
      playerRounds: facts().playerRounds.map((row, index) => index === 0 ? { ...row, headshots: 3 } : row),
    })])).toThrow("map-1.playerRounds[0].headshots");
    expect(() => buildTournamentPerformanceAnalytics([facts({
      playerRounds: facts().playerRounds.map((row, index) => index === 1 ? { ...row, openingDuel: "won" } : row),
    })])).toThrow("map-1.playerRounds.roundSeq=1.openingDuel");
    expect(() => buildTournamentPerformanceAnalytics([facts({
      playerWeapons: [{ playerEntityKey: "unknown", teamEntityKey: "team-a", weapon: "ak47", kills: 1, headshotKills: 0 }],
    })])).toThrow("map-1.playerWeapons[0].playerEntityKey");
    expect(() => buildTournamentPerformanceAnalytics([facts({
      objectives: [{ roundSeq: 1, type: "planted", playerEntityKey: "unknown", teamEntityKey: "team-a", side: "t", teamWonRound: true }],
    })])).toThrow("map-1.objectives[0].playerEntityKey");
    expect(() => buildTournamentPerformanceAnalytics([facts({
      semanticProfile: "other-profile",
    }), facts({ mapKey: "map-2", semanticProfile: "different-profile" })])).toThrow("map-2.semanticProfile");
  });
});
