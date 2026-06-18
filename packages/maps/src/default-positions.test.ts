import { describe, expect, it } from "vitest";
import {
  CALLOUT_MAPS,
  CALLOUT_DICT,
  calloutBelongsToRegion,
  getCalloutDefinition,
  getCalloutTendencies,
  getPrimaryCalloutRegion,
} from "./callout-names.js";
import {
  DEFAULT_POSITIONS,
  anchorOf,
  classifyTacticalLocation,
  getDefaultAnchor,
} from "./default-positions.js";

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

  it("基础 callout API 保留多倾向顺序，未知 callout 不猜测", () => {
    expect(getCalloutDefinition("de_mirage", "Connector")).toEqual({ cn: "拱门", tendency: ["a", "mid"] });
    expect(getCalloutTendencies("de_mirage", "Connector")).toEqual(["a", "mid"]);
    expect(getPrimaryCalloutRegion("de_mirage", "Connector")).toBe("a");
    expect(calloutBelongsToRegion("de_mirage", "Connector", "mid")).toBe(true);
    expect(getCalloutDefinition("de_mirage", "NoSuchPlace")).toBeNull();
    expect(getCalloutTendencies("de_mirage", "NoSuchPlace")).toBeNull();
    expect(getPrimaryCalloutRegion("de_mirage", "NoSuchPlace")).toBeNull();
  });

  it("默认位只保留人工确认的开局停挂点，不维护静态 contested/advanced 角色", () => {
    expect(anchorOf("de_ancient", "t", "Outside")).toBe("t_outside");
    expect(anchorOf("de_ancient", "t", "Tunnel")).toBeNull();
    expect(anchorOf("de_ancient", "t", "Water")).toBeNull();

    expect(anchorOf("de_anubis", "t", "Bridge")).toBe("mid_bridge");
    expect(anchorOf("de_anubis", "t", "Middle")).toBeNull();

    expect(anchorOf("de_dust2", "t", "LongA")).toBeNull();

    expect(anchorOf("de_nuke", "t", "Ramp")).toBeNull();
    expect(anchorOf("de_nuke", "t", "Trophy")).toBe("lobby");

    expect(anchorOf("de_overpass", "t", "Water")).toBe("short_pipe");
  });

  it("统一位置分类只组合基础倾向与当前阵营默认位", () => {
    expect(classifyTacticalLocation("de_mirage", "t", "PalaceAlley")).toEqual({
      callout: "PalaceAlley",
      tendencies: ["a"],
      primaryRegion: "a",
      defaultAnchorId: "a_ramp",
      isDefaultPosition: true,
    });
    expect(classifyTacticalLocation("de_mirage", "ct", "PalaceAlley")).toEqual({
      callout: "PalaceAlley",
      tendencies: ["a"],
      primaryRegion: "a",
      defaultAnchorId: null,
      isDefaultPosition: false,
    });
    expect(classifyTacticalLocation("de_mirage", "t", "NoSuchPlace")).toEqual({
      callout: "NoSuchPlace",
      tendencies: [],
      primaryRegion: null,
      defaultAnchorId: null,
      isDefaultPosition: false,
    });
    expect(classifyTacticalLocation("de_mirage", "t", null).callout).toBeNull();
  });

  it("anchorOf：default 返回 anchorId，否则 null", () => {
    expect(anchorOf("de_mirage", "t", "TRamp")).toBe("a_ramp");
    expect(anchorOf("de_mirage", "t", "Catwalk")).toBeNull();
    expect(getDefaultAnchor("de_mirage", "t", "TRamp")).toMatchObject({ id: "a_ramp", name: "A1" });
  });
});
