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

    expect(view.scoreline).toBe("13:8");
    expect(workspace.title).toBe("Team A vs Team B");
    expect(workspace.rounds).toHaveLength(21);
    expect(workspace.replay.available).toBe(true);
  });
});
