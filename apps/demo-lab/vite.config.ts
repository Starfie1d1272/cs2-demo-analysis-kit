import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function mapsApiPlugin(): Plugin {
  const MAPS_ROOT = resolve(__dirname, "../../packages/maps");
  const jsonHeader = { "Content-Type": "application/json" };

  return {
    name: "cs2dak-maps-api",
    configureServer(server) {
      // GET /api/load-zones?map=de_mirage  → read map-zones/<map>.json
      server.middlewares.use("/api/load-zones", async (req, res) => {
        try {
          const url = new URL(req.url ?? "", "http://localhost");
          const mapName = url.searchParams.get("map");
          if (!mapName) throw new Error("missing ?map=");
          const path = resolve(MAPS_ROOT, "map-zones", `${mapName}.json`);
          if (!existsSync(path)) { res.writeHead(404, jsonHeader); res.end(JSON.stringify({ zones: [] })); return; }
          const raw = await readFile(path, "utf-8");
          res.writeHead(200, jsonHeader);
          res.end(raw);
        } catch (err) { res.writeHead(400, jsonHeader); res.end(JSON.stringify({ error: String(err) })); }
      });

      // GET /api/load-routes?map=de_mirage  → read map-routes/<map>.json
      server.middlewares.use("/api/load-routes", async (req, res) => {
        try {
          const url = new URL(req.url ?? "", "http://localhost");
          const mapName = url.searchParams.get("map");
          if (!mapName) throw new Error("missing ?map=");
          const path = resolve(MAPS_ROOT, "map-routes", `${mapName}.json`);
          if (!existsSync(path)) { res.writeHead(404, jsonHeader); res.end(JSON.stringify({ routes: [] })); return; }
          const raw = await readFile(path, "utf-8");
          res.writeHead(200, jsonHeader);
          res.end(raw);
        } catch (err) { res.writeHead(400, jsonHeader); res.end(JSON.stringify({ error: String(err) })); }
      });

      // POST /api/save-zones  → packages/maps/map-zones/<map>.json
      server.middlewares.use("/api/save-zones", async (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        try {
          const body = await readBody(req);
          const data = JSON.parse(body);
          const mapName = data.mapName as string;
          if (!mapName) throw new Error("missing mapName");
          const path = resolve(MAPS_ROOT, "map-zones", `${mapName}.json`);
          await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
          res.writeHead(200, jsonHeader); res.end(JSON.stringify({ ok: true, path }));
        } catch (err) { res.writeHead(400, jsonHeader); res.end(JSON.stringify({ ok: false, error: String(err) })); }
      });

      // POST /api/save-routes → packages/maps/map-routes/<map>.json
      server.middlewares.use("/api/save-routes", async (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        try {
          const body = await readBody(req);
          const data = JSON.parse(body);
          const mapName = data.mapName as string;
          if (!mapName) throw new Error("missing mapName");
          const path = resolve(MAPS_ROOT, "map-routes", `${mapName}.json`);
          await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
          res.writeHead(200, jsonHeader); res.end(JSON.stringify({ ok: true, path }));
        } catch (err) { res.writeHead(400, jsonHeader); res.end(JSON.stringify({ ok: false, error: String(err) })); }
      });
    },
  };
}

function readBody(req: { on(event: "data", cb: (chunk: Buffer) => void): void; on(event: "end", cb: () => void): void; on(event: "error", cb: (err: Error) => void): void }): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export default defineConfig({
  base: "./",
  plugins: [react(), mapsApiPlugin()],
  server: {
    port: 5177,
  },
});
