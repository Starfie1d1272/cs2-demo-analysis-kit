import type { CalloutGrid } from "./callout-grid.js";

export interface CalloutGridBrowserOptions {
  baseUrl?: string;
  urls?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

const CACHE = new Map<string, Promise<CalloutGrid | null>>();

export function loadCalloutGridBrowser(
  mapName: string,
  options: CalloutGridBrowserOptions = {},
): Promise<CalloutGrid | null> {
  const url = options.urls?.[mapName] ?? `${options.baseUrl ?? "./callout-grid"}/${mapName}.json`;
  const cacheKey = `${mapName}:${url}`;
  const cached = CACHE.get(cacheKey);
  if (cached) return cached;

  const fetcher = options.fetchImpl ?? globalThis.fetch;
  if (!fetcher) return Promise.resolve(null);
  const promise = fetcher(url)
    .then((response) => response.ok ? response.json() as Promise<CalloutGrid> : null)
    .catch(() => null);
  CACHE.set(cacheKey, promise);
  return promise;
}

export function clearCalloutGridBrowserCache(): void {
  CACHE.clear();
}
