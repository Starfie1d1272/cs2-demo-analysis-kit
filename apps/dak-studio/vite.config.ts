import { createReadStream, createWriteStream, readFileSync } from "node:fs";
import { mkdtemp, readdir, rm, stat, utimes } from "node:fs/promises";
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
 * 调本仓库 Python exporter（uv run cs2dak export）转 v2 ZIP 后回传。
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

            const outDir = join(workDir, "out");
            await new Promise<void>((resolvePromise, rejectPromise) => {
              execFile(
                "uv",
                ["run", "cs2dak", "export", demPath, "--out", outDir],
                { cwd: PYTHON_ROOT, timeout: EXPORT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
                (error, _stdout, stderr) => {
                  if (error) rejectPromise(new Error(stderr.trim() || error.message));
                  else resolvePromise();
                }
              );
            });

            const zipName = (await readdir(outDir)).find((name) => name.endsWith(".zip"));
            if (!zipName) throw new Error("exporter 没有产出 ZIP");
            const zipPath = join(outDir, zipName);
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

export default defineConfig({
  base: "./",
  define: {
    // 桌面应用版本随 vX.Y.Z tag（scripts/sync-version.mjs 写入 package.json）
    __APP_VERSION__: JSON.stringify(
      (JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version: string }).version
    ),
  },
  plugins: [react(), demExportPlugin()],
  server: {
    port: 5178,
  },
});
