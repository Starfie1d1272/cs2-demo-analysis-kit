import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatchWorkspaceModel } from "@cs2dak/contract";
import { MatchWorkspace } from "./MatchWorkspace";

const model: MatchWorkspaceModel = {
  version: "cs2-demo-analysis-kit/workspace-0.1",
  sourceSchemaVersion: "cs2-demo-format/2.0",
  title: "Team A vs Team B",
  subtitle: "de_ancient · 10 名选手 · 21 回合",
  scoreline: "13:8",
  mapName: "de_ancient",
  teams: {
    teamA: { name: "Team A", score: 13 },
    teamB: { name: "Team B", score: 8 }
  },
  tabs: [
    { key: "overview", label: "总览" },
    { key: "rounds", label: "回合" },
    { key: "players", label: "选手" },
    { key: "economy", label: "经济" },
    { key: "map", label: "地图" },
    { key: "replay", label: "回放" }
  ],
  overview: {
    kpis: [
      { key: "topRR", label: "最高 V2 RR", value: "1.234", detail: "Player A" }
    ],
    story: ["Team A 与 Team B 在 de_ancient 打成 13:8。"]
  },
  scoreboard: [],
  rounds: [],
  players: [],
  economy: [],
  map: {
    view: { name: "de_ancient", radarImageUrl: "/maps/radars/de_ancient.png", calibrated: true },
    modes: [],
    points: [],
    status: { hasRadar: true, hasPositionData: false, message: "该导出包暂无可展示的位置数据" }
  },
  replay: {
    available: true,
    sampleRate: 8,
    tickrate: 64,
    rounds: [
      {
        roundNumber: 1,
        startTick: 100,
        tickStep: 8,
        frameCount: 1,
        players: [
          {
            steamId64: "76561198000000001",
            name: "Player A",
            teamKey: "teamA",
            side: "ct",
            frames: [
              { tick: 100, x: 1, y: 2, z: 3, yaw: 90, hp: 100, weapon: "ak47", alive: true, flashed: false, hasDefuseKit: true }
            ]
          }
        ]
      }
    ],
    capabilities: { hasDefuseKit: true, hasBombPosition: false }
  },
  adminQa: {
    ok: true,
    summary: { issueCount: 0, errorCount: 0, warningCount: 0 },
    issues: []
  }
};

describe("MatchWorkspace", () => {
  it("renders user-facing match workspace modules without exposing QA as a main tab", () => {
    const html = renderToStaticMarkup(React.createElement(MatchWorkspace, { model }));

    expect(html).toContain("Team A vs Team B");
    expect(html).toContain("最高 V2 RR");
    expect(html).toContain("回放");
    expect(html).toContain("8 Hz");
    expect(html).toContain("拆弹器");
    expect(html).not.toContain("QA</span>");
  });
});
