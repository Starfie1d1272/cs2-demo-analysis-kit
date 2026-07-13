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
  DEFAULT_POSITION_GROUPS,
  positionGroupOf,
  classifyTacticalLocation,
  getDefaultPositionGroup,
} from "./default-positions.js";

describe("default-positions", () => {
  it("mirage T 默认位含 5 个位置责任组", () => {
    expect(Object.keys(DEFAULT_POSITION_GROUPS.de_mirage.t.groups)).toEqual([
      "a_ramp",
      "a_palace",
      "top_mid",
      "underpass",
      "b_apps",
    ]);
  });

  it("anchor 里引用的 callout 都是合法 callout（在 callout-names 中）", () => {
    for (const [map, sides] of Object.entries(DEFAULT_POSITION_GROUPS)) {
      const table = CALLOUT_DICT[map];
      for (const side of ["t", "ct"] as const) {
        for (const group of Object.values(sides[side].groups)) {
          for (const callout of group.callouts) expect(table[callout]).toBeTruthy();
        }
      }
    }
  });

  it("7 图都有 t/ct 默认位且每个 anchor 至少 1 callout", () => {
    for (const map of CALLOUT_MAPS) {
      const defaults = DEFAULT_POSITION_GROUPS[map];
      expect(defaults, map).toBeTruthy();
      for (const side of ["t", "ct"] as const) {
        const groups = Object.values(defaults[side].groups);
        expect(groups.length, `${map}.${side}`).toBeGreaterThan(0);
        for (const group of groups) {
          expect(group.callouts.length, `${map}.${side}.${group.name}`).toBeGreaterThan(0);
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

  it("默认位置组只保留人工确认的开局停挂点，不维护静态 contested/advanced 角色", () => {
    expect(positionGroupOf("de_ancient", "t", "Outside")).toBe("t_outside");
    expect(positionGroupOf("de_ancient", "t", "Tunnel")).toBeNull();
    expect(positionGroupOf("de_ancient", "t", "Water")).toBeNull();

    expect(positionGroupOf("de_anubis", "t", "Bridge")).toBe("mid_bridge");
    expect(positionGroupOf("de_anubis", "t", "Middle")).toBeNull();

    expect(positionGroupOf("de_dust2", "t", "LongA")).toBeNull();

    expect(positionGroupOf("de_nuke", "t", "Ramp")).toBeNull();
    expect(positionGroupOf("de_nuke", "t", "Trophy")).toBe("lobby");

    expect(positionGroupOf("de_overpass", "t", "Water")).toBe("short_pipe");
  });

  it("统一位置分类只组合基础倾向与当前阵营默认位", () => {
    expect(classifyTacticalLocation("de_mirage", "t", "PalaceAlley")).toEqual({
      callout: "PalaceAlley",
      tendencies: ["a"],
      primaryRegion: "a",
      positionGroupId: "a_ramp",
      isDefaultPosition: true,
    });
    expect(classifyTacticalLocation("de_mirage", "ct", "PalaceAlley")).toEqual({
      callout: "PalaceAlley",
      tendencies: ["a"],
      primaryRegion: "a",
      positionGroupId: null,
      isDefaultPosition: false,
    });
    expect(classifyTacticalLocation("de_mirage", "t", "NoSuchPlace")).toEqual({
      callout: "NoSuchPlace",
      tendencies: [],
      primaryRegion: null,
      positionGroupId: null,
      isDefaultPosition: false,
    });
    expect(classifyTacticalLocation("de_mirage", "t", null).callout).toBeNull();
  });

  it("positionGroupOf：default 返回 positionGroupId，否则 null", () => {
    expect(positionGroupOf("de_mirage", "t", "TRamp")).toBe("a_ramp");
    expect(positionGroupOf("de_mirage", "t", "Catwalk")).toBeNull();
    expect(getDefaultPositionGroup("de_mirage", "t", "TRamp")).toMatchObject({ id: "a_ramp", name: "A1" });
  });
});
