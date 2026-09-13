import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rivalHubEventsResponseSchema } from "./rivalhub-contract";

describe("rivalhub-dak-events/1 fixture", () => {
  it("is accepted by DAK's response schema", () => {
    const fixture = JSON.parse(readFileSync(resolve(process.cwd(), "fixtures/contracts/rivalhub-dak-events-1.json"), "utf8"));
    expect(rivalHubEventsResponseSchema.parse(fixture)).toEqual(fixture);
  });
});
