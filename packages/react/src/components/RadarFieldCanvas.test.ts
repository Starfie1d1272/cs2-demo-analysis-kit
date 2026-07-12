import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RadarField, RadarFieldBase } from "@cs2dak/contract";
import { RADAR_FIELD_BASES } from "@cs2dak/contract";
import { RadarFieldCanvas } from "./RadarFieldCanvas";

const maxSec = 115;
const rows = Array.from({ length: maxSec }, () => new Int32Array([0]));
const fields = Object.fromEntries(RADAR_FIELD_BASES.map((base) => [base, rows])) as Record<RadarFieldBase, Int32Array[]>;

const field: RadarField = {
  schemaVersion: 1,
  computeVersion: 1,
  mapName: "de_mirage",
  calibrationVersion: "1",
  triAvailability: "full",
  scope: { kind: "league", team: null, economy: "gun", roundCount: 12, matchIds: ["m"] },
  grid: { cellSize: 128, cells: [[0, 0, 0]] },
  maxSec,
  denomCt: new Int32Array(maxSec),
  denomT: new Int32Array(maxSec),
  fields,
};

describe("RadarFieldCanvas", () => {
  it("renders 4x playback without inventing weak-zone detection", () => {
    const html = renderToStaticMarkup(
      React.createElement(RadarFieldCanvas, {
        field,
        map: { name: "de_mirage", radarImageUrl: "./maps/radars/de_mirage.png" },
      }),
    );
    expect(html).not.toContain("薄弱区");
    expect(html).toContain("4x · 1:55-0:01");
    expect(html).toContain("冷 → 热 = 4:3 屏幕可见低 → 高");
    expect(html).toContain("赛事地图基线");
  });
});
