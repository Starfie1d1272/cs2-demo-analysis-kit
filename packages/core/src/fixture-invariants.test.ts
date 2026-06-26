import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeDemoPackage, loadDemoPackageFromZip } from "./index";

const cologneSmokeFixture = fileURLToPath(
  new URL("../../../fixtures/input/cologne-major-2026-stage3-smoke-de_nuke.zip", import.meta.url)
);

describe("fixture invariants", () => {
  it("loads the Cologne Major cs2df 3.1.0 smoke fixture end-to-end", async () => {
    const pkg = await loadDemoPackageFromZip(await readFile(cologneSmokeFixture));
    const bundle = analyzeDemoPackage(pkg);

    expect(pkg.manifest.schemaVersion).toBe("cs2-demo-format/3.0");
    expect(pkg.manifest.exporter).toMatchObject({ name: "cs2df", version: "3.1.0" });
    expect(pkg.manifest.demo?.sourceFileName).toBe("aurora-vs-9z-m1-nuke.dem");
    expect(pkg.match.mapName).toBe("de_nuke");
    expect(pkg.match.teamA.name).toBe("9z");
    expect(pkg.match.teamB.name).toBe("Aurora Gaming");
    expect([pkg.match.teamA.score, pkg.match.teamB.score]).toEqual([1, 13]);
    expect(pkg.players).toHaveLength(10);
    expect(pkg.rounds).toHaveLength(14);
    expect(pkg.kills).toHaveLength(94);
    expect(pkg.damages).toHaveLength(352);
    expect(pkg.bombs).toHaveLength(41);
    expect(pkg.grenades).toHaveLength(212);
    expect(pkg.shots).toMatchObject({ meta: expect.any(Object), tracks: expect.any(Array) });
    expect(pkg.replay).toMatchObject({ meta: expect.any(Object), rounds: expect.any(Array) });
    expect(pkg.duels).toMatchObject({ meta: expect.any(Object), windows: expect.any(Array) });

    expect(bundle.qa.ok).toBe(true);
    expect(bundle.qa.summary.issueCount).toBe(0);
    expect(bundle.scoreboard).toHaveLength(10);
    expect(bundle.economy).toHaveLength(14);
    expect(bundle.timeline.length).toBeGreaterThan(pkg.kills.length);
    expect(bundle.heatmap.length).toBeGreaterThan(pkg.damages.length);
    expect(bundle.provenance.sourceDemoHash).toBe(pkg.manifest.demo?.hash);
  });
});
