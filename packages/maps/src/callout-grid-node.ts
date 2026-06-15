import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CalloutGrid } from "./callout-grid.js";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const MAPS_ROOT = join(THIS_DIR, "..");
const GRID_DIR = join(MAPS_ROOT, "callout-grid");
const CACHE = new Map<string, CalloutGrid | null>();

export function loadCalloutGrid(mapName: string): CalloutGrid | null {
  const cached = CACHE.get(mapName);
  if (cached !== undefined) return cached;

  try {
    const raw = readFileSync(join(GRID_DIR, `${mapName}.json`), "utf-8");
    const grid = JSON.parse(raw) as CalloutGrid;
    CACHE.set(mapName, grid);
    return grid;
  } catch {
    CACHE.set(mapName, null);
    return null;
  }
}

export function clearCalloutGridCache(): void {
  CACHE.clear();
}
