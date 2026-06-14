import { describe, expect, it } from "vitest";
import { CALLOUT_NAME_CN } from "./callout-names.js";
import { DEFAULT_POSITIONS, anchorOf, roleOf } from "./default-positions.js";

describe("default-positions", () => {
  it("mirage T 默认位含 5 个 anchor", () => {
    expect(Object.keys(DEFAULT_POSITIONS.de_mirage.t.anchors)).toEqual([
      "a_ramp",
      "a_palace",
      "mid",
      "underpass",
      "b_apps",
    ]);
  });

  it("anchor 里引用的 callout 都是合法 callout（在 callout-names 中）", () => {
    for (const [map, sides] of Object.entries(DEFAULT_POSITIONS)) {
      const table = (CALLOUT_NAME_CN as Record<string, Record<string, string>>)[map];
      for (const side of ["t", "ct"] as const) {
        for (const anchor of Object.values(sides[side].anchors)) {
          for (const callout of anchor.callouts) expect(table[callout]).toBeTruthy();
        }
      }
    }
  });

  it("roleOf：mirage T 的 PalaceAlley 是 default→a_ramp，Catwalk 是 advanced，Jungle 是 ct，BombsiteA 是 terminal", () => {
    expect(roleOf("de_mirage", "t", "PalaceAlley")).toEqual({
      kind: "default",
      anchorId: "a_ramp",
    });
    expect(roleOf("de_mirage", "t", "Catwalk")).toEqual({ kind: "advanced" });
    expect(roleOf("de_mirage", "t", "Jungle")).toEqual({ kind: "ct" });
    expect(roleOf("de_mirage", "t", "BombsiteA")).toEqual({ kind: "terminal" });
  });

  it("roleOf：未知 callout 返回 other", () => {
    expect(roleOf("de_mirage", "t", "NoSuchPlace")).toEqual({ kind: "other" });
  });

  it("anchorOf：default 返回 anchorId，否则 null", () => {
    expect(anchorOf("de_mirage", "t", "TRamp")).toBe("a_ramp");
    expect(anchorOf("de_mirage", "t", "Catwalk")).toBeNull();
  });
});
