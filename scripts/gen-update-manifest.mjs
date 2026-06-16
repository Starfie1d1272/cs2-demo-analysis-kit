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

// 自建 R2 镜像（Cloudflare R2 + 自定义域，国内可达，**最高优先级**）。
// 完整 URL 独立来源（非 github 代理前缀）。release.yml 把 zip 上传到对应路径，
// 路径约定必须与此一致：releases/<tag>/<name>。
const R2_BASE = "https://dakupdate.starfie1d.top";

// 二进制下载镜像前缀（拼到 github.com 原始 URL 前）。空串=直连。
// ⚠️ 公共 ghproxy 域名易失效；长期可靠分发走上面的 R2（自建）。
const BINARY_MIRROR_PREFIXES = ["", "https://ghfast.top/", "https://gh-proxy.com/", "https://ghproxy.net/"];

function sha256(path) {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}

// 顺序即优先级：R2（自建）→ GitHub 直连 → ghproxy×3。
function assetUrls(version, name) {
  const tag = `v${version}`;
  const r2 = `${R2_BASE}/releases/${tag}/${name}`;
  const raw = `https://github.com/${OWNER_REPO}/releases/download/${tag}/${name}`;
  const ghproxied = BINARY_MIRROR_PREFIXES.map((p) => (p ? (p.endsWith("/") ? p + raw : `${p}/${raw}`) : raw));
  return [r2, ...ghproxied];
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
