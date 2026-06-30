import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RadarField, RadarFieldBase } from "@cs2dak/contract";
import { RadarFieldCanvas } from "./RadarFieldCanvas";

const maxSec = 115;
const rows = Array.from({ length: maxSec }, () => new Int32Array([0]));
const fields: Record<RadarFieldBase, Int32Array[]> = {
  ctVis: rows,
  tVis: rows,
  ctPres: rows,
  tPres: rows,
};

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
  it("renders 4x playback and weak-zone controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(RadarFieldCanvas, {
        field,
        map: { name: "de_mirage", radarImageUrl: "./maps/radars/de_mirage.png" },
      }),
    );
    expect(html).toContain("薄弱区");
    expect(html).toContain("4x · 0-114s");
    expect(html).toContain("赛事地图基线");
  });
});
