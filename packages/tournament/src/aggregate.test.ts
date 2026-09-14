import { describe, expect, it } from "vitest";
import type { TournamentMapFacts, TournamentManAdvantage, TournamentTeamConversionCount } from "./types";
import { buildTournamentAnalytics } from "./aggregate";

const MAN_KEYS = ["5v4", "4v5", "5v3", "3v5"] as const satisfies readonly TournamentManAdvantage[];

function count(opportunities: number, wins: number): { opportunities: number; wins: number } {
  return { opportunities, wins };
}

function zeroRateCount(): { opportunities: number; wins: number; rate: null } {
  return { opportunities: 0, wins: 0, rate: null };
}

function conversions(overrides: Partial<TournamentTeamConversionCount> = {}): TournamentTeamConversionCount {
  return {
    pistol: count(2, 1),
    round2: { conversion: count(1, 1), break: count(1, 0) },
    ecoSemiUpset: count(2, 1),
    manAdvantage: {
      "5v4": count(1, 1),
      "4v5": count(1, 0),
      "5v3": count(1, 1),
      "3v5": count(1, 0),
    },
    ...overrides,
  };
}

function teamConversions(): TournamentMapFacts["teamConversions"] {
  return {
    teamA: conversions(),
    teamB: conversions({
      manAdvantage: {
        "5v4": count(1, 0),
        "4v5": count(1, 1),
        "5v3": count(1, 0),
        "3v5": count(1, 1),
      },
    }),
  };
}

function mapFacts(overrides: Partial<TournamentMapFacts> = {}): TournamentMapFacts {
  return {
    semanticProfile: "dak-stable/1",
    analysisVersion: "cs2-demo-analysis-kit/1.0.1",
    mapKey: "map-1",
    matchKey: "match-1",
    mapName: "de_ancient",
    teamEntityKeys: { teamA: "team-a", teamB: "team-b" },
    teamMaps: {
      teamA: { rounds: 4, roundWins: 2, tRounds: 2, tWins: 1, ctRounds: 2, ctWins: 1 },
      teamB: { rounds: 4, roundWins: 2, tRounds: 2, tWins: 1, ctRounds: 2, ctWins: 1 },
    },
    teamConversions: teamConversions(),
    economyMatrix: [
      { lowEconomy: "eco", highEconomy: "full", rounds: 2, lowEconomyWins: 1 },
      { lowEconomy: "full", highEconomy: "full", rounds: 1, lowEconomyWins: 1 },
    ],
    pistolSides: { t: count(2, 1), ct: count(2, 1) },
    playerWeapons: [
      { playerEntityKey: "player-a", teamEntityKey: "team-a", weapon: "ak47", kills: 2, headshotKills: 1 },
      { playerEntityKey: "player-b", teamEntityKey: "team-b", weapon: "ak47", kills: 1, headshotKills: 1 },
      { playerEntityKey: "player-b", teamEntityKey: "team-b", weapon: "awp", kills: 1, headshotKills: 0 },
    ],
    ...overrides,
  };
}

function noLabels(value: ReturnType<typeof buildTournamentAnalytics>) {
  return {
    ...value,
    teams: value.teams.map(({ team: _team, ...row }) => row),
    weapons: value.weapons.map(({ topPlayer, ...row }) => ({
      ...row,
      topPlayer: topPlayer ? { entityKey: topPlayer.entityKey, kills: topPlayer.kills } : null,
    })),
  };
}

