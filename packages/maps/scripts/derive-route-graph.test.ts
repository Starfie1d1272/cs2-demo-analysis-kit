import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import {
  addSequenceTransitions,
  clusterRouteCandidates,
  compressCalloutVisits,
  findRouteCandidates,
  repoRootFromScriptUrl,
  type ObservedEdge,
  type TransitionEvidence,
} from "./derive-route-graph.js";

describe("repoRootFromScriptUrl", () => {
  it("resolves the workspace root from packages/maps/scripts", () => {
    const url = pathToFileURL("/repo/packages/maps/scripts/derive-route-graph.ts").href;

    expect(repoRootFromScriptUrl(url)).toBe("/repo");
  });
});

describe("compressCalloutVisits", () => {
  it("removes one-frame A-B-A jitter before deriving transitions", () => {
    const sequence = compressCalloutVisits([
      "A",
      "A",
      "B",
      "A",
      "A",
      "C",
      "C",
    ]);

    expect(sequence).toEqual(["A", "C"]);
  });

  it("breaks the sequence at dead or unknown frames", () => {
    const sequence = compressCalloutVisits(["A", "A", null, "B", "B"]);

    expect(sequence).toEqual(["A", null, "B"]);
  });
});

describe("addSequenceTransitions", () => {
  it("keeps T and CT counts separate and deduplicates round support", () => {
    const transitions: TransitionEvidence = new Map();

    addSequenceTransitions(transitions, ["A", "B", "C"], "t", "demo-1:1");
    addSequenceTransitions(transitions, ["A", "B"], "t", "demo-1:1");
    addSequenceTransitions(transitions, ["A", "B"], "ct", "demo-1:2");

    expect(transitions.get("A\tB")).toEqual({
      from: "A",
      to: "B",
      tCount: 2,
      ctCount: 1,
      roundKeys: new Set(["demo-1:1", "demo-1:2"]),
    });
    expect(transitions.get("B\tC")?.tCount).toBe(1);
  });
});

describe("findRouteCandidates", () => {
  it("returns only routes observed as complete player-round sequences", () => {
    const edges: ObservedEdge[] = [
      edge("TSpawn", "Main", 20, 2),
      edge("Main", "BombsiteA", 18, 2),
      edge("TSpawn", "Mid", 15, 1),
      edge("Mid", "Connector", 14, 1),
      edge("Connector", "BombsiteA", 13, 1),
      edge("Main", "TSpawn", 30, 0),
      edge("TSpawn", "Noise", 2, 0),
      edge("Noise", "BombsiteA", 2, 0),
      edge("TSpawn", "BombsiteB", 100, 0),
      edge("BombsiteB", "BombsiteA", 100, 0),
      edge("TSpawn", "CTLane", 50, 201),
      edge("CTLane", "BombsiteA", 50, 201),
    ];
    const sequences = [
      ["TSpawn", "Main", "BombsiteA"],
      ["TSpawn", "Main", "BombsiteA"],
      ["TSpawn", "Main", "BombsiteA"],
      ["TSpawn", "Mid", "Connector", "BombsiteA"],
      ["TSpawn", "Mid", "Connector", "BombsiteA"],
      ["TSpawn", "Mid", "Connector", "BombsiteA"],
      ["TSpawn", "BombsiteB", "BombsiteA"],
    ];

    const routes = findRouteCandidates(edges, sequences, {
      source: "TSpawn",
      target: "BombsiteA",
      maxHops: 3,
      minEdgeCount: 3,
      minRouteSupport: 3,
    });

    expect(routes.map((route) => route.callouts)).toEqual([
      ["TSpawn", "Main", "BombsiteA"],
      ["TSpawn", "Mid", "Connector", "BombsiteA"],
    ]);
    expect(routes[0]).toMatchObject({
      bottleneckCount: 18,
      totalCount: 38,
      playerRoundSupport: 3,
    });
  });

  it("does not cap the number of routes that meet whole-route support", () => {
    const paths = Array.from({ length: 6 }, (_, index) => [
      "TSpawn",
      `Lane${index + 1}`,
      "BombsiteA",
    ]);
    const edges = paths.flatMap((path) => [
      edge(path[0]!, path[1]!, 10, 0),
      edge(path[1]!, path[2]!, 10, 0),
    ]);
    const sequences = paths.flatMap((path) => [path, path, path]);

    const routes = findRouteCandidates(edges, sequences, {
      source: "TSpawn",
      target: "BombsiteA",
      maxHops: 3,
      minEdgeCount: 3,
      minRouteSupport: 3,
    });

    expect(routes).toHaveLength(6);
  });
});

