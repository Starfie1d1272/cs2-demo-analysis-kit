import { describe, expect, it } from "vitest";
import { MAP_CALIBRATIONS, MAP_CALIBRATION_VERSION, getMapCalibration, hasLowerLevel, levelAt, worldToRadar } from "./calibration.js";
import * as root from "./index.js";
import { MAP_CALIBRATION_VERSION as gridVersion } from "./radar-grid.js";

describe("overview calibration", () => {
  it("retains all ten calibrations and a single owner across public surfaces", () => {
    const maps = ["de_ancient", "de_anubis", "de_cache", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_overpass", "de_train", "de_vertigo"];
    expect(Object.keys(MAP_CALIBRATIONS).sort()).toEqual(maps);
    for (const name of maps) expect(getMapCalibration(name)?.mapName).toBe(name);
    expect(getMapCalibration("unknown")).toBeNull();
    expect(root.MAP_CALIBRATIONS).toBe(MAP_CALIBRATIONS);
    expect(root.worldToRadar).toBe(worldToRadar);
    expect(MAP_CALIBRATION_VERSION).toBe("2");
    expect(root.MAP_CALIBRATION_VERSION).toBe(MAP_CALIBRATION_VERSION);
    expect(gridVersion).toBe(MAP_CALIBRATION_VERSION);
  });

  it("projects the overview origin and unit steps with inverted world Y", () => {
    const c = getMapCalibration("de_mirage")!;
    const origin = worldToRadar({ x: c.posX, y: c.posY }, c);
    expect(origin.x).toBeCloseTo(0); expect(origin.y).toBeCloseTo(0);
    expect(origin.outOfBounds).toBe(false);
    expect(worldToRadar({ x: c.posX + c.scale, y: c.posY }, c).x).toBeCloseTo(1);
    expect(worldToRadar({ x: c.posX, y: c.posY + c.scale }, c).y).toBeCloseTo(-1);
  });

  it.each([[-96, false], [-97, true], [1120, false], [1121, true]] as const)("retains the 96px padding at %s", (pixel, outOfBounds) => {
    const c = getMapCalibration("de_mirage")!;
    expect(worldToRadar({ x: c.posX + pixel * c.scale, y: c.posY }, c).outOfBounds).toBe(outOfBounds);
    expect(worldToRadar({ x: c.posX, y: c.posY - pixel * c.scale }, c).outOfBounds).toBe(outOfBounds);
  });

  it.each([["de_nuke", -495], ["de_vertigo", 11700], ["de_train", -50]] as const)("classifies %s at its overview floor split", (name, split) => {
    const c = getMapCalibration(name)!;
    expect(c.lowerLevelMaxUnits).toBe(split);
    expect(hasLowerLevel(c)).toBe(true);
    expect(levelAt(split - 1, c)).toBe("lower");
    expect(levelAt(split, c)).toBe("upper");
    expect(levelAt(split + 1, c)).toBe("upper");
  });

  it("keeps single-level fallback and repeated projection deterministic", () => {
    const c = getMapCalibration("de_mirage")!;
    expect(hasLowerLevel(c)).toBe(false);
    expect(levelAt(-5000, c)).toBe("upper");
    expect(levelAt(20000, c)).toBe("upper");
    const point = { x: 12, y: 34 };
    expect(worldToRadar(point, c)).toEqual(worldToRadar(point, c));
  });
});
