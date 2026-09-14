import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rivalHubEventsResponseSchema } from "./rivalhub-contract";

describe("rivalhub-dak-events/1 fixture", () => {
  it("is accepted by DAK's response schema", () => {
    const fixture = JSON.parse(readFileSync(resolve(process.cwd(), "fixtures/contracts/rivalhub-dak-events-1.json"), "utf8"));
    expect(rivalHubEventsResponseSchema.parse(fixture)).toEqual(fixture);
  });

  it("accepts historical event data without a projected MatchRoster lineup", () => {
    const fixture = JSON.parse(readFileSync(resolve(process.cwd(), "fixtures/contracts/rivalhub-dak-events-1.json"), "utf8")) as {
      events: Array<{ series: Array<{ maps: Array<Record<string, unknown>> }> }>;
    };
    for (const event of fixture.events) {
      for (const series of event.series) {
        for (const map of series.maps) delete map.lineup;
      }
    }
    expect(() => rivalHubEventsResponseSchema.parse(fixture)).not.toThrow();
  });
});