describe("clusterRouteCandidates", () => {
  it("merges alternate entrances while preserving every concrete path", () => {
    const corridors = clusterRouteCandidates("a", [
      candidate(["TSpawn", "Street", "TSideUpper", "Canal", "Main", "BombsiteA"], 33),
      candidate(["TSpawn", "Street", "TStairs", "Canal", "Main", "BombsiteA"], 11),
      candidate(["TSpawn", "Ruins", "Bridge", "Middle", "Walkway", "BombsiteA"], 9),
    ]);

    expect(corridors).toHaveLength(2);
    expect(corridors[0]).toMatchObject({
      target: "a",
      totalPlayerRoundSupport: 44,
      sharedCallouts: ["TSpawn", "Street", "Canal", "Main", "BombsiteA"],
    });
    expect(corridors[0]?.variants.map((variant) => variant.callouts)).toEqual([
      ["TSpawn", "Street", "TSideUpper", "Canal", "Main", "BombsiteA"],
      ["TSpawn", "Street", "TStairs", "Canal", "Main", "BombsiteA"],
    ]);
    expect(corridors[1]?.sharedCallouts).toEqual([
      "TSpawn",
      "Ruins",
      "Bridge",
      "Middle",
      "Walkway",
      "BombsiteA",
    ]);
  });

  it("does not impose a corridor count cap", () => {
    const routes = Array.from({ length: 6 }, (_, index) =>
      candidate(["TSpawn", `Lane${index + 1}`, "BombsiteA"], 10 - index),
    );

    expect(clusterRouteCandidates("a", routes)).toHaveLength(6);
  });

  it("keeps different terminal approaches separate despite a shared opening", () => {
    const corridors = clusterRouteCandidates("b", [
      candidate(["TSpawn", "LowerMid", "TRamp", "Middle", "Banana", "BombsiteB"], 100),
      candidate([
        "TSpawn",
        "LowerMid",
        "TRamp",
        "Middle",
        "TopofMid",
        "Arch",
        "CTSpawn",
        "Ruins",
        "BombsiteB",
      ], 10),
    ]);

    expect(corridors).toHaveLength(2);
  });

  it("keeps B ramp and side entrance as separate corridors", () => {
    const corridors = clusterRouteCandidates("b", [
      candidate(["TSpawn", "Tunnel", "Water", "Ruins", "Lower", "Ramp", "BombsiteB"], 100),
      candidate([
        "TSpawn",
        "Tunnel",
        "Water",
        "Ruins",
        "Lower",
        "Upper",
        "SideEntrance",
        "BombsiteB",
      ], 20),
    ]);

    expect(corridors).toHaveLength(2);
  });

});

function edge(from: string, to: string, tCount: number, ctCount: number): ObservedEdge {
  return {
    from,
    to,
    tCount,
    ctCount,
    total: tCount + ctCount,
    roundCount: tCount + ctCount,
  };
}

function candidate(callouts: string[], playerRoundSupport: number) {
  return {
    callouts,
    bottleneckCount: playerRoundSupport,
    totalCount: playerRoundSupport * (callouts.length - 1),
    minTShare: 0.5,
    playerRoundSupport,
    score: 1,
  };
}
