import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const TSX = resolve(__dirname, "../../../node_modules/.bin/tsx");
const CLI = resolve(__dirname, "index.ts");
const FIXTURE_ZIP = resolve(__dirname, "../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip");

async function runCli(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return execFileAsync(TSX, [CLI, ...args], { env: { ...process.env, NODE_NO_WARNINGS: "1" } })
    .then(({ stdout, stderr }) => ({ stdout, stderr, code: 0 }))
    .catch((err: NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number }) => ({
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      code: err.code ?? 1
    }));
}

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "cs2dak-cli-test-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("cs2dak analyze", () => {
  it("writes analysis-bundle.json, view-model.json and qa-report.json from a ZIP", async () => {
    const outDir = join(tmpDir, "analyze-zip");
    const result = await runCli("analyze", FIXTURE_ZIP, "--out", outDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(outDir);

    expect(existsSync(join(outDir, "analysis-bundle.json"))).toBe(true);
    expect(existsSync(join(outDir, "view-model.json"))).toBe(true);
    expect(existsSync(join(outDir, "qa-report.json"))).toBe(true);

    const bundle = JSON.parse(await readFile(join(outDir, "analysis-bundle.json"), "utf-8"));
    expect(bundle.version).toBe("cs2-demo-analysis-kit/1.0");
    expect(bundle.provenance.sourceSchemaVersion).toBe("cs2-demo-format/3.0");
    expect(bundle.scoreboard.length).toBeGreaterThan(0);
  }, 30_000);

  it("exits 1 when --out argument is missing", async () => {
    const result = await runCli("analyze", FIXTURE_ZIP, "--out");
    expect(result.code).toBe(1);
  }, 30_000);
});

describe("cs2dak cohort", () => {
  // 慢测试 "writes a season cohort JSON from a directory of ZIPs" 已移至
  // cohort.integration.test.ts（约 14s，仅 integration job 运行）

  it("exits 1 when no ZIPs are found in the directory", async () => {
    const result = await runCli("cohort", tmpDir, "--out", join(tmpDir, "empty-cohort.json"));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/No \.zip files found/i);
  }, 30_000);
});

describe("cs2dak (usage)", () => {
  it("exits 0 and prints usage when called with no arguments", async () => {
    const result = await runCli();
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Usage/i);
  }, 30_000);

  it("exits 1 for an unknown command", async () => {
    const result = await runCli("unknown-command", FIXTURE_ZIP);
    expect(result.code).toBe(1);
  }, 30_000);
});
