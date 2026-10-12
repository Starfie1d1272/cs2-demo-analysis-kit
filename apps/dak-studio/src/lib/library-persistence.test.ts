import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageAdapter, RecordStore, BlobStore } from "./storage";

const harness = vi.hoisted(() => {
  const records = new Map<string, Map<string, unknown>>();
  const blobs = new Map<string, Map<string, ArrayBuffer>>();
  const rows = (namespace: string) => {
    if (!records.has(namespace)) records.set(namespace, new Map());
    return records.get(namespace)!;
  };
  const bytes = (namespace: string) => {
    if (!blobs.has(namespace)) blobs.set(namespace, new Map());
    return blobs.get(namespace)!;
  };
  const state = { onWrite: null as null | ((namespace: string, key: string, value: unknown) => Promise<void> | void) };
  const adapter: StorageAdapter = {
    records(namespace): RecordStore {
      return {
        async get<T>(key: string) { return structuredClone(rows(namespace).get(key)) as T | undefined; },
        async getAll<T>() { return structuredClone([...rows(namespace).values()]) as T[]; },
        async entries<T>() { return structuredClone([...rows(namespace).entries()]) as Array<[string, T]>; },
        async keys() { return [...rows(namespace).keys()]; },
        async put(key, value) { rows(namespace).set(key, structuredClone(value)); await state.onWrite?.(namespace, key, value); },
        async delete(key) { rows(namespace).delete(key); await state.onWrite?.(namespace, key, undefined); },
        async deleteByPrefix(prefix) { for (const key of rows(namespace).keys()) if (key.startsWith(prefix)) rows(namespace).delete(key); },
      };
    },
    blobs(namespace): BlobStore {
      return {
        async get(key) { return bytes(namespace).get(key)?.slice(0); },
        async put(key, value) { bytes(namespace).set(key, value.slice(0)); await state.onWrite?.(`blob:${namespace}`, key, value); },
        async delete(key) { bytes(namespace).delete(key); await state.onWrite?.(`blob:${namespace}`, key, undefined); },
        async keys() { return [...bytes(namespace).keys()]; },
        async deleteByPrefix(prefix) { for (const key of bytes(namespace).keys()) if (key.startsWith(prefix)) bytes(namespace).delete(key); },
      };
    },
  };
  return { records, blobs, rows, state, adapter };
});
vi.mock("./storage", () => ({ getStorage: () => harness.adapter }));
vi.mock("@cs2dak/core", () => ({
  loadDemoManifestFromZip: async (buffer: ArrayBuffer) => ({ demo: { hash: String(new Uint8Array(buffer)[0]).repeat(64) } }),
  loadDemoPackageFromZip: async (buffer: ArrayBuffer) => ({ marker: new Uint8Array(buffer)[0], match: { mapName: "de_nuke" } }),
  buildMatchRadarField: vi.fn(),
  TACTICAL_FACT_VERSION: "test", MAP_INTELLIGENCE_FACT_VERSION: "test", CORE_ANALYSIS_VERSION: "test",
}));
vi.mock("@cs2dak/maps", () => ({ buildRadarFieldGrid: vi.fn() }));
vi.mock("@cs2dak/presentation", () => ({ buildMatchWorkspaceModel: vi.fn() }));
vi.mock("./tri", () => ({ loadTriLookup: async () => null, loadMapTri: vi.fn() }));
vi.mock("./callout-grid", () => ({ CALLOUT_GRID_URLS: {}, loadStudioCalloutGrid: async () => null }));
vi.mock("./demo-meta", () => ({ metaFromPackage: () => ({ matchDate: null, mapName: "de_nuke" }) }));
vi.mock("./extract-match-facts", () => ({
  extractMatchData: (pkg: { marker: number }, { matchId }: { matchId: string }) => ({
    facts: { matchId, lineups: [{ matchId, marker: pkg.marker }], playerMatchStats: [{ matchId, playerKey: "player-1", playerName: "fixture", marker: pkg.marker }], playerWeapons: [], mechanicsSamples: [], rrSignalRows: [], tacticalRounds: [], playerPositionRounds: [], teamShapeRounds: [], teamAwpRounds: [], ctRotationRounds: [] },
    derived: { matchId, tournament: [{ matchId, row: { marker: pkg.marker } }], playerInsights: [], teamComparison: [], duels: [], openingTrails: [], utilityValue: [] },
  }),
}));
import { backfillDemoIdentities, importDemoFile, matchIdForEntry, removeDemo } from "./library";
import { getFactsStore } from "./facts-store";
import { DERIVED_MATCH_NAMESPACE } from "./derived-cache";

