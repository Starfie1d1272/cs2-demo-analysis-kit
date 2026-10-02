import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRivalHubClient } from "./client";
import { rivalHubEventsResponseSchema } from "./contract";
import { uploadCandidates } from "./pipeline";

function fixture(name: string) {
  return JSON.parse(readFileSync(`fixtures/contracts/${name}.json`, "utf8"));
}

describe("series disposition compatibility", () => {
  it.each(["rivalhub-dak-events-1", "rivalhub-dak-events-1-disposition"])("reads %s through the opt-in client", async (name) => {
    const response = fixture(name);
    const requests: Array<{ path: string; method: string }> = [];
    const events = await createRivalHubClient(async <T,>(path: string, method: string): Promise<T> => {
      requests.push({ path, method });
      return response as T;
    }).events();
    expect(requests).toEqual([{ path: "/events?seriesDisposition=1", method: "GET" }]);
    expect(events).toEqual(response);
    if (name === "rivalhub-dak-events-1") {
      expect(events.events[0]!.series[0]).not.toHaveProperty("isForfeit");
    }
  });

  it("does not invent Demo targets for a canonical 0:2 forfeit without maps", () => {
    const response = rivalHubEventsResponseSchema.parse(fixture("rivalhub-dak-events-1-disposition"));
    const forfeit = response.events[0]!.series[1]!;
    expect(forfeit).toMatchObject({ isForfeit: true, status: "finished", scoreA: 0, scoreB: 2, maps: [], veto: null });
    expect(uploadCandidates(response).some((candidate) => candidate.series.id === forfeit.id)).toBe(false);
  });

  it("preserves actual map evidence when a series is forfeited after play", () => {
    const response = rivalHubEventsResponseSchema.parse(fixture("rivalhub-dak-events-1-disposition"));
    const played = response.events[0]!.series[0]!;
    played.isForfeit = true;
    expect(uploadCandidates(response).filter((candidate) => candidate.series.id === played.id).map((candidate) => candidate.map)).toEqual(played.maps);
  });
});
