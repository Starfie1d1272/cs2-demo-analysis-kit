import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import { buildOpeningTrails } from "./trails";

describe("buildOpeningTrails", () => {
  it("extracts full-buy opening trails with grenades from the sanitized fixture", async () => {
    const zip = await readFile(
      fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url))
    );
    const pkg = await loadDemoPackageFromZip(zip);
    const steamId64 = pkg.players[0].steamId64;

    const model = buildOpeningTrails(pkg, "fixture-match", steamId64);

    expect(model.available).toBe(true);
    expect(model.mapName).toBe("de_anubis");
    expect(model.steamId64).toBe(steamId64);
    expect(model.windowSeconds).toBe(30);
    // 长枪局存在且轨迹点落在窗口内、时间递增
    expect(model.rounds.length).toBeGreaterThan(0);
    for (const round of model.rounds) {
      expect(round.economyType).toBe("full");
      expect(round.points.length).toBeGreaterThan(0);
      for (let i = 1; i < round.points.length; i += 1) {
        expect(round.points[i].t).toBeGreaterThan(round.points[i - 1].t);
      }
      expect(round.points.at(-1)!.t).toBeLessThanOrEqual(30);
      for (const grenade of round.grenades) {
        expect(grenade.t).toBeLessThanOrEqual(30);
      }
    }
  });

  it("supports custom window and economy filters", async () => {
    const zip = await readFile(
      fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url))
    );
    const pkg = await loadDemoPackageFromZip(zip);
    const steamId64 = pkg.players[0].steamId64;

    const model = buildOpeningTrails(pkg, "fixture-match", steamId64, {
      windowSeconds: 10,
      economyTypes: ["pistol", "full"]
    });
    expect(model.windowSeconds).toBe(10);
    for (const round of model.rounds) {
      expect(["pistol", "full"]).toContain(round.economyType);
      expect(round.points.at(-1)!.t).toBeLessThanOrEqual(10);
    }
  });

  it("returns unavailable model when replay stream is missing", async () => {
    const zip = await readFile(
      fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url))
    );
    const pkg = await loadDemoPackageFromZip(zip);
    const model = buildOpeningTrails({ ...pkg, replay: undefined }, "m", pkg.players[0].steamId64);
    expect(model.available).toBe(false);
    expect(model.rounds).toHaveLength(0);
  });
});
