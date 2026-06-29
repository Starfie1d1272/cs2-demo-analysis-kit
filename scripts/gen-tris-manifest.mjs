#!/usr/bin/env node
// 生成 .tri 资产清单（tris-manifest.json）。
// 发版 CI 在下载 awpy tris 后调用，把清单与各 .tri 同步到自建 R2：
//   https://dakupdate.starfie1d.top/tris/manifest.json   （短缓存）
//   https://dakupdate.starfie1d.top/tris/<map>.tri        （不可变长缓存）
// 桌面壳（python/src/cs2dak/studio.py 的 _StudioStaticHandler）在某图 .tri
// 首次缺失时按本清单的 urls + sha256 下载到 assets/tris overlay。
//
//   node scripts/gen-tris-manifest.mjs <tris-dir> [out.json]
//
// .tri 不进 GitHub Release（单图 ~30MB、按 awpy 版本而非发版变化），只托管在 R2。

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

// 与 update.ts / gen-update-manifest.mjs 的 R2_BASE 保持一致。
const R2_BASE = "https://dakupdate.starfie1d.top";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main() {
  const [trisDir, outArg] = process.argv.slice(2);
  if (!trisDir) {
    console.error("用法: gen-tris-manifest.mjs <tris-dir> [out.json]");
    process.exit(1);
  }
  const files = readdirSync(trisDir).filter((f) => f.endsWith(".tri")).sort();
  const maps = {};
  for (const file of files) {
    const full = join(trisDir, file);
    const stem = basename(file, ".tri");
    maps[stem] = {
      name: file,
      size: statSync(full).size,
      sha256: sha256(full),
      urls: [`${R2_BASE}/tris/${file}`]
    };
  }
  const manifest = { generatedAt: new Date().toISOString(), maps };
  const out = outArg || join(trisDir, "tris-manifest.json");
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
  console.error(`wrote ${out} (${files.length} maps)`);
}

main();
