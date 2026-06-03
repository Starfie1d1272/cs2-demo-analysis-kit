import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlayerScoreboardRow } from "@cs2dak/contract";
import { ScoreboardTable } from "./ScoreboardTable";

// The component only reads a handful of fields; cast a minimal fixture rather
// than reconstruct the full (large) scoreboard schema.
const rows = [
  {
    steamId64: "76561198000000001",
    name: "Alice",
    teamKey: "teamA",
    accountRR: 1.234,
    rr: 1.1,
    kills: 20,
    deaths: 14,
    assists: 5,
    adr: 88.5,
    kast: 72,
    headshotPercent: 55,
    entryKills: 4,
    tradeKills: 3,
    awpKills: 2,
    utilityDamage: 120,
  },
] as unknown as PlayerScoreboardRow[];

describe("ScoreboardTable", () => {
  it("renders plain rows when no onPlayerClick is given", () => {
    const html = renderToStaticMarkup(React.createElement(ScoreboardTable, { rows }));
    expect(html).toContain("Alice");
    expect(html).not.toContain("dak-row-clickable");
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain("tabindex");
  });

  it("marks rows interactive when onPlayerClick is provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(ScoreboardTable, { rows, onPlayerClick: () => {} }),
    );
    expect(html).toContain("dak-row-clickable");
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("查看 Alice 详情");
  });
});
