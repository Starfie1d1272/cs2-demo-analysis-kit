import type { CalloutGrid } from "@cs2dak/maps";

type GridModule = { default: unknown };

const LOADERS: Record<string, () => Promise<GridModule>> = {
  de_ancient: () => import("../../../../packages/maps/callout-grid/de_ancient.json"),
  de_anubis: () => import("../../../../packages/maps/callout-grid/de_anubis.json"),
  de_dust2: () => import("../../../../packages/maps/callout-grid/de_dust2.json"),
  de_inferno: () => import("../../../../packages/maps/callout-grid/de_inferno.json"),
  de_mirage: () => import("../../../../packages/maps/callout-grid/de_mirage.json"),
  de_nuke: () => import("../../../../packages/maps/callout-grid/de_nuke.json"),
  de_overpass: () => import("../../../../packages/maps/callout-grid/de_overpass.json"),
};

const cache = new Map<string, Promise<CalloutGrid | null>>();

export function loadStudioCalloutGrid(mapName: string): Promise<CalloutGrid | null> {
  const existing = cache.get(mapName);
  if (existing) return existing;
  const loader = LOADERS[mapName];
  const promise = loader ? loader().then((mod) => mod.default as CalloutGrid) : Promise.resolve(null);
  cache.set(mapName, promise);
  return promise;
}
