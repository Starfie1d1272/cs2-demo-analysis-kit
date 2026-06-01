#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { analyzeDemoPackage, buildDemoViewModel, loadDemoPackageFromZip } from "@cs2dak/core";

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2);
  if (command !== "analyze" || !inputPath) {
    printUsage();
    process.exit(command ? 1 : 0);
  }

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

async function readInput(path: string): Promise<unknown> {
  const bytes = await readFile(path);
  if (extname(path).toLowerCase() === ".zip") {
    return loadDemoPackageFromZip(bytes);
  }
  return JSON.parse(bytes.toString("utf-8"));
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function printUsage() {
  console.log("Usage: cs2dak analyze <package.json|package.zip> --out <output-dir>");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
