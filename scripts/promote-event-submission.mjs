#!/usr/bin/env node
// 赛事投稿审核与发布（本地，持你的 R2 凭证）。Worker 只把投稿落到 events/_submissions/ 隔离区，
// 真正决定"开放下载"完全在这里：列出 → 取回检视 → 通过则 build+publish 进 events/ 并重生 manifest → 删投稿。
//
// 依赖 aws CLI（与 publish-event-assets.sh 同一套 R2 S3 凭证）。需要环境变量：
//   R2_ENDPOINT, R2_BUCKET（与 release.yml / publish-event-assets.sh 一致）
//
// 用法：
//   node scripts/promote-event-submission.mjs list
//   node scripts/promote-event-submission.mjs inspect <key>        # 取回到临时目录，校验 schema/sha256，打印摘要
//   node scripts/promote-event-submission.mjs approve <key>        # inspect 通过后 build+publish 进 events/ 并删投稿
//   node scripts/promote-event-submission.mjs reject  <key>        # 删投稿（含 .meta.json）
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(import.meta.url), "../..");
const ENDPOINT = process.env.R2_ENDPOINT;
const BUCKET = process.env.R2_BUCKET;
const PREFIX = "events/_submissions/";

function need(v, name) { if (!v) { console.error(`缺少环境变量 ${name}`); process.exit(2); } return v; }
function aws(args, opts = {}) {
  return execFileSync("aws", ["s3", ...args, "--endpoint-url", need(ENDPOINT, "R2_ENDPOINT")], { encoding: "utf8", ...opts });
}
function s3uri(key) { return `s3://${need(BUCKET, "R2_BUCKET")}/${key}`; }

const [cmd, key] = process.argv.slice(2);

if (cmd === "list") {
  const out = aws(["ls", s3uri(PREFIX)]);
  const zips = out.split("\n").filter((l) => l.trim().endsWith(".zip"));
  if (zips.length === 0) { console.log("隔离区无待审投稿。"); process.exit(0); }
  console.log(`待审投稿（${zips.length}）：`);
  for (const line of zips) {
    const name = line.trim().split(/\s+/).at(-1);
    let meta = "";
    try {
      const tmp = mkdtempSync(join(tmpdir(), "subm-"));
      aws(["cp", s3uri(`${PREFIX}${name}.meta.json`), join(tmp, "m.json")], { stdio: "pipe" });
      const m = JSON.parse(readFileSync(join(tmp, "m.json"), "utf8"));
      meta = ` · slug=${m.slug} · ${(m.size / 1024 / 1024).toFixed(1)}MB · ${m.submittedAt}${m.note ? ` · 「${m.note}」` : ""}`;
      rmSync(tmp, { recursive: true, force: true });
    } catch { /* 无 meta 不阻塞 */ }
    console.log(`  ${PREFIX}${name}${meta}`);
  }
  process.exit(0);
}

if (!key || !["inspect", "approve", "reject"].includes(cmd)) {
  console.error("用法：promote-event-submission.mjs <list|inspect|approve|reject> [key]");
  process.exit(2);
}

if (cmd === "reject") {
  aws(["rm", s3uri(key)]);
  try { aws(["rm", s3uri(`${key}.meta.json`)]); } catch { /* 可能无 meta */ }
  console.log(`已拒绝并删除：${key}`);
  process.exit(0);
}

// inspect / approve 都先取回 + 深度校验
const work = mkdtempSync(join(tmpdir(), "subm-"));
const localZip = join(work, "package.zip");
aws(["cp", s3uri(key), localZip], { stdio: "inherit" });

// sha256 + event-package.json schema 校验（复用 contract）
const bytes = readFileSync(localZip);
const sha = createHash("sha256").update(bytes).digest("hex");
console.log(`sha256: ${sha} · ${(bytes.length / 1024 / 1024).toFixed(1)}MB`);

// 解出 event-package.json 并跑合同校验（tsx + @cs2dak/contract）
const pkgJson = execSync(`unzip -p ${JSON.stringify(localZip)} event-package.json`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const validatorPath = join(work, "validate.mts");
writeFileSync(validatorPath, [
  `import { eventPackageSchema } from "@cs2dak/contract";`,
  `const pkg = JSON.parse(${JSON.stringify(pkgJson)});`,
  `const r = eventPackageSchema.safeParse(pkg);`,
  `if (!r.success) { console.error("schema 校验失败：", JSON.stringify(r.error.issues, null, 2)); process.exit(1); }`,
  `console.log("schema ✓ event:", r.data.event.slug, "| series:", r.data.series.length);`,
].join("\n"));
try {
  execFileSync("pnpm", ["--filter", "@cs2dak/contract", "exec", "tsx", validatorPath], { cwd: REPO, stdio: "inherit" });
} catch {
  console.error("合同校验未通过，拒绝 promote。投稿仍留在隔离区，可 reject 删除。");
  rmSync(work, { recursive: true, force: true });
  process.exit(1);
}

if (cmd === "inspect") {
  console.log(`\n检视通过。确认无误后：node scripts/promote-event-submission.mjs approve ${key}`);
  rmSync(work, { recursive: true, force: true });
  process.exit(0);
}

// approve：build 进 dist/events（登记进 manifest）→ publish 到 R2 → 删投稿。
// 关键：build-event-asset 会读 out 目录里已有的 manifest 并把新包合并进去。必须先把线上现有
// manifest 拉进 build 目录做种子，否则发布的 manifest 只含本包、会把已发布赛事从清单里抹掉。
// 已发布赛事的 zip 不必重传（publish 的 s3 sync 无 --delete，原 zip 原样保留）。
console.log("\n=== 拉取线上 manifest 做种子 → build → publish ===");
const distDir = join(work, "dist");
execFileSync("mkdir", ["-p", distDir]);
try {
  aws(["cp", s3uri("events/manifest.json"), join(distDir, "manifest.json")], { stdio: "pipe" });
  console.log("  · 已拉取线上 manifest 做种子");
} catch {
  console.log("  · 线上无 manifest（首个赛事包），从空清单开始");
}
execFileSync("node", [join(REPO, "scripts/build-event-asset.mjs"), localZip, distDir], { cwd: REPO, stdio: "inherit" });
execFileSync("bash", [join(REPO, "scripts/publish-event-assets.sh"), distDir], {
  cwd: REPO, stdio: "inherit", env: { ...process.env },
});
aws(["rm", s3uri(key)]);
try { aws(["rm", s3uri(`${key}.meta.json`)]); } catch { /* 可能无 meta */ }
rmSync(work, { recursive: true, force: true });
console.log(`\n已发布并清除投稿：${key}`);
