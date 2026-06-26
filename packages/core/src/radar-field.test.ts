import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { buildRadarFieldGrid } from "@cs2dak/maps";
import type { DemoPackage } from "@cs2dak/contract";
import { loadDemoPackageFromZip } from "./loader.js";
import { buildMatchRadarField, aggregateRadarFields } from "./radar-field.js";

let pkg: DemoPackage;

beforeAll(async () => {
  const zip = await readFile(
    fileURLToPath(new URL("../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url))
  );
  pkg = await loadDemoPackageFromZip(zip);
});

describe("buildMatchRadarField", () => {
  it("每场产出两份按队归属的加性场贡献", () => {
    const grid = buildRadarFieldGrid("de_ancient");
    expect(grid).not.toBeNull();
    const fields = buildMatchRadarField(pkg, { matchId: "m", grid: grid!, bvh: null });
    expect(fields).toHaveLength(2);

    for (const f of fields) {
      expect(f.scope.kind).toBe("team");
      expect(f.triAvailability).toBe("none"); // 无 .tri
      expect(f.denomCt).toHaveLength(f.maxSec);
      expect(f.denomT).toHaveLength(f.maxSec);
      expect(f.fields.ctVis).toHaveLength(f.maxSec);
      expect(f.fields.ctVis[0]!).toHaveLength(f.grid.cells.length);
    }
    // 至少有一个回合被采样（denom 有非零），且有视野/位置计数。
    const totalDenom = fields.reduce((s, f) => s + f.denomCt.reduce((a, b) => a + b, 0), 0);
    expect(totalDenom).toBeGreaterThan(0);
    const totalVis = fields.reduce((s, f) => s + f.fields.tPres.reduce((a, row) => a + row.reduce((x, y) => x + y, 0), 0), 0);
    expect(totalVis).toBeGreaterThan(0);
  });

  it("aggregateRadarFields 是逐元素加法（联赛基线 = 各贡献之和）", () => {
    const grid = buildRadarFieldGrid("de_ancient")!;
    const fields = buildMatchRadarField(pkg, { matchId: "m", grid, bvh: null });
    const league = aggregateRadarFields(fields, { kind: "league", team: null })!;
    expect(league.scope.kind).toBe("league");

    // 抽查某秒某格：聚合 = 两份之和。
    const s = 20;
    const g = Math.floor(grid.cells.length / 2);
    const expected = fields[0]!.fields.ctVis[s]![g]! + fields[1]!.fields.ctVis[s]![g]!;
    expect(league.fields.ctVis[s]![g]!).toBe(expected);
    expect(league.denomCt[s]!).toBe(fields[0]!.denomCt[s]! + fields[1]!.denomCt[s]!);
  });
});
