#!/usr/bin/env node
// 生成自动更新 manifest（latest.json）。
// 发版 CI 在打包后调用，把它作为 Release 资产上传到稳定地址
//   https://github.com/<owner>/<repo>/releases/latest/download/latest.json
// 客户端（apps/dak-studio/src/lib/update.ts）按镜像顺序拉取它。
//
//   node scripts/gen-update-manifest.mjs <version> <windows-zip> [out.json] [--notes-file FILE]
//
// 只产出 Windows 资产（CS2 仅 Windows 可玩，桌面端只面向 Windows）。

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const OWNER_REPO = "Starfie1d1272/cs2-demo-analysis-kit";

// 二进制下载镜像前缀（拼到 github.com 原始 URL 前）。空串=直连。
// ⚠️ 公共 ghproxy 域名易失效；长期可靠镜像请加自建 CDN/对象存储 URL（直接整条，不走前缀）。
const BINARY_MIRROR_PREFIXES = ["", "https://ghfast.top/", "https://gh-proxy.com/", "https://ghproxy.net/"];

function sha256(path) {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}

function assetUrls(version, name) {
  const raw = `https://github.com/${OWNER_REPO}/releases/download/v${version}/${name}`;
  return BINARY_MIRROR_PREFIXES.map((p) => (p ? (p.endsWith("/") ? p + raw : `${p}/${raw}`) : raw));
}

function main() {
  const args = process.argv.slice(2);
  const notesIdx = args.indexOf("--notes-file");
  let notes = "";
  if (notesIdx >= 0) {
    try {
      notes = readFileSync(args[notesIdx + 1], "utf8").trim();
    } catch {
      /* notes 可选 */
    }
    args.splice(notesIdx, 2);
  }
  const [version, zipPath, outArg] = args;
  if (!version || !zipPath) {
    console.error("用法: gen-update-manifest.mjs <version> <windows-zip> [out.json] [--notes-file FILE]");
    process.exit(1);
  }
  const ver = version.replace(/^v/, "");
  const name = basename(zipPath);
  const manifest = {
    version: ver,
    notes: notes || undefined,
    publishedAt: new Date().toISOString(),
    assets: {
      windows: {
        name,
        size: statSync(zipPath).size,
        sha256: sha256(zipPath),
        urls: assetUrls(ver, name)
      }
    }
  };
  const out = outArg || join(dirname(zipPath), "latest.json");
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
  console.error(`wrote ${out} (windows ${name}, ${manifest.assets.windows.size} bytes)`);
}

main();
