import { describe, expect, it } from "vitest";
import { renderReviewReport, type MapEvidence } from "./derive-default-positions.js";

describe("derive-default-positions review report", () => {
  it("renders readable anchor evidence and callout adjacency", () => {
    const mirage: MapEvidence = {
      occupancy: new Map([
        ["PalaceAlley", { t: 10, ct: 1 }],
        ["TRamp", { t: 8, ct: 0 }],
        ["BombsiteA", { t: 1, ct: 9 }],
      ]),
      phaseOccupancy: {
        s0_10: new Map([["PalaceAlley", { t: 3, ct: 0 }]]),
        s10_20: new Map([["PalaceAlley", { t: 4, ct: 1 }]]),
        s20_30: new Map([["PalaceAlley", { t: 3, ct: 0 }]]),
      },
      transitions: new Map([
        ["PalaceAlley\tTRamp", { t: 7, ct: 0 }],
        ["TRamp\tBombsiteA", { t: 3, ct: 0 }],
      ]),
      dwell: new Map([
        [
          "PalaceAlley",
          {
            t: {
              visits: 2,
              totalSeconds: 12,
              maxContinuousSeconds: 8,
              segments5: 1,
              segments10: 0,
              playerRounds: 2,
              playerRounds5: 1,
              playerRounds10: 0,
              rounds: 1,
              rounds5: 1,
              rounds10: 0,
            },
            ct: {
              visits: 1,
              totalSeconds: 1,
              maxContinuousSeconds: 1,
              segments5: 0,
              segments10: 0,
              playerRounds: 1,
              playerRounds5: 0,
              playerRounds10: 0,
              rounds: 1,
              rounds5: 0,
              rounds10: 0,
            },
          },
        ],
      ]),
      zipCount: 1,
      roundCount: 1,
      playerRoundCount: { t: 5, ct: 5 },
    };

    const report = renderReviewReport(new Map([["de_mirage", mirage]]), 1);

    expect(report).toContain("# Default Positions Review");
    expect(report).toContain("## de_mirage");
    expect(report).toContain("### 当前 runtime 默认位（最终确认版）");
    expect(report).toContain("#### T 默认位");
    expect(report).toContain("A1");
    expect(report).toContain("PalaceAlley / A1: T=10, CT=1, T占比=90.9%, 倾向=T");
    expect(report).toContain("T分段=3/4/3");
    expect(report).toContain("≥5s=1 PR (20.0%), 1 R (100.0%)");
    expect(report).toContain("### 数据证据：持续驻留");
    expect(report).toContain("平均单段=6.0s");
    expect(report).toContain("### 默认位候选（未纳入 runtime）");
    expect(report).toContain("### 基础 Callout 倾向覆盖");
    expect(report).toContain("Connector / 拱门: a → mid");
    expect(report).not.toContain("争夺区属性");
    expect(report).not.toContain("contested");
    expect(report).toContain("### 相邻证据");
    expect(report).toContain("PalaceAlley / A1 -> TRamp / A1: T=7, CT=0, T占比=100.0%, 倾向=T");
  });
});
