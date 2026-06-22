#!/usr/bin/env node
// 通用赛事批量导出：读 spec 的 export 块，按阶段展开源 glob，逐源调用 event-export.sh。
// 取代一次性的 cologne-stage{1,2}-batch.sh / cologne-stage1-reexport.sh —— 任何赛事写一个
// spec.export 即可复用，可断点续跑（已存在 ZIP 自动跳过），--reexport 先清空阶段目录再全量重导。
//
// 用法：
//   node scripts/event-export.mjs <spec.json> [--stage <Name>] [--reexport]
//   pnpm event:export scripts/cologne/cologne-major-2026.spec.json --stage Stage3
//
// spec.export 形如：
//   { "outRoot": "fixtures/demos/pro/IEM-Cologne-Major-2026",
//     "stages": [ { "stage": "Stage1", "sources": ["~/Downloads/iem-cologne-major-2026-stage-1-*.rar"] }, ... ] }
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(message);
  process.exit(2);
}

const args = process.argv.slice(2);
const specPath = args.find((a) => !a.startsWith("--"));
const reexport = args.includes("--reexport");
const stageFilter = (() => {
  const i = args.indexOf("--stage");
  return i >= 0 ? args[i + 1] : null;
})();
if (!specPath) fail("用法：node scripts/event-export.mjs <spec.json> [--stage <Name>] [--reexport]");

const spec = JSON.parse(readFileSync(resolve(specPath), "utf8"));
const exp = spec.export;
if (!exp?.outRoot || !Array.isArray(exp.stages)) {
  fail(`spec 缺少 export.outRoot / export.stages：${specPath}`);
}

const expandHome = (p) => (p.startsWith("~") ? join(homedir(), p.slice(1)) : p);
const outRootAbs = (() => {
  const r = expandHome(exp.outRoot);
  return r.startsWith("/") ? r : join(REPO, r);
})();

// 极简 glob：仅末段含 * / ?，按目录 readdir + 正则匹配。覆盖本仓库所有源命名。
function expandGlob(pattern) {
  const full = expandHome(pattern);
  const abs = full.startsWith("/") ? full : join(REPO, full);
  const dir = dirname(abs);
  const base = abs.slice(dir.length + 1);
  if (!/[*?]/.test(base)) return existsSync(abs) ? [abs] : [];
  if (!existsSync(dir)) return [];
  const rx = new RegExp(`^${base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
  return readdirSync(dir).filter((n) => rx.test(n)).sort().map((n) => join(dir, n));
}

const exportScript = join(REPO, "scripts/event-export.sh");
let totalSources = 0;
let totalFail = 0;

for (const stageDef of exp.stages) {
  if (stageFilter && stageDef.stage !== stageFilter) continue;
  const stageDir = join(outRootAbs, stageDef.stage);
  console.log(`\n========== ${stageDef.stage} ==========`);

  if (reexport && existsSync(stageDir)) {
    for (const n of readdirSync(stageDir)) {
      if (n.endsWith(".zip") || n.endsWith(".date")) rmSync(join(stageDir, n));
    }
    console.log(`  · --reexport：已清空 ${stageDef.stage}/ 的旧 zip/date`);
  }

  const sources = (stageDef.sources ?? []).flatMap(expandGlob);
  if (sources.length === 0) {
    console.log(`  · 无匹配源（globs: ${(stageDef.sources ?? []).join(", ")}），跳过`);
    continue;
  }
  for (const [i, src] of sources.entries()) {
    totalSources += 1;
    console.log(`--- [${i + 1}/${sources.length}] ${src.split("/").at(-1)} ---`);
    try {
      execFileSync("bash", [exportScript, outRootAbs, stageDef.stage, src, stageDef.prefix ?? ""], { stdio: "inherit" });
    } catch {
      console.error(`!! 失败：${src}`);
      totalFail += 1;
    }
  }
}

// 校验：统计各阶段 zip 数与 exporter 版本分布
console.log(`\n========== 校验 ==========`);
console.log(`处理源 ${totalSources} 个，失败 ${totalFail}`);
for (const stageDef of exp.stages) {
  if (stageFilter && stageDef.stage !== stageFilter) continue;
  const stageDir = join(outRootAbs, stageDef.stage);
  if (!existsSync(stageDir)) continue;
  const zips = readdirSync(stageDir).filter((n) => n.endsWith(".zip"));
  const versions = {};
  for (const z of zips) {
    try {
      const out = execFileSync("unzip", ["-p", join(stageDir, z), "manifest.json"], { encoding: "utf8" });
      const m = out.match(/"version"\s*:\s*"([0-9.]+)"/);
      const v = m ? m[1] : "?";
      versions[v] = (versions[v] ?? 0) + 1;
    } catch {
      versions["?"] = (versions["?"] ?? 0) + 1;
    }
  }
  const dist = Object.entries(versions).map(([v, c]) => `${c}×${v}`).join(" ");
  console.log(`  ${stageDef.stage}: ${zips.length} zip${dist ? ` (${dist})` : ""}`);
}
