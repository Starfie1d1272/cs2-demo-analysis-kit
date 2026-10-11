#!/usr/bin/env node
// Desktop release versions are canonical x.y.z. Public packages belong to
// Changesets. Prepare and validate every edit before touching any target.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function replaceExactlyOnce(source, pattern, replacement, target) {
  if ([...source.matchAll(new RegExp(pattern.source, pattern.flags.replace(/g/g, "") + "g"))].length !== 1) {
    throw new Error(`${target}: expected exactly one version field`);
  }
  return source.replace(pattern, replacement);
}

export function planVersionSync(root, version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Refusing to sync a non-canonical release version: ${version}`);
  }
  const targets = ["package.json"];
  for (const group of ["apps", "packages"]) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const rel = join(group, name, "package.json");
      if (!existsSync(join(root, rel))) continue;
      const json = JSON.parse(readFileSync(join(root, rel), "utf8"));
      if (json.private === true) targets.push(rel);
    }
  }
  const edits = [];
  function prepare(rel, rewrite) {
    const path = join(root, rel);
    const before = readFileSync(path, "utf8"); // Missing targets fail before writes.
    const after = rewrite(before);
    if (after !== before) edits.push({ rel, path, before, after });
  }
  for (const rel of targets) {
    prepare(rel, (source) => {
      const json = JSON.parse(source);
      if (typeof json.version !== "string") throw new Error(`${rel}: missing version`);
      if (json.version === version) return source;
      return JSON.stringify({ ...json, version }, null, 2) + "\n";
    });
  }
  prepare("python/src/cs2dak/__init__.py", (source) => replaceExactlyOnce(
    source, /^__version__\s*=\s*"[^"\r\n]*"/m, `__version__ = "${version}"`, "Python __init__",
  ));
  prepare("python/pyproject.toml", (source) => replaceExactlyOnce(
    source, /^\[project\]\r?\n[\s\S]*?(?=^\[|$(?![\s\S]))/m,
    (block) => replaceExactlyOnce(block, /^version\s*=\s*"[^"\r\n]*"/m, `version = "${version}"`, "Python project"),
    "Python project section",
  ));
  prepare("python/uv.lock", (source) => {
    const blocks = [...source.matchAll(/^\[\[package\]\]\r?\n[\s\S]*?(?=^\[\[package\]\]|$(?![\s\S]))/gm)];
    const matches = blocks.filter((block) => /^name\s*=\s*"cs2dak"\s*$/m.test(block[0]));
    if (matches.length !== 1) throw new Error("uv.lock: expected exactly one cs2dak package block");
    const block = matches[0];
    const next = replaceExactlyOnce(block[0], /^version\s*=\s*"[^"\r\n]*"/m, `version = "${version}"`, "uv.lock cs2dak");
    return source.slice(0, block.index) + next + source.slice(block.index + block[0].length);
  });
  return edits;
}

export function applyVersionSync(edits, write = writeFileSync) {
  const attempted = [];
  try {
    for (const edit of edits) {
      attempted.push(edit); // Include a failed write that may have partially written.
      write(edit.path, edit.after);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const edit of attempted.reverse()) {
      try { write(edit.path, edit.before); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Version sync failed; some files could not be restored");
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const supplied = process.argv[2] ?? execFileSync("git", ["describe", "--tags", "--abbrev=0"], { cwd: repoRoot, encoding: "utf8" }).trim();
    const version = supplied.replace(/^v/, "");
    const edits = planVersionSync(repoRoot, version);
    applyVersionSync(edits);
    for (const edit of edits) console.log(`  ${edit.rel} -> ${version}`);
    console.log(`Synced ${edits.length} file(s) to v${version}.`);
  } catch (error) {
    console.error(error.message);
    if (error instanceof AggregateError) {
      for (const cause of error.errors) console.error(`  Cause: ${cause.message}`);
    }
    process.exitCode = 1;
  }
}
