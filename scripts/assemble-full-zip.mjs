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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { argv, cwd, exit, stderr } from "node:process";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

// ── 跨平台 zip 操作（首选 7z → fallback unzip/zip）───────────────────

function hasCmd(cmd) {
  try {
    execSync(process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** 解压 zip 到 outDir（不依赖当前工作目录）。 */
function extractZip(zipPath, outDir) {
  if (hasCmd("7z")) {
    execSync(`7z x -y "${zipPath}" -o"${outDir}" -bso0`, { stdio: "inherit" });
    return;
  }
  if (hasCmd("unzip")) {
    execSync(`unzip -q -o "${zipPath}" -d "${outDir}"`, { stdio: "inherit" });
    return;
  }
  throw new Error("缺少解压工具：请安装 7-Zip（推荐）或确保 unzip 在 PATH 中。CI 中自带 7z。");
}

/** 将目录打包为 zip。zipPath 是输出文件路径，workDir 是打包的工作目录，rootName 是 zip 内顶层条目名。 */
function createZip(workDir, zipPath, rootName) {
  if (hasCmd("7z")) {
    execSync(`cd "${workDir}" && 7z a -tzip -mx=5 "${zipPath}" "${rootName}" -bso0`, { stdio: "inherit" });
    return;
  }
  if (hasCmd("zip")) {
    execSync(`cd "${workDir}" && zip -q -r "${zipPath}" "${rootName}"`, { stdio: "inherit" });
    return;
  }
  throw new Error("缺少打包工具：请安装 7-Zip（推荐）或确保 zip 在 PATH 中。CI 中自带 7z。");
}

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
  extractZip(runtimeZip, workDir);

  // Runtime zip contains a single top-level dir (PyInstaller onedir) e.g. "dak-studio/"
  // Find the top-level dir
  const topDirs = readdirSync(workDir).filter((f) => {
    try { return statSync(join(workDir, f)).isDirectory(); } catch { return false; }
  });
  const appRoot = topDirs.length === 1 ? join(workDir, topDirs[0]) : workDir;

  // 2. Copy bundled events — 扫描 dist/events/<slug>/<slug>.zip（与 R2 一致）
  if (bundledEventsDir && existsSync(bundledEventsDir)) {
    const destDir = join(appRoot, "userdata", "bundled-events");
    mkdirSync(destDir, { recursive: true });
    const subdirs = readdirSync(bundledEventsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());
    const manifestEvents = [];
    for (const dir of subdirs) {
      const slug = dir.name;
      const zipName = `${slug}.zip`;
      const src = join(bundledEventsDir, slug, zipName);
      if (!existsSync(src)) continue;
      const dest = join(destDir, zipName);
      copyFileSync(src, dest);
      const size = statSync(src).size;
      const hash = sha256(src);
      console.error(`  bundled-event: ${slug} (${(size / 1024 / 1024).toFixed(1)} MB)`);
      // 从 event-package.json 读取真实名称（扫描 local header 签名）
      let displayName = slug;
      try {
        const buf = readFileSync(src);
        const limit = buf.length - 30;
        for (let i = 0; i < limit; i++) {
          if (buf.readUInt32LE(i) !== 0x04034b50) continue;
          const nl = buf.readUInt16LE(i + 26);
          const el = buf.readUInt16LE(i + 28);
          const name = buf.subarray(i + 30, i + 30 + nl).toString("utf-8");
          if (name !== "event-package.json") continue;
          const cs = buf.readUInt32LE(i + 18);
          const cm = buf.readUInt16LE(i + 8);
          const ds = i + 30 + nl + el;
          if (cs <= 0 || ds + cs > buf.length) continue;
          const raw = cm === 0
            ? buf.subarray(ds, ds + cs).toString("utf-8")
            : inflateRawSync(buf.subarray(ds, ds + cs)).toString("utf-8");
          const pkg = JSON.parse(raw);
          displayName = pkg.event?.name || slug;
          break;
        }
      } catch { /* fallback to slug */ }
      manifestEvents.push({
        slug,
        name: displayName,
        size,
        sha256: hash,
        urls: [`https://dakupdate.starfie1d.top/events/${slug}/${zipName}`],
        packageVersion: "cs2-demo-analysis-kit/event-package-1.0",
      });
    }
    // 写入本地 bundled-events manifest（供前端发现）
    const beManifest = {
      version: "cs2-demo-analysis-kit/events-manifest-1.0",
      generatedAt: new Date().toISOString(),
      events: manifestEvents,
    };
    writeFileSync(join(destDir, "manifest.json"), JSON.stringify(beManifest, null, 2));
    console.error(`  bundled-events/manifest.json (${manifestEvents.length} events)`);
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
        console.error(`  tri: ${triName} (${(statSync(src).size / 1024 / 1024).toFixed(1)} MB)`);
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
  console.error(`打包：${fullZipName}…`);
  const zipRoot = topDirs.length === 1 ? topDirs[0] : ".";
  createZip(workDir, fullZipPath, zipRoot);

  // 6. Cleanup
  rmSync(workDir, { recursive: true, force: true });

  const { size } = statSync(fullZipPath);
  console.error(`done: ${fullZipPath} (${(size / 1024 / 1024).toFixed(0)} MB)`);
}

main();
