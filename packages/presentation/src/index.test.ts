import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyzeDemoPackage, loadDemoPackageFromZip } from "@cs2dak/core";
import { buildDemoViewModel, buildMatchWorkspaceModel } from "./index";

describe("@cs2dak/presentation", () => {
  it("builds view and workspace models from canonical core analysis", async () => {
    const zip = await readFile(fileURLToPath(new URL("../../../fixtures/input/cs2dak-sanitized-de_ancient.zip", import.meta.url)));
    const pkg = await loadDemoPackageFromZip(zip);
    const view = buildDemoViewModel(analyzeDemoPackage(pkg));
    const workspace = buildMatchWorkspaceModel(pkg);

    expect(view.scoreline).toBe("2:13");
    expect(workspace.title).toBe("Team Liquid vs FlyQuest");
    expect(workspace.rounds).toHaveLength(15);
    expect(workspace.replay.available).toBe(true);
  });
});
