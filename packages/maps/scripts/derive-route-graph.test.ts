import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import {
  addSequenceTransitions,
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
  it("returns deterministic loop-free routes within edge thresholds", () => {
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

    const routes = findRouteCandidates(edges, {
      source: "TSpawn",
      target: "BombsiteA",
      maxHops: 3,
      minEdgeCount: 3,
      minTShare: 0.2,
      topK: 20,
    });

    expect(routes.map((route) => route.callouts)).toEqual([
      ["TSpawn", "Main", "BombsiteA"],
      ["TSpawn", "Mid", "Connector", "BombsiteA"],
    ]);
    expect(routes[0]).toMatchObject({ bottleneckCount: 18, totalCount: 38 });
  });

  it("ranks stable bottleneck support ahead of one weak high-volume edge", () => {
    const routes = findRouteCandidates([
      edge("TSpawn", "Weak", 1000, 0),
      edge("Weak", "BombsiteA", 4, 0),
      edge("TSpawn", "Stable", 20, 0),
      edge("Stable", "BombsiteA", 18, 0),
    ], {
      source: "TSpawn",
      target: "BombsiteA",
      maxHops: 3,
      minEdgeCount: 3,
      minTShare: 0.2,
      topK: 20,
    });

    expect(routes[0]?.callouts).toEqual(["TSpawn", "Stable", "BombsiteA"]);
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
