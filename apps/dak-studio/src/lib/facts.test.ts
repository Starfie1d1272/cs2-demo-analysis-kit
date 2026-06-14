import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import {
  buildPlayerMechanicsProfile,
  buildPlayerMechanicsProfileFromRows
} from "@cs2dak/presentation";
import { createFactsStore, extractMatchFacts } from "./facts";
import { createIdbAdapter } from "./storage/idb-adapter";

async function loadFixture() {
  const zip = await readFile(
    fileURLToPath(new URL("../../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url))
  );
  return loadDemoPackageFromZip(zip);
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
});
