import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryUrl = "https://github.com/Starfie1d1272/cs2-demo-analysis-kit.git";
const workflowPath = join(repoRoot, ".github", "workflows", "npm-publish.yml");
const releaseDocsPath = join(repoRoot, "docs", "release.md");
const publicPackages = [
  ["@cs2dak/cohort", "packages/cohort"],
  ["@cs2dak/contract", "packages/contract"],
  ["@cs2dak/core", "packages/core"],
  ["@cs2dak/maps", "packages/maps"],
  ["@cs2dak/presentation", "packages/presentation"],
  ["@cs2dak/react", "packages/react"],
  ["@cs2dak/tournament", "packages/tournament"],
];

const errors = [];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

for (const [expectedName, directory] of publicPackages) {
  const manifestPath = join(repoRoot, directory, "package.json");
  const manifest = readJson(manifestPath);
  const repository = manifest.repository ?? {};

  check(manifest.name === expectedName, `${directory}: package name must be ${expectedName}`);
  check(manifest.private !== true, `${expectedName}: public package must not be private`);
  check(manifest.publishConfig?.access === "public", `${expectedName}: publishConfig.access must be public`);
  check(repository.type === "git", `${expectedName}: repository.type must be git`);
  check(repository.url === repositoryUrl, `${expectedName}: repository.url must be ${repositoryUrl}`);
  check(
    repository.directory === directory,
    `${expectedName}: repository.directory must be ${directory}`,
  );
}

const workspacePackageDirectories = readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const expectedPublicDirectories = new Set(publicPackages.map(([, directory]) => directory));

for (const directoryName of workspacePackageDirectories) {
  const directory = `packages/${directoryName}`;
  const manifest = readJson(join(repoRoot, directory, "package.json"));
  const isPublic = manifest.private !== true && manifest.publishConfig?.access === "public";
  if (isPublic) check(expectedPublicDirectories.has(directory), `${directory}: public package is missing from the allowlist`);
}

const cli = readJson(join(repoRoot, "packages", "cli", "package.json"));
check(cli.private === true, "packages/cli: @cs2dak/cli must remain private");
check(cli.publishConfig == null, "packages/cli: private CLI must not gain publishConfig");

const workflow = readFileSync(workflowPath, "utf8");
const workflowEventLines = workflow.split(/\r?\n/);
const onLine = workflowEventLines.findIndex((line) => /^on:\s*$/.test(line));
const eventKeys = [];
if (onLine >= 0) {
  for (const line of workflowEventLines.slice(onLine + 1)) {
    if (/^\S/.test(line) && line.trim() !== "") break;
    const match = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/);
    if (match) eventKeys.push(match[1]);
  }
}

check(onLine >= 0, "npm-publish.yml: workflow must define on.workflow_dispatch");
check(eventKeys.length === 1 && eventKeys[0] === "workflow_dispatch", "npm-publish.yml: only workflow_dispatch may trigger publishing");
check(/^\s+contents:\s+write\s*$/m.test(workflow), "npm-publish.yml: publish job needs contents: write");
check(/^\s+id-token:\s+write\s*$/m.test(workflow), "npm-publish.yml: publish job needs id-token: write");
check(/^\s+environment:\s+npm-publish\s*$/m.test(workflow), "npm-publish.yml: publish job must use npm-publish environment");
check(/runs-on:\s*ubuntu-latest/.test(workflow), "npm-publish.yml: publishing must use ubuntu-latest");
check(/fetch-depth:\s*0/.test(workflow), "npm-publish.yml: checkout must use fetch-depth: 0");
check(/pnpm install --frozen-lockfile/.test(workflow), "npm-publish.yml: install must be frozen");
check(/pnpm build/.test(workflow), "npm-publish.yml: build gate is missing");
check(/pnpm test:all/.test(workflow), "npm-publish.yml: test:all gate is missing");
check(/pnpm typecheck/.test(workflow), "npm-publish.yml: typecheck gate is missing");
check(/changeset publish --no-git-tag/.test(workflow), "npm-publish.yml: publish must disable Changesets local tag creation");
check(/reconcile-npm-publish\.mjs/.test(workflow), "npm-publish.yml: npm/tag reconciliation step is missing");
check(/github\.ref\s*==\s*['"]refs\/heads\/main['"]/.test(workflow), "npm-publish.yml: publishing must be guarded to main");
check(workflow.includes("github.repository == 'Starfie1d1272/cs2-demo-analysis-kit'"), "npm-publish.yml: publishing must be guarded to the canonical repository");

for (const forbidden of ["NPM_TOKEN", "NODE_AUTH_TOKEN", "npm login", "npm whoami"]) {
  check(!workflow.toLowerCase().includes(forbidden.toLowerCase()), `npm-publish.yml: forbidden token/auth reference ${forbidden}`);
}

for (const actionRef of [
  "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
  "pnpm/action-setup@f520eceda224fe1a4aed5a2a27a194379a409996",
  "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
]) {
  check(workflow.includes(actionRef), `npm-publish.yml: expected pinned action ${actionRef}`);
}

const releaseDocs = readFileSync(releaseDocsPath, "utf8");
for (const required of [
  "npm-publish.yml",
  "Trusted Publishing",
  "pnpm exec changeset publish --no-git-tag",
  "本地 `pnpm release:npm`",
  "npm login",
]) {
  check(releaseDocs.includes(required), `docs/release.md: missing ${required}`);
}
check(
  !releaseDocs.includes("需要有效的 npm Automation/Granular Access Token"),
  "docs/release.md: active release path still requires a legacy npm token",
);

if (errors.length > 0) {
  console.error("npm publish policy check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`npm publish policy OK: ${publicPackages.length} public packages, private @cs2dak/cli excluded`);
}
