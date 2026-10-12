import { readFileSync, readdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const registry = "https://registry.npmjs.org";
const checkOnly = process.argv.includes("--check-only");
const releaseIndex = process.argv.indexOf("--release-commit");
const requestedRelease = releaseIndex < 0 ? null : process.argv[releaseIndex + 1];

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", allowFailure ? "ignore" : "pipe"],
    }).trim();
  } catch (error) {
    if (allowFailure) return null;
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function workspacePublicPackages() {
  const packagesRoot = join(repoRoot, "packages");
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = join("packages", entry.name);
      const manifestPath = join(repoRoot, directory, "package.json");
      const manifest = readJson(manifestPath);
      return { directory, manifest, manifestPath };
    })
    .filter(({ manifest }) => manifest.private !== true && manifest.publishConfig?.access === "public")
    .sort((a, b) => a.directory.localeCompare(b.directory));
}

function releaseTargets() {
  if (releaseIndex >= 0 && !/^[0-9a-f]{40}$/.test(requestedRelease ?? "")) {
    throw new Error("--release-commit requires a complete 40-character commit SHA");
  }
  const selection = git(["rev-parse", "--verify", `${requestedRelease ?? "HEAD"}^{commit}`]);
  if (git(["merge-base", "--is-ancestor", selection, "HEAD"], { allowFailure: true }) === null) {
    throw new Error("version selection commit must be an ancestor of the actual source checkout");
  }
  console.log(`version selection commit: ${selection}`);
  const parent = git(["rev-parse", `${selection}^`]);
  return workspacePublicPackages()
    .map(({ directory, manifest }) => {
      const relativeManifest = `${directory}/package.json`;
      const selectedText = git(["show", `${selection}:${relativeManifest}`], { allowFailure: true });
      const selected = selectedText ? JSON.parse(selectedText) : null;
      if (!selected || selected.name !== manifest.name || selected.version !== manifest.version) {
        throw new Error(`${manifest.name}: actual manifest differs from selected release version`);
      }
      const previousText = git(["show", `${parent}:${relativeManifest}`], { allowFailure: true });
      const previous = previousText ? JSON.parse(previousText) : null;
      if (previous?.version === selected.version) return null;
      return {
        directory,
        name: manifest.name,
        version: manifest.version,
        tag: `${manifest.name}@${manifest.version}`,
      };
    })
    .filter(Boolean);
}

function localTagCommit(tag) {
  return git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`], { allowFailure: true });
}

function remoteTagCommit(tag) {
  const exactRef = `refs/tags/${tag}`;
  const output = git(["ls-remote", "--tags", "origin", `${exactRef}*`], { allowFailure: true });
  if (!output) return null;

  const refs = new Map(
    output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [hash, ref] = line.split(/\s+/);
        return [ref, hash];
      }),
  );
  const peeled = refs.get(`${exactRef}^{}`);
  const direct = refs.get(exactRef);
  if (peeled) return peeled;
  if (direct) return direct;
  throw new Error(`remote has an unexpected tag ref matching ${tag}`);
}

function npmVersionExists(name, version) {
  const result = spawnSync(
    "npm",
    ["view", `${name}@${version}`, "version", "--json", `--registry=${registry}`],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (result.status !== 0) return false;
  try {
    return JSON.parse(result.stdout.trim()) === version;
  } catch {
    return false;
  }
}

function ensureTag(target, head) {
  const local = localTagCommit(target.tag);
  if (local && local !== head) {
    throw new Error(`refusing to rewrite local tag ${target.tag}: it points to ${local}, not ${head}`);
  }

  const remote = remoteTagCommit(target.tag);
  if (remote && remote !== head) {
    throw new Error(`refusing to rewrite remote tag ${target.tag}: it points to ${remote}, not ${head}`);
  }
  if (remote === head) {
    console.log(`tag already present: ${target.tag}`);
    return;
  }

  if (!local) {
    git(["tag", target.tag, head]);
    console.log(`created confirmed-publish tag: ${target.tag}`);
  }

  git(["push", "origin", `refs/tags/${target.tag}:refs/tags/${target.tag}`]);
  const pushed = remoteTagCommit(target.tag);
  if (pushed !== head) {
    throw new Error(`tag push verification failed for ${target.tag}`);
  }
  console.log(`pushed tag: ${target.tag}`);
}

function main() {
  const targets = releaseTargets();
  if (targets.length === 0) {
    throw new Error("no public package version change found in HEAD; refusing to publish or create tags");
  }

  const head = git(["rev-parse", "HEAD"]);
  console.log(`release commit: ${head}`);
  console.log("release targets:");
  for (const target of targets) console.log(`- ${target.name}@${target.version}`);

  if (checkOnly) return;

  const confirmed = [];
  const missing = [];
  for (const target of targets) {
    if (npmVersionExists(target.name, target.version)) {
      confirmed.push(target);
      console.log(`npm version confirmed: ${target.name}@${target.version}`);
    } else {
      missing.push(`${target.name}@${target.version}`);
      console.log(`npm version not visible yet: ${target.name}@${target.version}`);
    }
  }

  for (const target of confirmed) ensureTag(target, head);

  if (missing.length > 0) {
    throw new Error(`publish incomplete; no tags were created for missing versions: ${missing.join(", ")}`);
  }
  console.log(`npm publish reconciliation complete: ${confirmed.length} package tag(s) verified`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
