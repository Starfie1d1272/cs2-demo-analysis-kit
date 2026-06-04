import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SeasonLeaderboardModel } from "@cs2dak/contract";
import { SeasonLeaderboard } from "./SeasonLeaderboard";

// 组件只读 views + rows.metrics/name/playerKey；用最小 fixture 而非重建完整 schema。
const model = {
  version: "cs2-demo-analysis-kit/leaderboard-0.1",
  weightsVersion: "test",
  matchCount: 1,
  provenance: { cohortVersion: "cs2-demo-analysis-kit/cohort-1.0", sourceSchemaVersion: "cs2-demo-format/2.0", matches: [] },
  views: [
    {
      key: "core",
      label: "Core",
      defaultSort: "rivalhubRR",
      columns: [
        { key: "rivalhubRR", label: "RR", format: "rating", description: null },
        { key: "hsPercent", label: "HS%", format: "percent", description: null },
        { key: "kd", label: "K/D", format: "ratio", description: null }
      ]
    }
  ],
  rows: [
    { playerKey: "steam:1", name: "Alice", steamIds: ["1"], externalUserId: null, teamKeys: [], mapCount: 1, confidence: 0.5, prism: null, metrics: { rivalhubRR: 1.234, hsPercent: 55.5, kd: 1.4 } },
    { playerKey: "steam:2", name: "Bob", steamIds: ["2"], externalUserId: null, teamKeys: [], mapCount: 1, confidence: 0.5, prism: null, metrics: { rivalhubRR: 0.9, hsPercent: 48, kd: null } }
  ]
} as unknown as SeasonLeaderboardModel;

describe("SeasonLeaderboard", () => {
  it("formats metrics per column format and renders null as —", () => {
    const html = renderToStaticMarkup(React.createElement(SeasonLeaderboard, { model }));
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("1.23"); // rating: 2 位小数
    expect(html).toContain("55.5%"); // percent: 0–100 + %
    expect(html).toContain("—"); // Bob 的 K/D 为 null
  });

  it("sorts by the default sort column descending, nulls last", () => {
    const html = renderToStaticMarkup(React.createElement(SeasonLeaderboard, { model }));
    // 默认按 rivalhubRR 降序：Alice(1.234) 在 Bob(0.9) 前
    expect(html.indexOf("Alice")).toBeLessThan(html.indexOf("Bob"));
  });

  it("marks rows interactive when onPlayerClick is provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(SeasonLeaderboard, { model, onPlayerClick: () => {} })
    );
    expect(html).toContain("dak-row-clickable");
    expect(html).toContain('role="button"');
    expect(html).toContain("查看 Alice 详情");
  });
});
