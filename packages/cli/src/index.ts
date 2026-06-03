#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, parse } from "node:path";
import { analyzeDemoPackage, buildDemoViewModel, loadDemoPackageFromZip } from "@cs2dak/core";
import { buildSeasonCohort, type PlayerIdentityMap } from "@cs2dak/cohort";

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2);
  if (!inputPath || (command !== "analyze" && command !== "cohort")) {
    printUsage();
    process.exit(command ? 1 : 0);
  }

  if (command === "cohort") {
    await runCohort(inputPath, rest);
    return;
  }

  await runAnalyze(inputPath, rest);
}

async function runAnalyze(inputPath: string, rest: string[]) {
  const outIndex = rest.indexOf("--out");
  const outDir = outIndex >= 0 ? rest[outIndex + 1] : "fixtures/output/latest";
  if (!outDir) {
    throw new Error("--out requires a directory path");
  }

  const input = await readInput(inputPath);
  const bundle = analyzeDemoPackage(input);
  const viewModel = buildDemoViewModel(bundle);

  await mkdir(outDir, { recursive: true });
  await writeJson(join(outDir, "analysis-bundle.json"), bundle);
  await writeJson(join(outDir, "view-model.json"), viewModel);
  await writeJson(join(outDir, "qa-report.json"), bundle.qa);

  console.log(`Wrote analysis artifacts to ${outDir}`);
}

async function runCohort(inputPath: string, rest: string[]) {
  const outIndex = rest.indexOf("--out");
  const outPath = outIndex >= 0 ? rest[outIndex + 1] : "fixtures/output/season-cohort/season-cohort.json";
  if (!outPath) {
    throw new Error("--out requires a JSON file path");
  }
  const identityMapIndex = rest.indexOf("--identity-map");
  const identityMapPath = identityMapIndex >= 0 ? rest[identityMapIndex + 1] : undefined;
  if (identityMapIndex >= 0 && !identityMapPath) {
    throw new Error("--identity-map requires a JSON file path");
  }

  const zipNames = (await readdir(inputPath)).filter((name) => extname(name).toLowerCase() === ".zip").sort();
  if (zipNames.length === 0) {
    throw new Error(`No .zip files found in ${inputPath}`);
  }

  const demos = await Promise.all(
    zipNames.map(async (name) => ({
      matchId: parse(name).name,
      pkg: await loadDemoPackageFromZip(await readFile(join(inputPath, name)))
    }))
  );
  const identityMap = identityMapPath ? await readIdentityMap(identityMapPath) : undefined;
  const bundle = buildSeasonCohort(demos, { identityMap });

  await mkdir(dirname(outPath), { recursive: true });
  await writeJson(outPath, bundle);

  console.log(`Wrote season cohort for ${zipNames.length} matches to ${outPath}`);
}

async function readIdentityMap(path: string): Promise<PlayerIdentityMap> {
  return JSON.parse((await readFile(path)).toString("utf-8")) as PlayerIdentityMap;
}

async function readInput(path: string): Promise<unknown> {
  const bytes = await readFile(path);
  if (extname(path).toLowerCase() === ".zip") {
    return loadDemoPackageFromZip(bytes);
  }
  // NaN 在 CS2 导出数据中合法存在，JSON.parse 会抛错，需先替换为 null
  return JSON.parse(bytes.toString("utf-8").replace(/\bNaN\b/g, "null"));
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function printUsage() {
  console.log("Usage:");
  console.log("  cs2dak analyze <package.json|package.zip> --out <output-dir>");
  console.log("  cs2dak cohort <zip-dir> --out <season-cohort.json> [--identity-map <identity-map.json>]");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
