#!/usr/bin/env node
// 生成安装资产 manifest（install-manifest.json）。
// Web Installer 和 asset health check 的共同输入，描述一次完整安装需要的所有资产。
//
//   node scripts/gen-install-manifest.mjs \
//     --version 0.7.0 \
//     --runtime-zip python/dist/dak-studio-windows-0.7.0.zip \
//     --event-packages dist/events/ \
//     --tris-manifest tris-manifest.json \
//     --channel stable \
//     --asset-set cologne-major-2026-full \
//     --out install-manifest.json
//
// requiredTris 从 event-package 内 maps[].mapName 自动派生，
// 交叉匹配 tris-manifest 获得 size/sha256/urls，
// 并记录 requiredBy（哪些 bundledEvents 需要它），
// 供 health check 提供清晰的缺失提示。

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { argv, exit, stderr } from "node:process";

// 与 gen-update-manifest.mjs / gen-tris-manifest.mjs 的 R2_BASE 保持一致。
const R2_BASE = "https://dakupdate.starfie1d.top";

function sha256(path) {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}

function parseArgs(raw) {
  const args = { channel: "stable", "asset-set": "cologne-major-2026-full" };
  const flags = ["--version", "--runtime-zip", "--event-packages", "--tris-manifest", "--channel", "--asset-set", "--out"];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (flags.includes(a) && i + 1 < raw.length) {
      args[a.replace(/^--/, "")] = raw[++i];
    }
  }
  if (!args.version || !args["runtime-zip"] || !args["event-packages"] || !args["tris-manifest"]) {
    console.error("用法: gen-install-manifest.mjs --version <ver> --runtime-zip <path> --event-packages <dir> --tris-manifest <path> [--channel stable] [--asset-set ...] [--out <path>]");
    exit(1);
  }
  return args;
}

/**
 * 从 event-package zip 内提取所用地图名集合。
 * 读取 zip 内 event-package.json → 遍历 stages/series/maps[].mapName。
 * 不需要完整解压——只需要 JSON 条目（UTF-8 文本）。
 * Node 24 没有内置 zip 模块，我们用同步 read + 简单 ZIP local file header 扫描
 * 找到 event-package.json 的 compressed data。
 * 回退：如无法解析则返回空集合（调用方应处理）。
 */
function extractMapNamesFromEventZip(zipPath) {
  const mapNames = new Set();
  try {
    // 用简单的 ZIP 扫描找到 event-package.json。
    // ZIP 格式：local file header signature 0x04034b50，后面是 compressed data。
    const buf = readFileSync(zipPath);
    // 搜索 "event-package.json" 在文件中的出现（文件名在 local header 中）。
    const needle = Buffer.from("event-package.json");
    let idx = buf.indexOf(needle);
    while (idx >= 0) {
      // local file header 在文件名之前 26 字节处开始
      const headerStart = idx - 26;
      if (headerStart >= 0 && buf.readUInt32LE(headerStart) === 0x04034b50) {
        // 文件名长度
        const nameLen = buf.readUInt16LE(headerStart + 26);
        const extraLen = buf.readUInt16LE(headerStart + 28);
        const dataStart = headerStart + 30 + nameLen + extraLen;
        const compSize = buf.readUInt32LE(headerStart + 18);
        const compMethod = buf.readUInt16LE(headerStart + 8);
        if (compMethod === 0 && compSize > 0 && dataStart + compSize <= buf.length) {
          // Stored (no compression)
          const raw = buf.subarray(dataStart, dataStart + compSize).toString("utf-8");
          const pkg = JSON.parse(raw);
          collectMapNames(pkg, mapNames);
        } else {
          // Deflated — 用简单的 inflate（Node 内置 zlib）
          try {
            const { inflateRawSync } = await_import_zlib();
            const compressed = buf.subarray(dataStart, dataStart + compSize);
            const raw = inflateRawSync(compressed).toString("utf-8");
            const pkg = JSON.parse(raw);
            collectMapNames(pkg, mapNames);
          } catch {
            // 解压失败，跳过这个 entry
          }
        }
      }
      idx = buf.indexOf(needle, idx + 1);
    }
  } catch (err) {
    console.error(`   ⚠ 解析 event-package 地图失败 ${basename(zipPath)}: ${err.message}`);
  }
  return [...mapNames].sort();
}

// zlib 是内置模块，但在 ESM 中直接 import
import { inflateRawSync } from "node:zlib";
function await_import_zlib() {
  return { inflateRawSync };
}

function collectMapNames(pkg, out) {
  // event-package 结构：series[].maps[].mapName
  const series = pkg.series;
  if (!Array.isArray(series)) return;
  for (const s of series) {
    const maps = s.maps;
    if (!Array.isArray(maps)) continue;
    for (const m of maps) {
      if (m.mapName && typeof m.mapName === "string") {
        out.add(m.mapName);
      }
    }
  }
}

