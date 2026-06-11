/**
 * CLI cohort 集成测试：tsx 子进程冷启动 + 完整 ZIP 加载流程。
 * 属于慢测试（~14s），已从默认 pnpm test 排除，仅在 pnpm test:integration / CI integration job 运行。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
const COHORT_DIR = resolve(__dirname, "../../../fixtures/input/cohort");

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
  tmpDir = await mkdtemp(join(tmpdir(), "cs2dak-cli-integration-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("cs2dak cohort (integration)", () => {
  it("writes a season cohort JSON from a directory of ZIPs", async () => {
    const outPath = join(tmpDir, "season-cohort.json");
    const result = await runCli("cohort", COHORT_DIR, "--out", outPath);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(outPath);

    expect(existsSync(outPath)).toBe(true);

    const cohort = JSON.parse(await readFile(outPath, "utf-8"));
    expect(cohort.players).toBeDefined();
    expect(cohort.players.length).toBeGreaterThan(0);
  }, 60_000);
});
