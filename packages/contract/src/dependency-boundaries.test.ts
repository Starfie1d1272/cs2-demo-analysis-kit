import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readPackageJson(relativePath: string) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

describe("package dependency boundaries", () => {
  it("keeps shared contract dependencies on the current upstream versions", () => {
    const root = readPackageJson("../../../package.json");
    const contract = readPackageJson("../package.json");

    expect(contract.dependencies?.["cs2-demo-format"]).toBe("^3.1.0");
    expect(contract.dependencies?.["@rivalhub/rival-rating"]).toBe(root.dependencies?.["@rivalhub/rival-rating"]);
  });

  it("declares runtime workspace imports as dependencies, not dev-only edges", () => {
    const presentation = readPackageJson("../../presentation/package.json");

    expect(presentation.dependencies?.["@cs2dak/cohort"]).toBe("workspace:*");
    expect(presentation.devDependencies?.["@cs2dak/cohort"]).toBeUndefined();
  });
});
