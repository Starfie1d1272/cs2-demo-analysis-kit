import { describe, expect, it } from "vitest";
import { currentBuiltWith } from "./analysis-manifest.js";
import { deriveCapabilityAvailability } from "./capability-availability.js";
import type { StudioDemoEntry } from "./library.js";

function entry(id: string, options: { replay?: boolean; stale?: boolean; built?: boolean } = {}): StudioDemoEntry {
  return {
    id,
    fileName: `${id}.zip`,
    importedAt: 0,
    tags: [],
    ...(options.built === false ? {} : { builtWith: options.stale ? { factsRevision: "stale", formatVersion: "cs2-demo-format/3.0" } : currentBuiltWith() }),
    meta: {
      mapName: "de_inferno",
      teamAName: "FURIA",
      teamBName: "Spirit",
      teamAScore: 13,
      teamBScore: 8,
      roundCount: 21,
      durationSeconds: 1800,
      playerCount: 10,
      hasReplay: options.replay ?? true,
      source: "test",
      serverName: null,
      matchDate: null,
    },
  } as StudioDemoEntry;
}

describe("CapabilityAvailability", () => {
  it("keeps stale facts out of the eligible denominator and reports optional coverage", () => {
    const entries = [entry("ready"), entry("stale", { stale: true }), entry("degraded", { replay: false })];
    const inputs = new Map([
      ["ready", { facts: { duel: true }, hasReplay: true, hasShots: true, hasTri: true }],
      ["stale", { facts: { duel: true }, hasReplay: true, hasShots: true, hasTri: true }],
      ["degraded", { facts: { duel: true }, hasReplay: false, hasShots: false, hasTri: false }],
    ]);

    expect(deriveCapabilityAvailability(entries, "duel", inputs)).toMatchObject({
      status: "partial",
      eligibleMatches: 2,
      totalMatches: 3,
      excluded: [{ reason: "facts 需要重建", count: 1, entryIds: ["stale"] }],
      dependencies: [
        { key: "shots", available: 1, totalEligible: 2, required: false },
        { key: "tri", available: 1, totalEligible: 2, required: false },
      ],
      repairActions: ["rebuild-facts", "reimport-with-shots", "install-tri"],
      outputLevel: "system-finding",
    });
  });

  it("marks a replay-dependent observation capability unavailable instead of returning zero data", () => {
    const entries = [entry("no-replay", { replay: false })];
    const availability = deriveCapabilityAvailability(entries, "control", new Map([
      ["no-replay", { facts: {}, hasReplay: false, hasShots: false, hasTri: false }],
    ]));

    expect(availability).toMatchObject({
      status: "unavailable",
      eligibleMatches: 0,
      totalMatches: 1,
      excluded: [{ reason: "replay 缺失", count: 1 }],
      outputLevel: "observation",
    });
  });

  it("does not require rebuildable facts for the replay-native control capability", () => {
    const entries = [entry("legacy-replay", { built: false })];
    const availability = deriveCapabilityAvailability(entries, "control", new Map([
      ["legacy-replay", { facts: {}, hasReplay: true, hasShots: false, hasTri: true }],
    ]));

    expect(availability).toMatchObject({ status: "ready", eligibleMatches: 1, excluded: [] });
  });
});
