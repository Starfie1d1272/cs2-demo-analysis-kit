#!/usr/bin/env node
// 组装 Full Portable Zip。
// 输入 runtime zip + bundled events + tris → 输出 dak-studio-windows-<version>-full.zip。
// 目录结构与 installer 安装结果一致（assets 直放 userdata/）。
//
//   node scripts/assemble-full-zip.mjs \
//     --runtime-zip dak-studio-windows-0.7.0.zip \
//     --bundled-events dist/events/ \
//     --tris-manifest tris-manifest.json \
//     --tris-dir ~/.awpy/tris \
//     --install-manifest install-manifest.json \
//     --out dist/
//
// 0.7.0 pragmatic：assets 直放 userdata/，与 installer 结果一致。
// 长期演进：app 同级 bundled-assets/ + 首启注册到 userdata/。

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { argv, cwd, exit, stderr } from "node:process";
import { createHash } from "node:crypto";

function parseArgs(raw) {
  const args = {};
  const flags = ["--runtime-zip", "--bundled-events", "--tris-manifest", "--tris-dir", "--install-manifest", "--out"];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (flags.includes(a) && i + 1 < raw.length) {
      args[a.replace(/^--/, "")] = raw[++i];
    }
  }
  if (!args["runtime-zip"] || !args["install-manifest"] || !args.out) {
    console.error("用法: assemble-full-zip.mjs --runtime-zip <path> --bundled-events <dir> --tris-manifest <path> --tris-dir <dir> --install-manifest <path> --out <dir>");
    exit(1);
  }
  return args;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main() {
  const args = parseArgs(argv.slice(2));
  const runtimeZip = resolve(args["runtime-zip"]);
  const bundledEventsDir = args["bundled-events"] ? resolve(args["bundled-events"]) : null;
  const trisManifestPath = args["tris-manifest"] ? resolve(args["tris-manifest"]) : null;
  const trisDir = args["tris-dir"] ? resolve(args["tris-dir"]) : null;
  const installManifestPath = resolve(args["install-manifest"]);
  const outDir = resolve(args.out);

  if (!existsSync(runtimeZip)) {
    console.error(`runtime zip 不存在：${runtimeZip}`);
    exit(1);
  }
  if (!existsSync(installManifestPath)) {
    console.error(`install-manifest.json 不存在：${installManifestPath}`);
    exit(1);
  }

  const version = (() => {
    try {
      const m = JSON.parse(readFileSync(installManifestPath, "utf-8"));
      return m.appVersion || "0.0.0";
    } catch { return "0.0.0"; }
  })();
  const runtimeName = basename(runtimeZip);
  const versionStem = runtimeName.replace(/^dak-studio-windows-/, "").replace(/\.zip$/, "");
  const fullZipName = `dak-studio-windows-${versionStem}-full.zip`;
  const fullZipPath = join(outDir, fullZipName);
  mkdirSync(outDir, { recursive: true });

  // Read install manifest to know which tris are required
  let requiredTris = {};
  try {
    const manifest = JSON.parse(readFileSync(installManifestPath, "utf-8"));
    requiredTris = manifest.requiredTris || {};
  } catch (err) {
    console.error(`读取 install-manifest 失败：${err.message}`);
  }

  // Stage in temp dir
  const workDir = join(outDir, `.tmp-full-${versionStem}`);
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  // 1. Extract runtime zip to work dir
  console.error(`解压 runtime：${runtimeName} → ${workDir}/`);
  execSync(`unzip -q -o "${runtimeZip}" -d "${workDir}"`, { stdio: "inherit" });

  // Runtime zip contains a single top-level dir (PyInstaller onedir) e.g. "dak-studio/"
  // Find the top-level dir
  const topDirs = readdirSync(workDir).filter((f) => {
    try { return require("node:fs").statSync(join(workDir, f)).isDirectory(); } catch { return false; }
  });
  const appRoot = topDirs.length === 1 ? join(workDir, topDirs[0]) : workDir;

  // 2. Copy bundled events
  if (bundledEventsDir && existsSync(bundledEventsDir)) {
    const destDir = join(appRoot, "userdata", "bundled-events");
    mkdirSync(destDir, { recursive: true });
    const eventFiles = readdirSync(bundledEventsDir).filter((f) => f.endsWith(".zip"));
    for (const f of eventFiles) {
      const src = join(bundledEventsDir, f);
      const dest = join(destDir, f);
      copyFileSync(src, dest);
      console.error(`  bundled-event: ${f} (${(require("node:fs").statSync(src).size / 1024 / 1024).toFixed(1)} MB)`);
    }
    // Write manifest.json for bundled events
    try {
      const manifestFile = join(bundledEventsDir, "manifest.json");
      if (existsSync(manifestFile)) {
        copyFileSync(manifestFile, join(destDir, "manifest.json"));
        console.error("  bundled-events/manifest.json");
      }
    } catch { /* optional */ }
  }

  // 3. Copy required tris
  if (trisDir && existsSync(trisDir)) {
    const destDir = join(appRoot, "userdata", "tris");
    mkdirSync(destDir, { recursive: true });
    let copied = 0;
    for (const [mapName, entry] of Object.entries(requiredTris)) {
      const triName = entry.name || `${mapName}.tri`;
      const src = join(trisDir, triName);
      if (existsSync(src)) {
        const dest = join(destDir, triName);
        copyFileSync(src, dest);
        copied++;
        console.error(`  tri: ${triName} (${(require("node:fs").statSync(src).size / 1024 / 1024).toFixed(1)} MB)`);
      } else {
        console.error(`  ⚠ tri 缺失：${triName}（tris-dir 中不存在，full zip 将不含此文件）`);
      }
    }
    console.error(`  tris: ${copied}/${Object.keys(requiredTris).length} 张地图`);
  } else {
    console.error("  ⚠ 未提供 tris-dir，full zip 将不含 .tri 文件");
  }

  // 4. Copy install-manifest.json
  copyFileSync(installManifestPath, join(appRoot, "userdata", "install-manifest.json"));
  console.error("  install-manifest.json");

  // 5. Zip the work dir
  // Use the top-level dir name for the zip root so structure is consistent
  console.error(`打包：${fullZipName}…`);
  const zipRoot = topDirs.length === 1 ? topDirs[0] : ".";
  execSync(`cd "${workDir}" && zip -q -r "${fullZipPath}" "${zipRoot}"`, { stdio: "inherit" });

  // 6. Cleanup
  rmSync(workDir, { recursive: true, force: true });

  const { size } = require("node:fs").statSync(fullZipPath);
  console.error(`done: ${fullZipPath} (${(size / 1024 / 1024).toFixed(0)} MB)`);
}

main();
