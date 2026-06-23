import { createReadStream, createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const PYTHON_ROOT = resolve(__dirname, "../../python");
const EXPORT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * dev 模式的 .dem 导入后端：POST /api/export-dem 收 .dem 字节流，
 * 调 cs2df（uv run cs2df export）转 v3 ZIP 后回传。
 * 打包版桌面壳里这条链路由 pywebview bridge（cs2dak-studio）承担。
 */
function demExportPlugin(): Plugin {
  return {
    name: "cs2dak-dem-export",
    configureServer(server) {
      server.middlewares.use("/api/export-dem", (req, res) => {
        if (req.method === "GET") {
          // 探活：前端用它判断 dev 后端是否可用
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        void (async () => {
          const url = new URL(req.url ?? "", "http://localhost");
          const demName = basename(url.searchParams.get("name") ?? "demo.dem").replace(/[^\w.\-一-鿿]/g, "_");
          const workDir = await mkdtemp(join(tmpdir(), "cs2dak-dem-"));
          try {
            const demPath = join(workDir, demName.toLowerCase().endsWith(".dem") ? demName : `${demName}.dem`);
            await pipeline(req, createWriteStream(demPath));
            // 还原 .dem 原始 mtime（exporter 以它派生比赛日期）；缺参时保持落盘时间
            const mtimeMs = Number(url.searchParams.get("mtime"));
            if (Number.isFinite(mtimeMs) && mtimeMs > 0) {
              await utimes(demPath, new Date(mtimeMs), new Date(mtimeMs));
            }

            const zipPath = join(workDir, demName.replace(/\.dem$/i, ".zip"));
            await new Promise<void>((resolvePromise, rejectPromise) => {
              execFile(
                "uv",
                // --research：产出 duels.json 满 tick 战斗窗口，Studio 的急停/反应/预瞄依赖它
                ["run", "cs2df", "export", demPath, "-o", zipPath, "--research", "-q"],
                { cwd: PYTHON_ROOT, timeout: EXPORT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
                (error, _stdout, stderr) => {
                  if (error) rejectPromise(new Error(stderr.trim() || error.message));
                  else resolvePromise();
                }
              );
            });

            const zipName = basename(zipPath);
            const { size } = await stat(zipPath);
            res.writeHead(200, {
              "Content-Type": "application/zip",
              "Content-Length": size,
              "X-Zip-Name": encodeURIComponent(zipName)
            });
            await pipeline(createReadStream(zipPath), res);
          } finally {
            await rm(workDir, { recursive: true, force: true });
          }
        })().catch((err: unknown) => {
          if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(err instanceof Error ? err.message : String(err));
        });
      });
    }
  };
}

/**
 * dev 模式的 .tri 资产代理：把 `/tris/<map>.tri` 与 `/tris/manifest.json` 落到本地 public/ 时
 * 直接交给 Vite 静态服务（next()），否则服务端代理 R2（dakupdate.starfie1d.top/tris）。
 *
 * 浏览器直连 R2 会被 CORS 拦截（该域未配 Access-Control-Allow-Origin），服务端 fetch 不受限。
 * 这同时让普通分析的 `./tris/<map>.tri` 在 dev 下也按需自动补全，与打包版 Python 静态服务行为一致。
 */
function trisProxyPlugin(): Plugin {
  const R2_TRIS = "https://dakupdate.starfie1d.top/tris";
  const PUBLIC_TRIS = resolve(__dirname, "public/tris");
  return {
    name: "cs2dak-tris-proxy",
    configureServer(server) {
      server.middlewares.use("/tris/", (req, res, next) => {
        const fileName = basename(new URL(req.url ?? "", "http://localhost").pathname);
        const isTri = fileName.endsWith(".tri");
        const isManifest = fileName === "manifest.json";
        if (!isTri && !isManifest) { next(); return; }
        if (existsSync(join(PUBLIC_TRIS, fileName))) { next(); return; } // 本地优先
        void (async () => {
          const upstream = await fetch(`${R2_TRIS}/${fileName}`);
          if (!upstream.ok) { res.statusCode = upstream.status; res.end(); return; }
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.writeHead(200, {
            "Content-Type": isManifest ? "application/json" : "application/octet-stream",
            "Content-Length": buf.length,
            "Cache-Control": "no-cache",
          });
          res.end(buf);
        })().catch(() => { if (!res.headersSent) res.statusCode = 502; res.end(); });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  define: {
    // 桌面应用版本随 vX.Y.Z tag（scripts/sync-version.mjs 写入 package.json）
    __APP_VERSION__: JSON.stringify(
      (JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version: string }).version
    ),
  },
  plugins: [react(), demExportPlugin(), trisProxyPlugin()],
  server: {
    port: 5178,
  },
});
