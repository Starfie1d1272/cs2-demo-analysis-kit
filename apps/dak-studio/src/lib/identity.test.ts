import { describe, expect, it } from "vitest";
import {
  applyMerge,
  applySplit,
  applyRename,
  applyTeamRename,
  buildCohortIdentityMap,
  displayTeamName,
  originalTeamNamesForDisplay,
  teamRenameGroups,
  type IdentityMapping,
  type IdentityStoreState
} from "./identity";

const EMPTY: IdentityStoreState = { version: 0, mappings: [], teamRenames: {} };

function makeMapping(overrides: Partial<Omit<IdentityMapping, "steamIds">> & { steamIds: string[] }): IdentityMapping {
  return {
    playerKey: `steam:${overrides.steamIds[0]}`,
    displayName: overrides.displayName ?? "Player",
    updatedAt: overrides.updatedAt ?? 0,
    ...overrides
  };
}

describe("applyMerge", () => {
  it("merges two separate identities into one", () => {
    const state: IdentityStoreState = {
      ...EMPTY,
      version: 1,
      mappings: [
        makeMapping({ steamIds: ["aaa"], displayName: "Alice" }),
        makeMapping({ steamIds: ["bbb"], displayName: "Bob" })
      ]
    };
    const next = applyMerge(state, "aaa", ["bbb"], "Alice B.");
    expect(next.version).toBe(2);
    expect(next.mappings).toHaveLength(1);
    expect(next.mappings[0].steamIds).toEqual(["aaa", "bbb"]);
    expect(next.mappings[0].displayName).toBe("Alice B.");
  });

  it("preserves existing merged ids when merging into an already-merged mapping", () => {
    const state: IdentityStoreState = {
      ...EMPTY,
      version: 2,
      mappings: [
        makeMapping({ playerKey: "steam:aaa", steamIds: ["aaa", "ccc"], displayName: "Alice" }),
        makeMapping({ steamIds: ["bbb"], displayName: "Bob" })
      ]
    };
    const next = applyMerge(state, "aaa", ["bbb"], "Team");
    expect(next.mappings).toHaveLength(1);
    expect(next.mappings[0].steamIds).toContain("aaa");
    expect(next.mappings[0].steamIds).toContain("bbb");
    expect(next.mappings[0].steamIds).toContain("ccc");
  });

  it("removes unmapped ids that are not part of the merge", () => {
    const state: IdentityStoreState = {
      ...EMPTY,
      version: 1,
      mappings: [
        makeMapping({ steamIds: ["aaa"], displayName: "A" }),
        makeMapping({ steamIds: ["bbb"], displayName: "B" }),
        makeMapping({ steamIds: ["ccc"], displayName: "C" })
      ]
    };
    const next = applyMerge(state, "aaa", ["bbb"], "AB");
    expect(next.mappings).toHaveLength(2);
    expect(next.mappings.find((m) => m.steamIds.includes("ccc"))).toBeTruthy();
  });
});

describe("applySplit", () => {
  it("removes specified steamIds from a mapping", () => {
    const state: IdentityStoreState = {
      ...EMPTY,
      version: 1,
      mappings: [
        makeMapping({ playerKey: "steam:aaa", steamIds: ["aaa", "bbb", "ccc"], displayName: "Team" })
      ]
    };
    const next = applySplit(state, "steam:aaa", ["bbb", "ccc"]);
    expect(next.version).toBe(2);
    expect(next.mappings).toHaveLength(1);
    expect(next.mappings[0].steamIds).toEqual(["aaa"]);
  });

  it("removes mapping entirely if all steamIds are split", () => {
    const state: IdentityStoreState = {
      ...EMPTY,
      version: 1,
      mappings: [
        makeMapping({ playerKey: "steam:aaa", steamIds: ["aaa", "bbb"], displayName: "Team" })
      ]
    };
    const next = applySplit(state, "steam:aaa", ["aaa", "bbb"]);
    expect(next.mappings).toHaveLength(0);
  });

  it("does not affect other player keys", () => {
    const state: IdentityStoreState = {
      ...EMPTY,
      version: 1,
      mappings: [
        makeMapping({ playerKey: "steam:aaa", steamIds: ["aaa", "bbb"], displayName: "AB" }),
        makeMapping({ playerKey: "steam:ccc", steamIds: ["ccc"], displayName: "C" })
      ]
    };
    const next = applySplit(state, "steam:aaa", ["bbb"]);
    expect(next.mappings).toHaveLength(2);
    expect(next.mappings.find((m) => m.playerKey === "steam:ccc")?.steamIds).toEqual(["ccc"]);
  });
});