describe("buildTournamentAnalytics", () => {
  it("returns a zero model with null rates for empty input", () => {
    const result = buildTournamentAnalytics([]);
    expect(result).toEqual({
      provenance: { semanticProfile: null, analysisVersions: [] },
      totals: {
        matchCount: 0,
        mapCount: 0,
        roundCount: 0,
        t: zeroRateCount(),
        ct: zeroRateCount(),
        pistolT: zeroRateCount(),
        pistolCt: zeroRateCount(),
        round2Conversion: zeroRateCount(),
        round2Break: zeroRateCount(),
        ecoSemiUpset: zeroRateCount(),
        manAdvantage: Object.fromEntries(MAN_KEYS.map((key) => [key, zeroRateCount()])),
      },
      maps: [],
      teams: [],
      economyMatrix: [],
      weapons: [],
    });
    expect(result.totals.t.rate).toBeNull();
  });

  it("merges one map into side, conversion, economy and weapon counts", () => {
    const result = buildTournamentAnalytics([mapFacts()], { labels: { teams: { "team-a": "Alpha" } } });
    expect(result.provenance).toEqual({ semanticProfile: "dak-stable/1", analysisVersions: ["cs2-demo-analysis-kit/1.0.1"] });
    expect(result.totals).toMatchObject({ matchCount: 1, mapCount: 1, roundCount: 4, t: { opportunities: 4, wins: 2, rate: 0.5 }, ct: { opportunities: 4, wins: 2, rate: 0.5 } });
    expect(result.maps).toEqual([expect.objectContaining({ mapName: "de_ancient", mapCount: 1, roundCount: 4 })]);
    expect(result.teams.map((team) => [team.team.entityKey, team.team.displayName, team.rounds, team.roundWins])).toEqual([
      ["team-a", "Alpha", 4, 2],
      ["team-b", "team-b", 4, 2],
    ]);
    expect(result.totals.pistolT).toEqual({ opportunities: 2, wins: 1, rate: 0.5 });
    expect(result.totals.pistolCt).toEqual({ opportunities: 2, wins: 1, rate: 0.5 });
    expect(result.totals.round2Conversion).toEqual({ opportunities: 2, wins: 2, rate: 1 });
    expect(result.totals.round2Break).toEqual({ opportunities: 2, wins: 0, rate: 0 });
    expect(result.totals.ecoSemiUpset).toEqual({ opportunities: 4, wins: 2, rate: 0.5 });
    expect(result.totals.manAdvantage).toEqual({
      "5v4": { opportunities: 2, wins: 1, rate: 0.5 },
      "4v5": { opportunities: 2, wins: 1, rate: 0.5 },
      "5v3": { opportunities: 2, wins: 1, rate: 0.5 },
      "3v5": { opportunities: 2, wins: 1, rate: 0.5 },
    });
    expect(result.teams[0]?.round2).toEqual({
      conversion: { opportunities: 1, wins: 1, rate: 1 },
      break: { opportunities: 1, wins: 0, rate: 0 },
    });
    expect(result.teams[0]?.ecoSemiUpset).toEqual({ opportunities: 2, wins: 1, rate: 0.5 });
    expect(result.teams[0]?.manAdvantage).toEqual({
      "5v4": { opportunities: 1, wins: 1, rate: 1 },
      "4v5": { opportunities: 1, wins: 0, rate: 0 },
      "5v3": { opportunities: 1, wins: 1, rate: 1 },
      "3v5": { opportunities: 1, wins: 0, rate: 0 },
    });
    expect(result.economyMatrix).toEqual([
      { lowEconomy: "eco", highEconomy: "full", rounds: 2, lowEconomyWins: 1, lowWinRate: 0.5 },
      { lowEconomy: "full", highEconomy: "full", rounds: 1, lowEconomyWins: 1, lowWinRate: null },
    ]);
    expect(result.weapons[0]).toMatchObject({ weapon: "ak47", kills: 3, headshotKills: 2, headshotRate: 2 / 3, topPlayer: { entityKey: "player-a", kills: 2 } });
  });

  it("merges maps and recomputes rates from summed counts", () => {
    const second = mapFacts({ mapKey: "map-2", matchKey: "match-2", mapName: "de_mirage", teamMaps: {
      teamA: { rounds: 2, roundWins: 2, tRounds: 1, tWins: 1, ctRounds: 1, ctWins: 1 },
      teamB: { rounds: 2, roundWins: 0, tRounds: 1, tWins: 0, ctRounds: 1, ctWins: 0 },
    }, pistolSides: { t: count(1, 1), ct: count(1, 0) } });
    const result = buildTournamentAnalytics([mapFacts(), second]);
    expect(result.totals).toMatchObject({ matchCount: 2, mapCount: 2, roundCount: 6, t: { opportunities: 6, wins: 3, rate: 0.5 } });
    expect(result.maps.map((map) => map.mapName)).toEqual(["de_ancient", "de_mirage"]);
    expect(result.teams.find((team) => team.team.entityKey === "team-a")).toMatchObject({ mapCount: 2, rounds: 6, roundWins: 4, roundWinRate: 2 / 3 });
  });

  it("aggregates map rows by mapName while retaining distinct map identity", () => {
    const second = mapFacts({ mapKey: "map-2", matchKey: "match-2", teamMaps: {
      teamA: { rounds: 4, roundWins: 1, tRounds: 2, tWins: 0, ctRounds: 2, ctWins: 1 },
      teamB: { rounds: 4, roundWins: 3, tRounds: 2, tWins: 2, ctRounds: 2, ctWins: 1 },
    } });
    const result = buildTournamentAnalytics([mapFacts(), second]);
    expect(result.totals).toMatchObject({ matchCount: 2, mapCount: 2, roundCount: 8 });
    expect(result.maps).toEqual([expect.objectContaining({ mapName: "de_ancient", mapCount: 2, roundCount: 8, t: { opportunities: 8, wins: 4, rate: 0.5 } })]);
  });

  it("is invariant to input map order and counts distinct match/map identities", () => {
    const first = mapFacts({ mapKey: "map-a", matchKey: "match-1" });
    const second = mapFacts({ mapKey: "map-b", matchKey: "match-1", mapName: "de_mirage" });
    const forward = buildTournamentAnalytics([first, second]);
    const reverse = buildTournamentAnalytics([second, first]);
    expect(reverse).toEqual(forward);
    expect(forward.totals.matchCount).toBe(1);
    expect(forward.totals.mapCount).toBe(2);
  });

  it("fails closed for duplicate maps and mixed semantic profiles", () => {
    expect(() => buildTournamentAnalytics([mapFacts(), mapFacts()])).toThrow("map-1.mapKey");
    expect(() => buildTournamentAnalytics([mapFacts(), mapFacts({ mapKey: "map-2", semanticProfile: "other-profile" })])).toThrow("map-2.semanticProfile");
  });

  it("allows different analysis versions under one semantic profile in lexical order", () => {
    const result = buildTournamentAnalytics([
      mapFacts({ mapKey: "map-b", analysisVersion: "2.0" }),
      mapFacts({ mapKey: "map-a", analysisVersion: "1.0" }),
    ]);
    expect(result.provenance.analysisVersions).toEqual(["1.0", "2.0"]);
  });

  it("keeps zero-win and zero-opportunity rate semantics", () => {
    const result = buildTournamentAnalytics([mapFacts({
      teamConversions: {
        teamA: { ...teamConversions().teamA, pistol: count(0, 0), round2: { conversion: count(1, 0), break: count(1, 1) }, ecoSemiUpset: count(0, 0) },
        teamB: { ...teamConversions().teamB, pistol: count(0, 0), round2: { conversion: count(1, 0), break: count(1, 1) }, ecoSemiUpset: count(0, 0) },
      },
      pistolSides: { t: count(0, 0), ct: count(0, 0) },
    })]);
    expect(result.teams[0]?.pistol.rate).toBeNull();
    expect(result.totals.round2Conversion).toEqual({ opportunities: 2, wins: 0, rate: 0 });
    expect(result.totals.ecoSemiUpset).toEqual({ opportunities: 0, wins: 0, rate: null });
  });

  it("keeps same-name teams and players separate by entity key", () => {
    const result = buildTournamentAnalytics([mapFacts({
      teamEntityKeys: { teamA: "team-a-1", teamB: "team-b-1" },
      playerWeapons: [
        { playerEntityKey: "player-1", teamEntityKey: "team-a-1", weapon: "ak47", kills: 2, headshotKills: 0 },
        { playerEntityKey: "player-2", teamEntityKey: "team-b-1", weapon: "ak47", kills: 1, headshotKills: 1 },
        { playerEntityKey: "player-2", teamEntityKey: "team-b-1", weapon: "m4a1", kills: 1, headshotKills: 0 },
      ],
    })], { labels: { teams: { "team-a-1": "Same Name", "team-b-1": "Same Name" }, players: { "player-1": "Same Player", "player-2": "Same Player" } } });
    expect(result.teams).toHaveLength(2);
    expect(result.teams.map((team) => team.team.entityKey)).toEqual(["team-a-1", "team-b-1"]);
    expect(result.weapons.find((row) => row.weapon === "ak47")).toMatchObject({ kills: 3, topPlayer: { entityKey: "player-1", displayName: "Same Player" } });
    expect(result.weapons.find((row) => row.weapon === "m4a1")?.topPlayer?.entityKey).toBe("player-2");
  });

  it("changes only labels when labels change and uses a stable player tie-break", () => {
    const facts = mapFacts({ playerWeapons: [
      { playerEntityKey: "player-z", teamEntityKey: "team-a", weapon: "ak47", kills: 1, headshotKills: 0 },
      { playerEntityKey: "player-a", teamEntityKey: "team-b", weapon: "ak47", kills: 1, headshotKills: 0 },
    ] });
    const noLabelResult = buildTournamentAnalytics([facts]);
    const renamedResult = buildTournamentAnalytics([facts], { labels: { teams: { "team-a": "Renamed A", "team-b": "Renamed B" }, players: { "player-a": "Same", "player-z": "Same" } } });
    expect(noLabels(renamedResult)).toEqual(noLabels(noLabelResult));
    expect(renamedResult.teams.map((team) => team.team.displayName)).toEqual(["Renamed A", "Renamed B"]);
    expect(renamedResult.weapons.find((row) => row.weapon === "ak47")?.topPlayer).toEqual({ entityKey: "player-a", displayName: "Same", kills: 1 });
  });

  it("rejects impossible counts with map and field paths", () => {
    expect(() => buildTournamentAnalytics([mapFacts({ teamMaps: {
      teamA: { rounds: 4, roundWins: 3, tRounds: 2, tWins: 2, ctRounds: 2, ctWins: 2 },
      teamB: { rounds: 4, roundWins: 1, tRounds: 2, tWins: 1, ctRounds: 2, ctWins: 0 },
    } })])).toThrow("map-1.teamMaps.teamA");
    expect(() => buildTournamentAnalytics([mapFacts({ pistolSides: { t: count(2, 2), ct: count(1, 0) } })])).toThrow("map-1.pistolSides");
    expect(() => buildTournamentAnalytics([mapFacts({ teamConversions: {
      teamA: conversions({ round2: { conversion: count(2, 2), break: count(0, 0) } }),
      teamB: conversions(),
    } })])).toThrow("map-1.teamConversions.round2");
    expect(() => buildTournamentAnalytics([mapFacts({ teamConversions: {
      teamA: conversions({ manAdvantage: { ...conversions().manAdvantage, "5v4": count(2, 2) } }),
      teamB: conversions(),
    } })])).toThrow("map-1.teamConversions.manAdvantage.5v4/4v5");
    expect(() => buildTournamentAnalytics([mapFacts({ playerWeapons: [{ playerEntityKey: "p", teamEntityKey: "team-a", weapon: "ak47", kills: 1, headshotKills: 2 }] })])).toThrow("map-1.playerWeapons[0].headshotKills");
    expect(() => buildTournamentAnalytics([mapFacts({ playerWeapons: [{ playerEntityKey: "p", teamEntityKey: "other-team", weapon: "ak47", kills: 1, headshotKills: 0 }] })])).toThrow("map-1.playerWeapons[0].teamEntityKey");
  });
});
