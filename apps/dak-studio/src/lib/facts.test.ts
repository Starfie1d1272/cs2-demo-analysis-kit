import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import { buildSeasonCohort, buildSeasonCohortFromRows } from "@cs2dak/cohort";
import {
  buildPlayerMechanicsProfile,
  buildPlayerMechanicsProfileFromRows,
  buildPlayerSeasonInsights,
  buildPlayerWeaponStats
} from "@cs2dak/presentation";
import { buildPlayerSeasonDetailsFromFacts, createFactsStore, extractMatchFacts } from "./facts";
import { createIdbAdapter } from "./storage/idb-adapter";

async function loadFixture() {
  const zip = await readFile(
    fileURLToPath(new URL("../../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url))
  );
  return loadDemoPackageFromZip(zip);
}

function stableNumbers<T>(value: T): T {
  if (typeof value === "number") return Number(value.toFixed(12)) as T;
  if (Array.isArray(value)) return value.map(stableNumbers) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, stableNumbers(entry)])
    ) as T;
  }
  return value;
}

describe("MatchFacts", () => {
  it("projects persisted mechanics facts to the same profile as the existing package path", async () => {
    const pkg = await loadFixture();
    const matchId = "m1";
    const facts = extractMatchFacts(pkg, { matchId });
    const store = createFactsStore(createIdbAdapter(), "facts-equivalence");
    await store.putMatchFacts(facts);

    const steamId64 = pkg.players[pkg.playerStats[0]!.playerIndex]!.steamId64;
    const playerKey = `steam:${steamId64}`;
    const projected = await store.getMechanicsRows({
      playerKeys: [playerKey],
      matchIds: [matchId]
    });

    const fromFacts = buildPlayerMechanicsProfileFromRows(
      projected.map((match) => match.rows),
      [steamId64],
      projected.length
    );
    const fromPackages = buildPlayerMechanicsProfile([{ matchId, pkg }], [steamId64]);

    expect(projected).toHaveLength(1);
    expect(fromFacts).toEqual(fromPackages);
  });

  it("projects persisted facts to the same player details as the existing package path", async () => {
    const pkg = await loadFixture();
    const matchId = "m1";
    const facts = extractMatchFacts(pkg, { matchId });
    const store = createFactsStore(createIdbAdapter(), "facts-details-equivalence");
    await store.putMatchFacts(facts);

    const steamId64 = pkg.players[pkg.playerStats[0]!.playerIndex]!.steamId64;
    const details = await buildPlayerSeasonDetailsFromFacts(store, {
      steamIds: [steamId64],
      matchIds: [matchId]
    });

    expect(details).toEqual({
      insights: buildPlayerSeasonInsights([{ matchId, pkg }], [steamId64]),
      weaponStats: buildPlayerWeaponStats([{ matchId, pkg }], [steamId64]),
      mechanics: buildPlayerMechanicsProfile([{ matchId, pkg }], [steamId64])
    });
  });

  it("projects persisted cohort rows to the same season cohort as the existing package path", async () => {
    const pkg = await loadFixture();
    const matchId = "m1";
    const store = createFactsStore(createIdbAdapter(), "facts-cohort-equivalence");
    await store.putMatchFacts(extractMatchFacts(pkg, { matchId }));

    const rows = await store.getCohortRows({ matchIds: [matchId] });

    const fromRows = buildSeasonCohortFromRows(rows, { matchCount: 1 });
    const fromPackages = buildSeasonCohort([{ matchId, pkg }]);

    expect({ ...fromRows, players: [] }).toEqual({ ...fromPackages, players: [] });
    expect(new Map(fromRows.players.map((row) => [row.playerKey, stableNumbers(row)]))).toEqual(
      new Map(fromPackages.players.map((row) => [row.playerKey, stableNumbers(row)]))
    );
  });
});