describe("applyRename", () => {
  it("updates displayName for the specified playerKey", () => {
    const state: IdentityStoreState = {
      ...EMPTY,
      version: 1,
      mappings: [
        makeMapping({ playerKey: "steam:aaa", steamIds: ["aaa"], displayName: "Old" })
      ]
    };
    const next = applyRename(state, "steam:aaa", "New");
    expect(next.mappings[0].displayName).toBe("New");
    expect(next.version).toBe(2);
  });

  it("does not change other players", () => {
    const state: IdentityStoreState = {
      ...EMPTY,
      version: 1,
      mappings: [
        makeMapping({ playerKey: "steam:aaa", steamIds: ["aaa"], displayName: "A" }),
        makeMapping({ playerKey: "steam:bbb", steamIds: ["bbb"], displayName: "B" })
      ]
    };
    const next = applyRename(state, "steam:aaa", "A2");
    expect(next.mappings.find((m) => m.playerKey === "steam:bbb")?.displayName).toBe("B");
  });
});

describe("applyTeamRename", () => {
  it("sets a team rename", () => {
    const next = applyTeamRename(EMPTY, "Team Alpha", "甲队");
    expect(next.teamRenames["Team Alpha"]).toBe("甲队");
    expect(next.version).toBe(1);
  });

  it("clears a team rename when displayName is empty", () => {
    const state: IdentityStoreState = {
      ...EMPTY,
      version: 1,
      teamRenames: { "Team Alpha": "甲队" }
    };
    const next = applyTeamRename(state, "Team Alpha", "");
    expect(next.teamRenames["Team Alpha"]).toBeUndefined();
  });

  it("trims whitespace from displayName", () => {
    const next = applyTeamRename(EMPTY, "Team Alpha", "  乙队  ");
    expect(next.teamRenames["Team Alpha"]).toBe("乙队");
  });
});

describe("team rename display helpers", () => {
  it("maps raw team names to their display name without mutating the raw key", () => {
    const renames = { "NJU A": "NJU", "NJU-A": "NJU" };
    expect(displayTeamName("NJU A", renames)).toBe("NJU");
    expect(displayTeamName("Other", renames)).toBe("Other");
  });

  it("finds all original team names that fold into a selected display name", () => {
    const renames = { "NJU A": "NJU", "NJU-A": "NJU", "Rivals Blue": "Rivals" };
    expect(originalTeamNamesForDisplay("NJU", renames)).toEqual(["NJU", "NJU A", "NJU-A"]);
    expect(originalTeamNamesForDisplay("Rivals", renames)).toEqual(["Rivals", "Rivals Blue"]);
  });

  it("groups visible teams with original aliases and match counts", () => {
    const groups = teamRenameGroups(
      [
        { teamA: "NJU A", teamB: "Rivals Blue" },
        { teamA: "NJU-A", teamB: "Rivals" },
        { teamA: "Other", teamB: "NJU A" }
      ],
      { "NJU A": "NJU", "NJU-A": "NJU", "Rivals Blue": "Rivals" }
    );
    expect(groups).toEqual([
      { displayName: "NJU", originals: ["NJU A", "NJU-A"], matchCount: 3 },
      { displayName: "Other", originals: ["Other"], matchCount: 1 },
      { displayName: "Rivals", originals: ["Rivals", "Rivals Blue"], matchCount: 2 }
    ]);
  });
});

describe("buildCohortIdentityMap", () => {
  it("maps each steamId to its playerKey and displayName", () => {
    const mappings: IdentityMapping[] = [
      makeMapping({ playerKey: "steam:aaa", steamIds: ["aaa", "bbb"], displayName: "Alice" })
    ];
    const map = buildCohortIdentityMap(mappings);
    expect(map["aaa"]).toEqual({ playerKey: "steam:aaa", displayName: "Alice" });
    expect(map["bbb"]).toEqual({ playerKey: "steam:aaa", displayName: "Alice" });
  });

  it("returns empty map for empty input", () => {
    expect(buildCohortIdentityMap([])).toEqual({});
  });

  it("handles multiple independent mappings", () => {
    const mappings: IdentityMapping[] = [
      makeMapping({ playerKey: "steam:aaa", steamIds: ["aaa"], displayName: "A" }),
      makeMapping({ playerKey: "steam:bbb", steamIds: ["bbb", "ccc"], displayName: "BC" })
    ];
    const map = buildCohortIdentityMap(mappings);
    expect(Object.keys(map)).toHaveLength(3);
    const bbb = map["bbb"];
    expect(typeof bbb === "object" && bbb.playerKey).toBe("steam:bbb");
    const ccc = map["ccc"];
    expect(typeof ccc === "object" && ccc.playerKey).toBe("steam:bbb");
  });
});
