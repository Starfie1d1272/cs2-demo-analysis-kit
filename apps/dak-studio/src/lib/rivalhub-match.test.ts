import { describe, expect, it, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DemoPackage } from "@cs2dak/contract";
import type { RivalHubRemoteMap, RivalHubRemotePlayer, RivalHubRemoteTeam } from "./rivalhub-contract";
import { matchRivalHubMap, type RivalHubMatchCandidate } from "./rivalhub-match";
import { loadDemoPackageFromZip } from "@cs2dak/core";

const fixturePath = fileURLToPath(new URL("../../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url));
let pkg: DemoPackage;

function player(steamId64: string, entryId = "entry-a"): RivalHubRemotePlayer {
  return { entryId, userId: "user", eventRosterMemberId: "roster", steamId64, name: steamId64, isStarter: true };
}

function map(overrides: Partial<RivalHubRemoteMap> = {}): RivalHubRemoteMap {
  const id = overrides.id ?? "map-1";
  const order = overrides.order ?? 1;
  const mapName = overrides.mapName ?? pkg.match.mapName;
  return {
    id,
    order,
    mapName,
    scoreA: overrides.scoreA ?? pkg.match.teamA.score,
    scoreB: overrides.scoreB ?? pkg.match.teamB.score,
    completedAt: overrides.completedAt ?? "2026-09-13T00:00:00.000Z",
    evidenceRevision: "revision-1",
    target: {
      seasonId: "season",
      stageKey: "stage",
      stageRunId: null,
      matchId: "match",
      matchMapId: id,
      mapOrder: order,
      entryAId: "entry-a",
      entryBId: "entry-b",
      expectedMapName: mapName,
      evidenceRevision: "revision-1",
      ...overrides.target,
    },
    lineup: overrides.lineup ?? [],
    demoStatus: overrides.demoStatus ?? "finished_pending_demo",
    demoIssues: [],
    importId: null,
    demoSha256: overrides.demoSha256 ?? null,
  } as RivalHubRemoteMap;
}

function candidate(id: string, mapOverrides: Partial<RivalHubRemoteMap> = {}, seriesOverrides: Partial<RivalHubMatchCandidate["series"]> = {}, eventTeams: RivalHubRemoteTeam[] = []): RivalHubMatchCandidate {
  return {
    series: {
      id: `series-${id}`,
      stageKey: "stage",
      teamAName: pkg.match.teamA.name ?? "Team A",
      teamBName: pkg.match.teamB.name ?? "Team B",
      completedAt: "2026-09-13T00:00:00.000Z",
      status: "finished",
      ...seriesOverrides,
    },
    map: map({ id, ...mapOverrides }),
    eventTeams,
  };
}

function exactLineup(): RivalHubRemotePlayer[] {
  return pkg.players.map((row) => player(row.steamId64, row.teamKey === "teamA" ? "entry-a" : "entry-b"));
}

function eventRosterTeams(reversed = false): RivalHubRemoteTeam[] {
  return (["teamA", "teamB"] as const).map((teamKey, index) => {
    const entryId = reversed
      ? (teamKey === "teamA" ? "entry-b" : "entry-a")
      : (teamKey === "teamA" ? "entry-a" : "entry-b");
    return {
      key: `event-team-${index}`,
      name: teamKey === "teamA" ? "Canonical A" : "Canonical B",
      players: pkg.players.filter((row) => row.teamKey === teamKey).map((row, playerIndex) => ({
        ...player(row.steamId64, entryId),
        // EventRoster membership is identity evidence; it must not be treated
        // as this map's starter declaration.
        isStarter: playerIndex !== 0,
      })),
    };
  });
}

describe("RivalHub target discovery", () => {
  beforeAll(async () => {
    pkg = await loadDemoPackageFromZip(await readFile(fixturePath));
  });

  it("honors a fixed official target", () => {
    const result = matchRivalHubMap(pkg, [candidate("fixed", { mapName: "de_nuke" })], { fixedMatchMapId: "fixed" });
    expect(result).toMatchObject({ status: "matched", mode: "fixed", candidate: { map: { id: "fixed" } } });
  });

  it("uses an exact remote raw Demo SHA before parsing identity evidence", () => {
    const demoSha256 = "a".repeat(64);
    const result = matchRivalHubMap(pkg, [candidate("hash", { demoSha256 })], { demoSha256: demoSha256.toUpperCase() });
    expect(result).toMatchObject({ status: "matched", mode: "remote_demo_sha" });
  });

  it("uses complete EventRoster membership for team identity when remote lineup is empty", () => {
    const result = matchRivalHubMap(pkg, [candidate("event-roster", { lineup: [] }, {}, eventRosterTeams())]);
    expect(result).toMatchObject({ status: "matched", mode: "event_roster", candidate: { map: { id: "event-roster" } } });
  });

  it("ignores EventRoster starter flags and normalizes reversed Demo sides", () => {
    const result = matchRivalHubMap(pkg, [candidate("event-reversed", {
      lineup: [],
      scoreA: pkg.match.teamB.score,
      scoreB: pkg.match.teamA.score,
    }, {}, eventRosterTeams(true))]);
    expect(result).toMatchObject({ status: "matched", mode: "event_roster", candidate: { map: { id: "event-reversed" } } });
  });

  it("uses official score after EventRoster pair leaves multiple same-map candidates", () => {
    const teams = eventRosterTeams();
    const result = matchRivalHubMap(pkg, [
      candidate("same-pair-match", {}, {}, teams),
      candidate("same-pair-other", { scoreA: 1, scoreB: 1 }, {}, teams),
    ]);
    expect(result).toMatchObject({ status: "matched", mode: "review_fallback", candidate: { map: { id: "same-pair-match" } } });
  });

  it("keeps a unique EventRoster target even when MatchRoster is unavailable or conflicts", () => {
    const result = matchRivalHubMap(pkg, [candidate("event-roster-conflict", {
      lineup: [player("76561198099999999")],
      scoreA: 0,
      scoreB: 0,
    }, {}, eventRosterTeams())]);
    expect(result).toMatchObject({ status: "matched", mode: "event_roster", candidate: { map: { id: "event-roster-conflict" } } });
  });

  it("selects a unique exact 10-player canonical lineup", () => {
    const result = matchRivalHubMap(pkg, [candidate("lineup", { lineup: exactLineup() })]);
    expect(result).toMatchObject({ status: "matched", mode: "exact_lineup" });
  });

  it("keeps a uniquely identified lineup target despite an official score conflict", () => {
    const result = matchRivalHubMap(pkg, [candidate("conflict", { lineup: exactLineup(), scoreA: 1, scoreB: 0 })]);
    expect(result).toMatchObject({ status: "matched", mode: "exact_lineup" });
  });

  it("allows reversed A/B scores in the review fallback", () => {
    const result = matchRivalHubMap(pkg, [candidate("reverse", { scoreA: pkg.match.teamB.score, scoreB: pkg.match.teamA.score })]);
    expect(result).toMatchObject({ status: "matched", mode: "review_fallback" });
  });

  it("uses a unique maximum lineup overlap of five or more as fallback evidence", () => {
    const lineup = pkg.players.slice(0, 6).map((row) => player(row.steamId64));
    const result = matchRivalHubMap(pkg, [candidate("overlap", { lineup }, { teamAName: "Unrelated A", teamBName: "Unrelated B" })]);
    expect(result).toMatchObject({ status: "matched", mode: "review_fallback" });
  });

  it("returns needs_target for a genuinely ambiguous exact score/team match", () => {
    const result = matchRivalHubMap(pkg, [candidate("ambiguous-a"), candidate("ambiguous-b")]);
    expect(result).toMatchObject({
      status: "needs_target",
      candidates: expect.arrayContaining([expect.objectContaining({ map: expect.objectContaining({ id: "ambiguous-a" }) })]),
    });
  });

  it("does not match on display names alone", () => {
    const result = matchRivalHubMap(pkg, [candidate("name-only", { scoreA: 1, scoreB: 1 })]);
    expect(result).toMatchObject({ status: "not_found" });
  });
});
