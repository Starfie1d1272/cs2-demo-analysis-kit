import { describe, expect, it } from "vitest";
import { resolveReplayHudStem } from "./replay-hud";

describe("resolveReplayHudStem", () => {
  it.each([
    ["weapon_ak47", "ak47"],
    ["M4A1-S", "m4a1_silencer"],
    ["USP-S", "usp_silencer"],
    ["weapon_smokegrenade", "smokegrenade"],
    ["smoke", "smokegrenade"],
    ["Dual Berettas", "elite"],
    ["MAC-10", "mac10"],
  ])("maps %s to %s", (raw, expected) => {
    expect(resolveReplayHudStem(raw)).toBe(expected);
  });

  it("keeps unknown presentation values unresolved", () => {
    expect(resolveReplayHudStem("future_weapon")).toBeNull();
  });
});
