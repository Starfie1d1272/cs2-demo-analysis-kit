#!/usr/bin/env node
// Verify the actual tarball in an isolated consumer; no publish or workspace imports.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "dak-maps-consumer-"));
function command(program, args, options = {}) {
  execFileSync(program, args, { cwd: root, stdio: "inherit", ...options });
}
try {
  command("pnpm", ["--filter", "@cs2dak/maps", "build"]);
  command("pnpm", ["--filter", "@cs2dak/maps", "pack", "--pack-destination", temporary]);
  const archives = readdirSync(temporary).filter((name) => name.endsWith(".tgz"));
  assert.equal(archives.length, 1);
  const consumer = join(temporary, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), '{"private":true,"type":"module"}\n');
  command("npm", ["install", "--no-save", "--no-audit", "--no-fund", "--ignore-scripts", join(temporary, archives[0])], { cwd: consumer });
  const installed = join(consumer, "node_modules", "@cs2dak", "maps");
  const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.exports).sort(), [".", "./calibration", "./callout-grid-browser", "./callout-grid-node", "./tri-assets"].sort());
  assert.equal(readdirSync(join(consumer, "node_modules", "@cs2dak")).length, 1);
  assert.ok(!readdirSync(installed).includes("src"));
  assert.ok(readdirSync(join(installed, "dist"), { withFileTypes: true }).every((entry) =>
    entry.isFile() && !entry.name.includes(".test.") && (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts"))));
  for (const entry of Object.values(manifest.exports)) {
    assert.match(entry.import, /^\.\/dist\/.*\.js$/);
    assert.match(entry.types, /^\.\/dist\/.*\.d\.ts$/);
    readFileSync(join(installed, entry.import));
    readFileSync(join(installed, entry.types));
  }
  for (const asset of ["map-zones/de_ancient.json", "map-routes/de_ancient.json", "map-nav/de_ancient.nav.json", "callout-grid/de_ancient.json"]) {
    readFileSync(join(installed, asset));
  }
  assert.ok(!/\b(?:import|export)\s[^;]*\bfrom\b|\bimport\s*[('"']/.test(readFileSync(join(installed, "dist/calibration.js"), "utf8")), "calibration has zero runtime imports");
  writeFileSync(join(consumer, "check.mjs"), `
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as maps from '@cs2dak/maps';
import * as calibrationOnly from '@cs2dak/maps/calibration';
import { loadCalloutGrid, clearCalloutGridCache } from '@cs2dak/maps/callout-grid-node';
import { loadCalloutGridBrowser, clearCalloutGridBrowserCache } from '@cs2dak/maps/callout-grid-browser';
import { hasMapTri, getMapTri, clearTriCache } from '@cs2dak/maps/tri-assets';
const calibration = maps.getMapCalibration('de_nuke');
assert.ok(calibration);
assert.deepEqual(maps.worldToRadar({ x: calibration.posX, y: calibration.posY }, calibration), { x: 0, y: 0, outOfBounds: false });
assert.equal(maps.levelAt(-496, calibration), 'lower');
assert.equal(maps.getMapCalibration('unknown'), null);
assert.equal(maps.MAP_CALIBRATIONS, calibrationOnly.MAP_CALIBRATIONS);
assert.equal(maps.worldToRadar, calibrationOnly.worldToRadar);
assert.equal(maps.MAP_CALIBRATION_VERSION, '2');
const train = calibrationOnly.getMapCalibration('de_train');
assert.equal(calibrationOnly.levelAt(-51, train), 'lower');
assert.equal(calibrationOnly.levelAt(-50, train), 'upper');
assert.ok(maps.ACTIVE_DUTY_MAPS.includes('de_cache'));
assert.ok(!maps.ACTIVE_DUTY_MAPS.includes('de_overpass'));
assert.ok(maps.SPATIAL_ASSET_MAPS.includes('de_overpass'));
assert.equal(maps.getMapNav('de_cache'), null);
assert.ok(maps.getMapNav('de_overpass'));
assert.ok(maps.getMapZones('de_mirage'));
assert.ok(maps.getMapRoutes('de_nuke'));
assert.ok(maps.getMapNav('de_nuke'));
const grid = loadCalloutGrid('de_nuke');
assert.ok(grid);
assert.notEqual(maps.calloutAt(grid, { x: 0, y: 0, z: 0 }), undefined);
assert.equal(loadCalloutGrid('not-a-map'), null);
const fetched = await loadCalloutGridBrowser('de_nuke', { baseUrl: '/fixture', fetchImpl: async (url) => {
  assert.equal(url, '/fixture/de_nuke.json');
  return new Response(JSON.stringify(grid));
} });
assert.deepEqual(fetched, grid);
const triangle = Buffer.alloc(36);
[0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => triangle.writeFloatLE(value, index * 4));
writeFileSync(join(process.env.AWPY_TRIS_DIR, 'fixture.tri'), triangle);
assert.equal(hasMapTri('fixture'), true);
assert.ok(getMapTri('fixture'));
assert.equal(hasMapTri('not-a-map'), false);
assert.equal(getMapTri('not-a-map'), null);
clearTriCache(); clearCalloutGridCache(); clearCalloutGridBrowserCache();
console.log('Packed maps: all five ESM entries and actual API calls passed');
`);
  execFileSync(process.execPath, [join(consumer, "check.mjs")], { cwd: consumer, stdio: "inherit", env: { ...process.env, AWPY_TRIS_DIR: temporary } });
  writeFileSync(join(consumer, "consumer.ts"), `
import { getMapCalibration, worldToRadar, getMapZones, getMapNav, getMapRoutes } from '@cs2dak/maps';
import { MAP_CALIBRATION_VERSION, MAP_CALIBRATIONS, getMapCalibration as getPureCalibration, worldToRadar as pureWorldToRadar, levelAt, hasLowerLevel, type MapCalibration, type RadarPoint, type MapLevel } from '@cs2dak/maps/calibration';
import { ACTIVE_DUTY_MAPS, SPATIAL_ASSET_MAPS, type ActiveDutyMap, type SpatialAssetMap } from '@cs2dak/maps';
import { loadCalloutGrid } from '@cs2dak/maps/callout-grid-node';
import { loadCalloutGridBrowser } from '@cs2dak/maps/callout-grid-browser';
import { hasMapTri, getMapTri } from '@cs2dak/maps/tri-assets';
const calibration = getPureCalibration('de_nuke');
getMapCalibration('de_train');
if (calibration) {
  const c: MapCalibration = calibration;
  const p: RadarPoint = pureWorldToRadar({ x: 0, y: 0 }, c);
  worldToRadar({ x: 0, y: 0 }, c);
  const level: MapLevel = levelAt(0, c);
  hasLowerLevel(c); void p; void level;
}
const active: ActiveDutyMap = ACTIVE_DUTY_MAPS[0];
const spatial: SpatialAssetMap = SPATIAL_ASSET_MAPS[0];
void active; void spatial; void MAP_CALIBRATIONS; void MAP_CALIBRATION_VERSION;
getMapZones('de_mirage'); getMapNav('de_nuke'); getMapRoutes('de_nuke');
loadCalloutGrid('de_nuke'); void loadCalloutGridBrowser('de_nuke');
hasMapTri('de_nuke'); getMapTri('de_nuke');
`);
  writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    strict: true, noEmit: true, module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022", lib: ["ES2022", "DOM"], types: [], skipLibCheck: false,
  }, include: ["consumer.ts"] }));
  command("pnpm", ["exec", "tsc", "--project", join(consumer, "tsconfig.json")]);
  console.log("Packed maps: strict NodeNext declaration consumer passed");
  // A new Node process avoids the root import's module cache masking asset dependencies.
  for (const directory of ["map-zones", "map-routes", "map-nav", "callout-grid"]) {
    rmSync(join(installed, directory), { recursive: true, force: true });
  }
  writeFileSync(join(consumer, "isolated.mjs"), `
import assert from 'node:assert/strict';
import { MAP_CALIBRATIONS, MAP_CALIBRATION_VERSION, getMapCalibration, worldToRadar, levelAt, hasLowerLevel } from '@cs2dak/maps/calibration';
assert.equal(Object.keys(MAP_CALIBRATIONS).length, 10);
assert.equal(MAP_CALIBRATION_VERSION, '2');
const train = getMapCalibration('de_train');
assert.ok(hasLowerLevel(train));
assert.equal(levelAt(-51, train), 'lower');
assert.equal(levelAt(-50, train), 'upper');
const origin = worldToRadar({ x: train.posX, y: train.posY }, train);
assert.ok(origin.x === 0 && origin.y === 0 && !origin.outOfBounds);
assert.equal(getMapCalibration('unknown'), null);
console.log('Packed maps: calibration imports and calls pass with every spatial asset directory removed');
`);
  command(process.execPath, [join(consumer, "isolated.mjs")], { cwd: consumer });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