const file = (marker: number, name = "game.zip") => new File([new Uint8Array([marker])], name);
const snapshot = () => structuredClone({ records: harness.records, blobs: harness.blobs });
function failOnce(namespace: string, key?: string) {
  harness.state.onWrite = async (ns, rowKey) => {
    if (ns !== namespace || (key && key !== rowKey)) return;
    harness.state.onWrite = null;
    throw new Error(`injected ${namespace} write failure`);
  };
}

beforeEach(async () => {
  harness.records.clear(); harness.blobs.clear(); harness.state.onWrite = null;
  await backfillDemoIdentities();
});

describe("Library data integrity", () => {
  it.each(["facts:lineups", `${DERIVED_MATCH_NAMESPACE}:tournament`, "blob:demos", "demos"])("restores old facts, entry, ZIP and identity after %s partially writes", async (namespace) => {
    const first = await importDemoFile(file(1), { tags: ["old"] });
    const before = snapshot();
    failOnce(namespace);
    await expect(importDemoFile(file(2), { replaceId: first.entry.id, tags: ["new"] })).rejects.toThrow("injected");
    expect(snapshot()).toEqual(before);
    expect(await getFactsStore().getLineups({ matchIds: ["game"] })).toEqual([{ matchId: "game", marker: 1 }]);
    const retry = await importDemoFile(file(1));
    expect(retry.duplicate).toBe(true);
    expect(retry.entry.id).toBe(first.entry.id);
  });

  it("waits for a delayed sibling write before restoring after the first failure", async () => {
    const first = await importDemoFile(file(1));
    const before = snapshot();
    let release!: () => void;
    let reached!: () => void;
    const started = new Promise<void>((resolve) => { reached = resolve; });
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    let failed = false, held = false, settled = false;
    harness.state.onWrite = async (namespace) => {
      if (namespace === "facts:lineups" && !failed) { failed = true; throw new Error("first write failed"); }
      if (namespace === `${DERIVED_MATCH_NAMESPACE}:tournament` && !held) { held = true; reached(); await delayed; }
    };
    const pending = importDemoFile(file(2), { replaceId: first.entry.id });
    const result = pending.then(() => { settled = true; }, (error: unknown) => { settled = true; return error; });
    await started;
    expect(settled).toBe(false);
    release();
    expect(await result).toMatchObject({ message: "first write failed" });
    expect(snapshot()).toEqual(before);
  });

  it("restores old facts if cancelled while projection writes are running", async () => {
    const first = await importDemoFile(file(1));
    const before = snapshot();
    const controller = new AbortController();
    harness.state.onWrite = (namespace) => {
      if (namespace === "facts:lineups") { harness.state.onWrite = null; controller.abort(); }
    };
    await expect(importDemoFile(file(2), { replaceId: first.entry.id, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(snapshot()).toEqual(before);
  });

  it("isolates different raw demos with the same filename and deletes only their own projections", async () => {
    const first = await importDemoFile(file(1));
    const second = await importDemoFile(file(2));
    expect(first.entry.fileName).toBe(second.entry.fileName);
    expect(matchIdForEntry(second.entry)).not.toBe(matchIdForEntry(first.entry));
    expect(await getFactsStore().getLineups()).toEqual([{ matchId: "game", marker: 1 }, { matchId: matchIdForEntry(second.entry), marker: 2 }]);
    await removeDemo(first.entry.id);
    expect(await getFactsStore().getLineups()).toEqual([{ matchId: matchIdForEntry(second.entry), marker: 2 }]);
    expect(await harness.adapter.blobs("demos").get(second.entry.id)).toBeDefined();
    expect((await importDemoFile(file(2, "renamed.zip"))).entry.id).toBe(second.entry.id);
  });

  it("serializes identical replacement retries and leaves one survivor", async () => {
    const first = await importDemoFile(file(1));
    const [next, retry] = await Promise.all([
      importDemoFile(file(2), { replaceId: first.entry.id }),
      importDemoFile(file(2), { replaceId: first.entry.id, tags: ["retry"] }),
    ]);
    expect([next, retry].filter(result => result.duplicate)).toHaveLength(1);
    expect(retry.entry.id).toBe(next.entry.id);
    expect(await getFactsStore().getLineups()).toEqual([{ matchId: "game", marker: 2 }]);
  });
});
