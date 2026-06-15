import { describe, expect, it } from "vitest";
import { CALLOUT_MAPS, CALLOUT_DICT } from "./callout-names.js";
import { DEFAULT_POSITIONS, anchorOf, isContested, roleOf } from "./default-positions.js";

describe("default-positions", () => {
  it("mirage T 默认位含 5 个 anchor", () => {
    expect(Object.keys(DEFAULT_POSITIONS.de_mirage.t.anchors)).toEqual([
      "a_ramp",
      "a_palace",
      "top_mid",
      "underpass",
      "b_apps",
    ]);
  });

  it("anchor 里引用的 callout 都是合法 callout（在 callout-names 中）", () => {
    for (const [map, sides] of Object.entries(DEFAULT_POSITIONS)) {
      const table = CALLOUT_DICT[map];
      for (const side of ["t", "ct"] as const) {
        for (const anchor of Object.values(sides[side].anchors)) {
          for (const callout of anchor.callouts) expect(table[callout]).toBeTruthy();
        }
      }
      for (const callout of sides.contested) {
        expect(table[callout], `${map}.contested.${callout}`).toBeTruthy();
      }
    }
  });

  it("7 图都有 t/ct 默认位且每个 anchor 至少 1 callout", () => {
    for (const map of CALLOUT_MAPS) {
      const defaults = DEFAULT_POSITIONS[map];
      expect(defaults, map).toBeTruthy();
      for (const side of ["t", "ct"] as const) {
        const anchors = Object.values(defaults[side].anchors);
        expect(anchors.length, `${map}.${side}`).toBeGreaterThan(0);
        for (const anchor of anchors) {
          expect(anchor.callouts.length, `${map}.${side}.${anchor.name}`).toBeGreaterThan(0);
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

  it("第一轮人工审核口径：默认位只保留开局停挂点，通道/争夺区不误入 default", () => {
    expect(anchorOf("de_ancient", "t", "Outside")).toBe("t_outside");
    expect(anchorOf("de_ancient", "t", "Tunnel")).toBeNull();
    expect(anchorOf("de_ancient", "t", "Water")).toBeNull();
    expect(isContested("de_ancient", "Middle")).toBe(true);

    expect(anchorOf("de_anubis", "t", "Bridge")).toBe("mid_bridge");
    expect(anchorOf("de_anubis", "t", "Middle")).toBeNull();
    expect(isContested("de_anubis", "Middle")).toBe(true);

    expect(anchorOf("de_dust2", "t", "LongA")).toBeNull();
    expect(isContested("de_dust2", "LongA")).toBe(true);

    expect(anchorOf("de_nuke", "t", "Ramp")).toBeNull();
    expect(anchorOf("de_nuke", "t", "Trophy")).toBe("lobby");

    expect(anchorOf("de_overpass", "t", "Water")).toBe("short_pipe");
    expect(isContested("de_overpass", "Water")).toBe(true);
  });

  it("roleOf：未知 callout 返回 other", () => {
    expect(roleOf("de_mirage", "t", "NoSuchPlace")).toEqual({ kind: "other" });
  });

  it("anchorOf：default 返回 anchorId，否则 null", () => {
    expect(anchorOf("de_mirage", "t", "TRamp")).toBe("a_ramp");
    expect(anchorOf("de_mirage", "t", "Catwalk")).toBeNull();
  });
});
