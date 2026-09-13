import { describe, expect, it } from "vitest";
import type { DemoPackage } from "@cs2dak/contract";
import { matchRivalHubParticipants, matchRivalHubParticipantsForReview, selectRivalHubMap, type RivalHubEvidenceTarget } from "./rivalhub-evidence";
import type { RivalHubRemoteMap, RivalHubRemotePlayer } from "./rivalhub-contract";

const target: RivalHubEvidenceTarget = {
  seasonId: "00000000-0000-4000-8000-000000000001",
  stageKey: "swiss",
  matchId: "00000000-0000-4000-8000-000000000002",
  matchMapId: "00000000-0000-4000-8000-000000000003",
  mapOrder: 1,
  entryAId: "00000000-0000-4000-8000-000000000004",
  entryBId: "00000000-0000-4000-8000-000000000005",
  expectedMapName: "de_ancient",
  evidenceRevision: "revision-1",
};

function packageFor(ids: string[]): DemoPackage {
  return {
    match: { mapName: "de_ancient", tickrate: 64, teamA: { name: "Alpha", score: 13 }, teamB: { name: "Beta", score: 9 } },
    players: ids.map((steamId64, index) => ({ steamId64, name: `Player ${index}`, teamKey: index < 5 ? "teamA" : "teamB" })),
  } as unknown as DemoPackage;
}

function lineup(ids: string[]): RivalHubRemotePlayer[] {
  return ids.map((steamId64, index) => ({
    steamId64,
    name: `Canonical ${index}`,
    userId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    eventRosterMemberId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    isStarter: true,
    entryId: index < 5 ? target.entryAId : target.entryBId,
  }));
}

function remoteMap(id: string, scoreA: number | null = 13, scoreB: number | null = 9): RivalHubRemoteMap {
  return {
    id,
    order: 1,
    mapName: "de_ancient",
    status: "finished",
    scoreA,
    scoreB,
    completedAt: "2026-09-13T00:00:00.000Z",
    evidenceRevision: "revision-1",
    target: { ...target, matchMapId: id, stageRunId: null },
    lineup: [],
    demoStatus: "finished_pending_demo",
    demoIssues: [],
    importId: null,
    demoSha256: null,
  };
}

describe("RivalHub online Demo matching", () => {
  it("uses the canonical Steam64 lineup and rejects a missing member", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const result = matchRivalHubParticipants(packageFor(ids), target, lineup(ids));
    expect(result.get(ids[0])?.entryId).toBe(target.entryAId);
    expect(result.get(ids[9])?.entryId).toBe(target.entryBId);
    expect(() => matchRivalHubParticipants(packageFor(ids), target, lineup(ids.slice(0, 9).concat("76561198000000099")))).toThrow("Demo 缺少在线名单成员");
  });

  it("matches one map by canonical lineup, target and score without requiring display names", () => {
    const pkg = packageFor(Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`));
    const result = selectRivalHubMap(pkg, [
      { series: { teamAName: "Renamed Alpha", teamBName: "Renamed Beta" }, map: { ...remoteMap("00000000-0000-4000-8000-000000000006"), lineup: lineup(pkg.players.map((player) => player.steamId64)) } },
    ]);
    expect(result.map.id).toBe("00000000-0000-4000-8000-000000000006");
  });

  it("keeps a unique score conflict reviewable instead of dropping it", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const pkg = packageFor(ids);
    const result = selectRivalHubMap(pkg, [
      { series: { teamAName: "Unrelated A", teamBName: "Unrelated B" }, map: { ...remoteMap("00000000-0000-4000-8000-000000000006", 12), lineup: lineup(ids) } },
    ]);
    expect(result.map.id).toBe("00000000-0000-4000-8000-000000000006");
  });

  it("keeps a unique roster conflict reviewable with unresolved resolution", () => {
    const remoteIds = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const demoIds = [...remoteIds.slice(0, 9), "76561198000000099"];
    const pkg = packageFor(demoIds);
    const map = { ...remoteMap("00000000-0000-4000-8000-000000000006"), lineup: lineup(remoteIds) };
    expect(selectRivalHubMap(pkg, [{ series: { teamAName: "A", teamBName: "B" }, map }]).map.id).toBe(map.id);
    const review = matchRivalHubParticipantsForReview(pkg, target, map.lineup);
    expect(review.get("76561198000000099")?.resolution.status).toBe("unresolved");
  });

  it("rejects a remote entry assignment that conflicts with the Demo observed side", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `765611980000000${String(index + 1).padStart(2, "0")}`);
    const badLineup = lineup(ids).map((player, index) => index === 0 ? { ...player, entryId: target.entryBId } : player);
    expect(() => matchRivalHubParticipants(packageFor(ids), target, badLineup)).toThrow("Canonical Entry");
  });
});
