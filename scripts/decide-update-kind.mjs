#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const policy = JSON.parse(readFileSync("release-update-policy.json", "utf8"));
const base = process.argv[2] || "HEAD~1";
const head = process.argv[3] || "HEAD";

function changedFiles() {
  return execFileSync("git", ["diff", "--name-only", `${base}..${head}`], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function globToRe(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "\0")
    .replaceAll("*", "[^/]*")
    .replaceAll("\0", ".*");
  return new RegExp(`^${escaped}$`);
}

const web = policy.webPatch.map(globToRe);
const runtime = policy.runtime.map(globToRe);
const ignored = (policy.ignored ?? []).map(globToRe);
const files = changedFiles();
let kind = "web";
for (const file of files) {
  if (ignored.some((re) => re.test(file))) continue;
  if (runtime.some((re) => re.test(file))) {
    kind = "runtime";
    break;
  }
  if (!web.some((re) => re.test(file))) {
    kind = "runtime";
    break;
  }
}
console.log(kind);
console.error(files.length ? files.join("\n") : "(no changes)");
