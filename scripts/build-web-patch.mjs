#!/usr/bin/env node
import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";

const version = (process.argv[2] || JSON.parse(readFileSync("package.json", "utf8")).version).replace(/^v/, "");
const outDir = process.argv[3] || "dist/web";
const distDir = "apps/dak-studio/dist";

execFileSync("pnpm", ["--filter", "@cs2dak/dak-studio", "build"], {
  stdio: "inherit",
  env: { ...process.env, DAK_APP_VERSION: version },
});

rmSync(join(distDir, "tris"), { recursive: true, force: true });
writeFileSync(join(distDir, "version.json"), JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2) + "\n");
await mkdir(outDir, { recursive: true });

const zip = new JSZip();
async function addDir(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await addDir(full);
    } else if (entry.isFile()) {
      zip.file(relative(distDir, full).replaceAll("\\", "/"), await readFile(full));
    }
  }
}
await addDir(distDir);

const out = join(outDir, `dak-studio-web-${version}.zip`);
const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
writeFileSync(out, bytes);
console.error(`wrote ${out} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
