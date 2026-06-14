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
      transitions: new Map([
        ["PalaceAlley\tTRamp", { t: 7, ct: 0 }],
        ["TRamp\tBombsiteA", { t: 3, ct: 0 }],
      ]),
      zipCount: 1,
    };

    const report = renderReviewReport(new Map([["de_mirage", mirage]]), 1);

    expect(report).toContain("# Default Positions Review");
    expect(report).toContain("## de_mirage");
    expect(report).toContain("### T 默认位草案");
    expect(report).toContain("A1");
    expect(report).toContain("PalaceAlley(A1) T=10 CT=1");
    expect(report).toContain("### 相邻证据");
    expect(report).toContain("PalaceAlley(A1) -> TRamp(A1): T=7 CT=0");
  });
});