function assetUrls(type, version, name) {
  const tag = `v${version}`;
  if (type === "runtime") {
    return [`${R2_BASE}/releases/${tag}/${name}`];
  }
  if (type === "event") {
    // events/<slug>/<slug>.zip
    const slug = basename(name, ".zip");
    return [`${R2_BASE}/events/${slug}/${name}`];
  }
  return [];
}

function main() {
  const args = parseArgs(argv.slice(2));
  const ver = args.version.replace(/^v/, "");
  const runtimeZipPath = args["runtime-zip"];
  const eventPkgDir = args["event-packages"];
  const trisManifestPath = args["tris-manifest"];
  const channel = args.channel;
  const assetSet = args["asset-set"];
  const outPath = args.out || "install-manifest.json";

  // 1. Runtime
  const runtimeName = basename(runtimeZipPath);
  const runtimeSize = statSync(runtimeZipPath).size;
  const runtimeSha256 = sha256(runtimeZipPath);
  const runtime = {
    name: runtimeName,
    size: runtimeSize,
    sha256: runtimeSha256,
    urls: assetUrls("runtime", ver, runtimeName),
  };
  console.error(`runtime: ${runtimeName} (${(runtimeSize / 1024 / 1024).toFixed(1)} MB)`);

  // 2. Bundled events
  const eventFiles = readdirSync(eventPkgDir).filter((f) => f.endsWith(".zip")).sort();
  const bundledEvents = [];
  for (const f of eventFiles) {
    const full = `${eventPkgDir}/${f}`;
    const slug = basename(f, ".zip");
    const size = statSync(full).size;
    const hash = sha256(full);
    bundledEvents.push({
      slug,
      name: f,
      size,
      sha256: hash,
      urls: [`${R2_BASE}/events/${slug}/${f}`],
    });
    console.error(`event:  ${slug} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }

  // 3. Collect all map names from event packages
  const allMaps = new Set();
  for (const evt of bundledEvents) {
    const full = `${eventPkgDir}/${evt.name}`;
    const maps = extractMapNamesFromEventZip(full);
    for (const m of maps) allMaps.add(m);
    if (maps.length > 0) {
      console.error(`  maps in ${evt.slug}: ${maps.join(", ")}`);
    }
  }

  // 4. Tris manifest — cross reference
  let trisManifest = null;
  try {
    trisManifest = JSON.parse(readFileSync(trisManifestPath, "utf-8"));
  } catch (err) {
    console.error(`⚠ 读取 tris-manifest 失败: ${err.message}`);
  }

  const requiredTris = {};
  if (trisManifest && allMaps.size > 0) {
    for (const mapName of [...allMaps].sort()) {
      const entry = trisManifest.maps?.[mapName];
      if (!entry) {
        console.error(`   ⚠ 地图 "${mapName}" 未在 tris-manifest 中找到，跳过`);
        continue;
      }
      // 找出哪些 bundledEvents 需要此地图
      const requiredBy = bundledEvents
        .filter((evt) => {
          const maps = extractMapNamesFromEventZip(`${eventPkgDir}/${evt.name}`);
          return maps.includes(mapName);
        })
        .map((e) => e.slug);
      requiredTris[mapName] = {
        name: entry.name,
        size: entry.size,
        sha256: entry.sha256,
        urls: entry.urls,
        requiredBy,
      };
      console.error(`tri:   ${entry.name} (${(entry.size / 1024 / 1024).toFixed(1)} MB) ← ${requiredBy.join(", ")}`);
    }
  } else if (allMaps.size > 0 && !trisManifest) {
    console.error("   ⚠ tris-manifest 不可用，requiredTris 将为空");
  }

  // 5. Build manifest
  const manifest = {
    version: "cs2-demo-analysis-kit/install-manifest-1.0",
    appVersion: ver,
    channel,
    assetSet,
    generatedAt: new Date().toISOString(),
    runtime,
    bundledEvents,
    requiredTris,
  };

  // 6. Compute totals for summary
  const totalEventBytes = bundledEvents.reduce((s, e) => s + e.size, 0);
  const totalTriBytes = Object.values(requiredTris).reduce((s, t) => s + t.size, 0);
  const totalBytes = runtime.size + totalEventBytes + totalTriBytes;

  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.error(`wrote ${outPath}`);
  console.error(`总计: runtime ${(runtime.size / 1024 / 1024).toFixed(0)} MB + events ${(totalEventBytes / 1024 / 1024).toFixed(0)} MB + tris ${(totalTriBytes / 1024 / 1024).toFixed(0)} MB = ${(totalBytes / 1024 / 1024).toFixed(0)} MB`);
}

main();
