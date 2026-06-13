import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyzeDemoPackage, loadDemoPackageFromZip } from "@cs2dak/core";
import { buildDemoViewModel, buildMatchWorkspaceModel } from "./index";

describe("@cs2dak/presentation", () => {
  it("builds view and workspace models from canonical core analysis", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const view = buildDemoViewModel(analyzeDemoPackage(pkg));
    const workspace = buildMatchWorkspaceModel(pkg);

    expect(view.scoreline).toBe("13:10");
    expect(workspace.title).toBe("Team Spirit vs Team Falcons");
    expect(workspace.rounds).toHaveLength(23);
    expect(workspace.replay.available).toBe(true);
  });

  it("uses round-persistent loadout facts for replay weapons and utility", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const workspace = buildMatchWorkspaceModel(pkg);
    const economy = pkg.playerEconomies.find((row) => row.roundNumber === 2 && row.primaryWeapon && row.grenadeCount > 0);
    expect(economy).toBeTruthy();

    const sourcePlayer = pkg.players[economy!.playerIndex];
    const replayRound = workspace.replay.rounds.find((row) => row.roundNumber === economy!.roundNumber);
    const replayPlayer = replayRound?.players.find((player) => player.steamId64 === sourcePlayer?.steamId64);

    expect(replayPlayer?.loadout.primaryWeapon).toBe(economy!.primaryWeapon);
    expect(replayPlayer?.loadout.secondaryWeapon).toBe(economy!.secondaryWeapon);
    expect(replayPlayer?.loadout.grenadeCount).toBe(economy!.grenadeCount);
  });

  it("uses next round start tick as replay target end when available", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const workspace = buildMatchWorkspaceModel(pkg);
    const firstReplayRound = workspace.replay.rounds[0]!;
    const firstPackageRound = pkg.rounds.find((round) => round.roundNumber === firstReplayRound.roundNumber)!;
    const nextPackageRound = pkg.rounds
      .filter((round) => round.startTick > firstPackageRound.startTick)
      .sort((a, b) => a.startTick - b.startTick)[0]!;

    expect(firstReplayRound.targetEndTick).toBe(nextPackageRound.startTick);
  });
});
