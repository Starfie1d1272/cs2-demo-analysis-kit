import type { CalloutGrid } from "@cs2dak/maps";
import { loadCalloutGridBrowser } from "@cs2dak/maps/callout-grid-browser";
import deAncientUrl from "../../../../packages/maps/callout-grid/de_ancient.json?url";
import deAnubisUrl from "../../../../packages/maps/callout-grid/de_anubis.json?url";
import deDust2Url from "../../../../packages/maps/callout-grid/de_dust2.json?url";
import deInfernoUrl from "../../../../packages/maps/callout-grid/de_inferno.json?url";
import deMirageUrl from "../../../../packages/maps/callout-grid/de_mirage.json?url";
import deNukeUrl from "../../../../packages/maps/callout-grid/de_nuke.json?url";
import deOverpassUrl from "../../../../packages/maps/callout-grid/de_overpass.json?url";

/** callout grid 各图的 hashed 静态资源 URL（Vite `?url`）。worker 内 fetch 需要同一份。 */
export const CALLOUT_GRID_URLS: Record<string, string> = {
  de_ancient: deAncientUrl,
  de_anubis: deAnubisUrl,
  de_dust2: deDust2Url,
  de_inferno: deInfernoUrl,
  de_mirage: deMirageUrl,
  de_nuke: deNukeUrl,
  de_overpass: deOverpassUrl,
};

const cache = new Map<string, Promise<CalloutGrid | null>>();

export function loadStudioCalloutGrid(mapName: string): Promise<CalloutGrid | null> {
  const existing = cache.get(mapName);
  if (existing) return existing;
  const promise = loadCalloutGridBrowser(mapName, { urls: CALLOUT_GRID_URLS });
  cache.set(mapName, promise);
  return promise;
}
