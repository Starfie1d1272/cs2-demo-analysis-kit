#!/usr/bin/env node
// Single source of truth for the project version is the git tag (vX.Y.Z).
// This script propagates that version into every package.json + the Python
// package so nothing drifts. Run it as part of the release / packaging flow.
//
//   node scripts/sync-version.mjs            # derive from latest git tag
//   node scripts/sync-version.mjs 0.3.0      # set an explicit version
//
// It only rewrites the version field; it does not create commits or tags.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveVersion() {
  const explicit = process.argv[2];
  if (explicit) return explicit.replace(/^v/, "");
  const tag = execSync("git describe --tags --abbrev=0", { cwd: repoRoot })
    .toString()
    .trim();
  return tag.replace(/^v/, "");
}

function workspacePackageJsons() {
  const out = ["package.json"];
  for (const group of ["packages", "apps"]) {
    const base = join(repoRoot, group);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const pkg = join(group, name, "package.json");
      if (existsSync(join(repoRoot, pkg))) out.push(pkg);
    }
  }
  return out;
}

const version = resolveVersion();
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Refusing to sync to a non-semver version: "${version}"`);
  process.exit(1);
}

let changed = 0;
for (const rel of workspacePackageJsons()) {
  const path = join(repoRoot, rel);
  const json = JSON.parse(readFileSync(path, "utf8"));
  if (json.version === version) continue;
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`  ${rel} -> ${version}`);
  changed++;
}

// Python package (path moves under any future rename; keep this list in sync).
const pyTargets = [
  ["python/src/cs2_demo_exporter/__init__.py", /__version__\s*=\s*"[^"]*"/, `__version__ = "${version}"`],
  ["python/pyproject.toml", /^version\s*=\s*"[^"]*"/m, `version = "${version}"`],
];
for (const [rel, re, replacement] of pyTargets) {
  const path = join(repoRoot, rel);
  if (!existsSync(path)) continue;
  const src = readFileSync(path, "utf8");
  const next = src.replace(re, replacement);
  if (next !== src) {
    writeFileSync(path, next);
    console.log(`  ${rel} -> ${version}`);
    changed++;
  }
}

console.log(`Synced ${changed} file(s) to v${version}.`);
