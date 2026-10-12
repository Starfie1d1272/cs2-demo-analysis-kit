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
  const state = { onManifest: null as null | ((marker: number) => void), onWrite: null as null | ((namespace: string, key: string, value: unknown) => Promise<void> | void) };
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
  loadDemoManifestFromZip: async (buffer: ArrayBuffer) => {
    const marker = new Uint8Array(buffer)[0];
    harness.state.onManifest?.(marker);
    return { demo: { hash: String(marker).repeat(64) } };
  },
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
import { backfillDemoIdentities, importDemoFile, isFactsStale, listDemoEntries, matchIdForEntry, rebuildFactsFromZip, removeDemo } from "./library";
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
  harness.records.clear(); harness.blobs.clear(); harness.state.onWrite = null; harness.state.onManifest = null;
  await backfillDemoIdentities();
});

describe("Demo replacement persistence", () => {
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

  it("allows unrelated imports to persist while one match is held", async () => {
    let release!: () => void, reached!: () => void;
    const started = new Promise<void>((resolve) => { reached = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    let delayed = false;
    harness.state.onWrite = async (namespace, key) => {
      if (namespace === "facts:lineups" && key === "game" && !delayed) { delayed = true; reached(); await held; }
    };
    const first = importDemoFile(file(1));
    await started;
    const other = await importDemoFile(file(3, "unrelated.zip"));
    expect(other.entry.fileName).toBe("unrelated.zip");
    release();
    await first;
    expect(await getFactsStore().getLineups()).toEqual([{ matchId: "game", marker: 1 }, { matchId: "unrelated", marker: 3 }]);
  });

  it("does not rewrite or delete an untouched old ZIP when a projection fails", async () => {
    const first = await importDemoFile(file(1));
    const writes: string[] = [];
    let failed = false;
    harness.state.onWrite = (namespace, key) => {
      if (namespace === `blob:demos` && key === first.entry.id) writes.push(key);
      if (namespace === "facts:lineups" && !failed) { failed = true; throw new Error("quota failed"); }
    };
    await expect(importDemoFile(file(2), { replaceId: first.entry.id })).rejects.toThrow("quota failed");
    expect(writes).toEqual([]);
    expect(new Uint8Array((await harness.adapter.blobs("demos").get(first.entry.id))!)).toEqual(new Uint8Array([1]));
  });

  it("does not report success when a new import's projection write fails", async () => {
    failOnce("facts:lineups");
    await expect(importDemoFile(file(1))).rejects.toThrow("injected");
    expect(await listDemoEntries()).toEqual([]);
    expect(await harness.adapter.blobs("demos").keys()).toEqual([]);
    expect(await getFactsStore().getLineups()).toEqual([]);
  });

  it("keeps new facts for a same-matchId replacement and clears only the old ZIP", async () => {
    const first = await importDemoFile(file(1));
    const next = await importDemoFile(file(2), { replaceId: first.entry.id });
    expect(matchIdForEntry(next.entry)).toBe("game");
    expect(await getFactsStore().getLineups()).toEqual([{ matchId: "game", marker: 2 }]);
    expect((await listDemoEntries()).map((entry) => entry.id)).toEqual([next.entry.id]);
    expect(await harness.adapter.blobs("demos").get(first.entry.id)).toBeUndefined();
  });

  it("preserves matches that share a filename prefix while removing a distinct old match", async () => {
    const first = await importDemoFile(file(1));
    await importDemoFile(file(3, "game-longer.zip"));
    const next = await importDemoFile(file(2, "new-game.zip"), { replaceId: first.entry.id });
    expect(await getFactsStore().getLineups()).toEqual([{ matchId: "game-longer", marker: 3 }, { matchId: "new-game", marker: 2 }]);
    expect((await listDemoEntries()).some((entry) => entry.id === next.entry.id)).toBe(true);
  });

  it("restores both entries and projections if old-entry cleanup fails", async () => {
    const first = await importDemoFile(file(1));
    const before = snapshot();
    failOnce("demos", first.entry.id);
    await expect(importDemoFile(file(2, "new-game.zip"), { replaceId: first.entry.id })).rejects.toThrow("injected");
    expect(snapshot()).toEqual(before);
  });

  it("restores data after cancellation during blob persistence", async () => {
    const first = await importDemoFile(file(1));
    const before = snapshot();
    const controller = new AbortController();
    harness.state.onWrite = (namespace) => {
      if (namespace === "blob:demos") { harness.state.onWrite = null; controller.abort(); }
    };
    await expect(importDemoFile(file(2), { replaceId: first.entry.id, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
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

  it("cleans the old entry when replacing it with an already imported survivor", async () => {
    const first = await importDemoFile(file(1), { tags: ["old"] });
    const survivor = await importDemoFile(file(2, "survivor.zip"), { tags: ["survivor"] });
    const replaced = await importDemoFile(file(2, "survivor.zip"), { replaceId: first.entry.id });
    expect(replaced.duplicate).toBe(true);
    expect(replaced.entry.id).toBe(survivor.entry.id);
    expect(replaced.entry.tags).toEqual(["old", "survivor"]);
    expect(await listDemoEntries()).toHaveLength(1);
    expect(await getFactsStore().getLineups()).toEqual([{ matchId: "survivor", marker: 2 }]);
  });

  it("cancels before any storage write", async () => {
    const first = await importDemoFile(file(1));
    const before = snapshot();
    const controller = new AbortController(); controller.abort();
    await expect(importDemoFile(file(2), { replaceId: first.entry.id, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(snapshot()).toEqual(before);
  });

  it("serializes identical replacement retries and leaves one survivor", async () => {
    const first = await importDemoFile(file(1));
    const [next, retry] = await Promise.all([
      importDemoFile(file(2), { replaceId: first.entry.id }),
      importDemoFile(file(2), { replaceId: first.entry.id, tags: ["retry"] }),
    ]);
    expect([next, retry].filter((result) => result.duplicate)).toHaveLength(1);
    expect(retry.entry.id).toBe(next.entry.id);
    expect(await listDemoEntries()).toHaveLength(1);
    expect(await getFactsStore().getLineups()).toEqual([{ matchId: "game", marker: 2 }]);
  });

  it("rejects a different queued replacement whose target was already removed", async () => {
    const first = await importDemoFile(file(1));
    const results = await Promise.allSettled([
      importDemoFile(file(2), { replaceId: first.entry.id }),
      importDemoFile(file(3), { replaceId: first.entry.id }),
    ]);
    const success = results.filter((result) => result.status === "fulfilled");
    expect(success).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ status: "rejected", reason: { message: "替换目标已不存在，请重新选择当前 Demo" } });
    expect(await listDemoEntries()).toHaveLength(1);
    const winner = Number(success[0].value.entry.demoSha256?.[0]);
    expect(await getFactsStore().getLineups()).toEqual([{ matchId: "game", marker: winner }]);
  });

  it("restores an existing duplicate's metadata if its update partially fails", async () => {
    const first = await importDemoFile(file(1), { tags: ["old"] });
    const before = snapshot();
    failOnce("demos");
    await expect(importDemoFile(file(1), { tags: ["new"] })).rejects.toThrow("injected");
    expect(snapshot()).toEqual(before);
    expect((await importDemoFile(file(1))).entry.tags).toEqual(first.entry.tags);
  });

  it("revalidates a queued alias survivor before checkpointing and cannot roll back another success", async () => {
    let releaseA!: () => void, releaseB!: () => void;
    let reachedA!: () => void, reachedB!: () => void, preparedB!: () => void, preparedC!: () => void;
    const aStarted = new Promise<void>((resolve) => { reachedA = resolve; });
    const bStarted = new Promise<void>((resolve) => { reachedB = resolve; });
    const bPrepared = new Promise<void>((resolve) => { preparedB = resolve; });
    const cPrepared = new Promise<void>((resolve) => { preparedC = resolve; });
    const aGate = new Promise<void>((resolve) => { releaseA = resolve; });
    const bGate = new Promise<void>((resolve) => { releaseB = resolve; });
    let heldA = false, heldB = false, raw2Preparations = 0, cFinished = false;
    harness.state.onManifest = (marker) => {
      if (marker === 2 && ++raw2Preparations === 2) preparedB();
      if (marker === 3) preparedC();
    };
    harness.state.onWrite = async (namespace, key, value) => {
      if (namespace === "facts:lineups" && key === "survivor" && !heldA) { heldA = true; reachedA(); await aGate; }
      if (namespace === "demos" && (value as { tags?: string[] } | undefined)?.tags?.includes("queued") && !heldB) {
        heldB = true; reachedB(); await bGate; throw new Error("queued metadata failed");
      }
    };
    const a = importDemoFile(file(2, "survivor.zip"));
    await aStarted;
    const b = importDemoFile(file(2, "retry.zip"), { tags: ["queued"] });
    const bResult = b.catch((error: unknown) => error);
    await bPrepared;
    // Drain the immediate mock reads so B has reserved its pre-survivor keys.
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseA();
    await a;
    await bStarted;
    const c = importDemoFile(file(3, "survivor.zip")).then((result) => { cFinished = true; return result; });
    await cPrepared;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect.soft(cFinished).toBe(false);
    releaseB();
    expect(await bResult).toMatchObject({ message: "queued metadata failed" });
    const successful = await c;
    expect((await listDemoEntries()).some((entry) => entry.id === successful.entry.id)).toBe(true);
    expect(await getFactsStore().getLineups()).toEqual([{ matchId: "survivor", marker: 2 }, { matchId: matchIdForEntry(successful.entry), marker: 3 }]);
    expect((await listDemoEntries()).find((entry) => entry.demoSha256?.startsWith("2"))?.tags).not.toContain("queued");
  });

  it("retains the original and restoration errors if the storage stays unavailable", async () => {
    const first = await importDemoFile(file(1));
    harness.state.onWrite = (namespace) => { if (namespace === "facts:lineups") throw new Error("storage unavailable"); };
    await expect(importDemoFile(file(2), { replaceId: first.entry.id })).rejects.toBeInstanceOf(AggregateError);
    harness.state.onWrite = null;
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

  it("reserves distinct projections for concurrent same-name imports", async () => {
    const results = await Promise.all([importDemoFile(file(1)), importDemoFile(file(2)), importDemoFile(file(3))]);
    expect(new Set(results.map(result => matchIdForEntry(result.entry))).size).toBe(3);
    expect((await getFactsStore().getLineups()).map(row => (row as unknown as { marker: number }).marker).sort()).toEqual([1, 2, 3]);
  });

  it("marks legacy aliases stale without deleting original ZIPs or the unowned shared facts", async () => {
    const first = await importDemoFile(file(1));
    const second = await importDemoFile(file(2));
    for (const entry of [first.entry, second.entry]) {
      const legacy = { ...entry };
      delete legacy.analysisMatchId;
      await harness.adapter.records("demos").put(entry.id, legacy);
    }
    const bytesBefore = structuredClone(harness.blobs);
    const rows = await listDemoEntries();
    expect(new Set(rows.map(matchIdForEntry)).size).toBe(2);
    expect(rows.every(isFactsStale)).toBe(true);
    expect(harness.blobs).toEqual(bytesBefore);
    expect(await getFactsStore().getLineups({ matchIds: ["game"] })).toEqual([{ matchId: "game", marker: 1 }]);
    const rebuiltFirst = await rebuildFactsFromZip(first.entry.id);
    const rebuiltSecond = await rebuildFactsFromZip(second.entry.id);
    expect(await getFactsStore().getLineups({ matchIds: [matchIdForEntry(rebuiltFirst!), matchIdForEntry(rebuiltSecond!)] })).toEqual(
      expect.arrayContaining([{ matchId: matchIdForEntry(rebuiltFirst!), marker: 1 }, { matchId: matchIdForEntry(rebuiltSecond!), marker: 2 }])
    );
    await removeDemo(first.entry.id);
    expect(matchIdForEntry((await listDemoEntries())[0]!)).toBe(matchIdForEntry(rebuiltSecond!));
    expect(await getFactsStore().getLineups({ matchIds: [matchIdForEntry(rebuiltSecond!)] })).toEqual([{ matchId: matchIdForEntry(rebuiltSecond!), marker: 2 }]);
  });

  it("restores legacy alias metadata if splitting the second entry fails", async () => {
    const first = await importDemoFile(file(1));
    const second = await importDemoFile(file(2));
    for (const entry of [first.entry, second.entry]) {
      const legacy = { ...entry }; delete legacy.analysisMatchId;
      await harness.adapter.records("demos").put(entry.id, legacy);
    }
    const before = snapshot();
    failOnce("demos", [first.entry.id, second.entry.id].sort()[1]);
    await expect(listDemoEntries()).rejects.toThrow("injected");
    expect(snapshot()).toEqual(before);
  });

  it("retired legacy match IDs cannot redirect an existing PrepItem to a third same-name demo", async () => {
    const first = await importDemoFile(file(1));
    const second = await importDemoFile(file(2));
    for (const entry of [first.entry, second.entry]) {
      const legacy = { ...entry }; delete legacy.analysisMatchId;
      await harness.adapter.records("demos").put(entry.id, legacy);
    }
    const savedReference = { matchId: "game", roundNumber: 1 };
    await listDemoEntries();
    await removeDemo(first.entry.id);
    await removeDemo(second.entry.id);
    const third = await importDemoFile(file(3));
    expect(matchIdForEntry(third.entry)).not.toBe(savedReference.matchId);
    const entryByMatchId = new Map((await listDemoEntries()).map(entry => [matchIdForEntry(entry), entry]));
    expect(entryByMatchId.get(savedReference.matchId)).toBeUndefined();
    expect(await harness.adapter.records("analysis:retired-match-ids").get("game")).toBeDefined();
  });

  it("resumes a process-interrupted alias split even when only one legacy key remains", async () => {
    const first = await importDemoFile(file(1));
    const second = await importDemoFile(file(2));
    const resumedKey = `game~${first.entry.id}`;
    // Durable state after a process stopped between the marker and metadata writes.
    await harness.adapter.records("analysis:retired-match-ids").put("game", { entryIds: [first.entry.id, second.entry.id] });
    await harness.adapter.records("demos").put(first.entry.id, { ...first.entry, analysisMatchId: resumedKey, builtWith: undefined });
    const pending = { ...second.entry }; delete pending.analysisMatchId;
    await harness.adapter.records("demos").put(second.entry.id, pending);
    const beforeBytes = structuredClone(harness.blobs);
    const reopened = await listDemoEntries();
    expect(reopened.every(isFactsStale)).toBe(true);
    expect(reopened.map(matchIdForEntry)).not.toContain("game");
    expect(harness.blobs).toEqual(beforeBytes);
    expect((await listDemoEntries()).map(matchIdForEntry)).toEqual(reopened.map(matchIdForEntry));
  });
});
