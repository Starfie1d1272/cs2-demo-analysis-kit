#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import JSZip from "jszip";

const [sourceArg, outArg = "dist/events", publicBase = "https://dakupdate.starfie1d.top"] = process.argv.slice(2);
if (!sourceArg) {
  console.error("usage: node scripts/build-event-asset.mjs <event-dir|event.zip> [out-dir] [public-base]");
  process.exit(2);
}

const source = resolve(sourceArg);
const output = resolve(outArg);
let bytes;
let packageJson;
let mapCount;
if (extname(source).toLowerCase() === ".zip") {
  bytes = await readFile(source);
  const input = await JSZip.loadAsync(bytes);
  const packageFile = input.file("event-package.json");
  if (!packageFile) throw new Error("event asset is missing event-package.json");
  packageJson = JSON.parse(await packageFile.async("string"));
  mapCount = Object.keys(input.files).filter((name) => /^maps\/.*\.zip$/i.test(name)).length;
} else {
  packageJson = JSON.parse(await readFile(join(source, "event-package.json"), "utf8"));
  const archive = new JSZip();
  archive.file("event-package.json", JSON.stringify(packageJson, null, 2));
  const mapsDir = join(source, "maps");
  let mapFiles = [];
  try {
    mapFiles = (await readdir(mapsDir)).filter((name) => name.toLowerCase().endsWith(".zip")).sort();
  } catch {
    mapFiles = [];
  }
  for (const name of mapFiles) archive.file(`maps/${name}`, await readFile(join(mapsDir, name)));
  bytes = await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 3 } });
  mapCount = mapFiles.length;
}
if (packageJson.version !== "cs2-demo-analysis-kit/event-package-1.0") throw new Error("unsupported event package version");
const slug = packageJson.event?.slug;
if (!slug) throw new Error("event.slug is required");

const sha256 = createHash("sha256").update(bytes).digest("hex");
const assetDir = join(output, slug);
await mkdir(assetDir, { recursive: true });
const assetName = `${slug}.zip`;
await writeFile(join(assetDir, assetName), bytes);
const entry = {
  slug,
  name: packageJson.event.name,
  size: (await stat(join(assetDir, assetName))).size,
  sha256,
  urls: [`${publicBase.replace(/\/$/, "")}/events/${slug}/${assetName}`],
  packageVersion: packageJson.version,
};
const manifestPath = join(output, "manifest.json");
let manifest = { version: "cs2-demo-analysis-kit/events-manifest-1.0", generatedAt: new Date().toISOString(), events: [] };
try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch { /* first asset */ }
manifest.generatedAt = new Date().toISOString();
manifest.events = [...manifest.events.filter((row) => row.slug !== slug), entry].sort((a, b) => a.slug.localeCompare(b.slug));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ asset: join(assetDir, assetName), manifest: manifestPath, maps: mapCount, sha256 }, null, 2));
