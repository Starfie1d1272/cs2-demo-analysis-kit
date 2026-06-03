import { describe, expect, it } from "vitest";
import { displayWeaponName } from "./weapons";

describe("displayWeaponName", () => {
  it("maps raw codes to canonical display names", () => {
    expect(displayWeaponName("ak47")).toBe("AK-47");
    expect(displayWeaponName("m4a1_silencer")).toBe("M4A1-S");
    expect(displayWeaponName("awp")).toBe("AWP");
    expect(displayWeaponName("deagle")).toBe("Desert Eagle");
  });

  it("strips the weapon_ prefix and is case-insensitive", () => {
    expect(displayWeaponName("weapon_ak47")).toBe("AK-47");
    expect(displayWeaponName("WEAPON_AWP")).toBe("AWP");
  });

  it("collapses every knife/bayonet variant to a single label", () => {
    expect(displayWeaponName("knife")).toBe("knife");
    expect(displayWeaponName("knife_karambit")).toBe("knife");
    expect(displayWeaponName("weapon_bayonet")).toBe("knife");
  });

  it("falls back to the normalized code instead of an unknown placeholder", () => {
    expect(displayWeaponName("weapon_some_future_gun")).toBe("some_future_gun");
  });

  it("never returns a purely numeric string for a named weapon", () => {
    for (const raw of ["ak47", "m4a1_silencer", "knife_m9_bayonet", "future_gun"]) {
      expect(/^\d+$/.test(displayWeaponName(raw))).toBe(false);
    }
  });
});
