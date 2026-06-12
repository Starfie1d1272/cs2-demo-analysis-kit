import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import { mvpRecommendationSchema, seriesSummarySchema } from "@cs2dak/contract";
import { buildMatchWorkspaceModel, buildSeriesSummary, recommendMatchMvp } from "./index";

async function buildWorkspace() {
  const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url)));
  return buildMatchWorkspaceModel(await loadDemoPackageFromZip(zip));
}

describe("recommendMatchMvp", () => {
  it("ranks candidates from accountRR, HLTV Rating 2.0 and confidence", async () => {
    const model = await buildWorkspace();
    const recommendation = recommendMatchMvp(model);

    expect(() => mvpRecommendationSchema.parse(recommendation)).not.toThrow();
    expect(recommendation.candidates.length).toBeGreaterThan(0);
    expect(recommendation.recommended.playerKey).toBe(recommendation.candidates[0]?.playerKey);
    expect(recommendation.candidates.map((row) => row.recommendationScore)).toEqual(
      [...recommendation.candidates.map((row) => row.recommendationScore)].sort((a, b) => b - a)
    );
    expect(recommendation.recommended.explanation).toHaveLength(3);
    expect(recommendation).not.toHaveProperty("winnerUserId");
  });
});

describe("buildSeriesSummary", () => {
  it("aggregates counts and round-weighted rates across maps", async () => {
    const model = await buildWorkspace();
    const summary = buildSeriesSummary([
      { matchId: "map-1", model },
      { matchId: "map-2", model }
    ]);

    expect(() => seriesSummarySchema.parse(summary)).not.toThrow();
    expect(summary.mapCount).toBe(2);
    expect(summary.maps).toHaveLength(2);
    expect(summary.scoreboard).toHaveLength(model.scoreboard.length);
    expect(summary.mvpCandidates.length).toBeGreaterThan(0);

    const source = model.scoreboard[0]!;
    const aggregate = summary.scoreboard.find((row) => row.playerKey === source.steamId64)!;
    expect(aggregate.mapCount).toBe(2);
    expect(aggregate.kills).toBe(source.kills * 2);
    expect(aggregate.deaths).toBe(source.deaths * 2);
    expect(aggregate.adr).toBe(source.adr);
    expect(aggregate.kast).toBe(source.kast);
    expect(aggregate.perMap).toHaveLength(2);
  });

  it("rejects an empty series", () => {
    expect(() => buildSeriesSummary([])).toThrow(/at least one/);
  });

  it("accepts an external team map instead of owning team identity", async () => {
    const model = await buildWorkspace();
    const renamed = {
      ...model,
      teams: {
        teamA: { ...model.teams.teamA, name: "Alias A" },
        teamB: { ...model.teams.teamB, name: "Alias B" }
      }
    };
    const summary = buildSeriesSummary(
      [{ matchId: "map-1", model }, { matchId: "map-2", model: renamed }],
      {
        teamMap: {
          "map-1:teamA": { teamKey: "team-alpha", name: "Team Alpha" },
          "map-2:teamA": { teamKey: "team-alpha", name: "Team Alpha" },
          "map-1:teamB": { teamKey: "team-beta", name: "Team Beta" },
          "map-2:teamB": { teamKey: "team-beta", name: "Team Beta" }
        }
      }
    );

    expect(summary.teams.map((team) => team.teamKey).sort()).toEqual(["team-alpha", "team-beta"]);
    expect(summary.scoreboard.every((row) => ["Team Alpha", "Team Beta"].includes(row.teamName))).toBe(true);
  });
});
