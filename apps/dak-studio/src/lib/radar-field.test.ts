import { RADAR_FIELD_BASES, type RadarField, type RadarFieldBase } from "@cs2dak/contract";
import { aggregateRadarFields } from "@cs2dak/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildScopeRadarFields } from "./radar-field";

const state = vi.hoisted(() => ({
  blobs: new Map<string, Map<string, ArrayBuffer>>(),
  fieldsById: new Map<string, RadarField[]>(),
  workerCalls: [] as string[],
}));

vi.mock("./storage", () => ({
  getStorage: () => ({
    records: () => ({
      get: async () => undefined,
      getAll: async () => [],
      entries: async () => [],
      keys: async () => [],
      put: async () => undefined,
      delete: async () => undefined,
      deleteByPrefix: async () => undefined,
    }),
    blobs: (namespace: string) => ({
      get: async (key: string) => state.blobs.get(namespace)?.get(key),
      put: async (key: string, bytes: ArrayBuffer) => {
        let store = state.blobs.get(namespace);
        if (!store) {
          store = new Map();
          state.blobs.set(namespace, store);
        }
        store.set(key, bytes);
      },
      delete: async (key: string) => {
        state.blobs.get(namespace)?.delete(key);
      },
      keys: async () => [...(state.blobs.get(namespace)?.keys() ?? [])],
      deleteByPrefix: async (prefix: string) => {
        const store = state.blobs.get(namespace);
        if (!store) return;
        for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
      },
    }),
  }),
}));

vi.mock("./library", () => ({
  radarFieldInWorker: async (_buffer: ArrayBuffer, matchId: string) => {
    state.workerCalls.push(matchId);
    return state.fieldsById.get(matchId) ?? [];
  },
}));

function makeRows(seed: number): Int32Array[] {
  return [
    new Int32Array([seed, seed + 1]),
    new Int32Array([seed + 2, seed + 3]),
  ];
}

function makeField(matchId: string, team: string, seed: number): RadarField {
  const fields = {} as Record<RadarFieldBase, Int32Array[]>;
  RADAR_FIELD_BASES.forEach((base, index) => {
    fields[base] = makeRows(seed + index * 10);
  });
  return {
    schemaVersion: 1,
    computeVersion: 2,
    mapName: "de_ancient",
    calibrationVersion: "test",
    triAvailability: "none",
    scope: { kind: "team", team, economy: "gun", roundCount: 2, matchIds: [matchId] },
    grid: { cellSize: 100, cells: [[0, 0, 0], [100, 0, 0]] },
    maxSec: 2,
    denomCt: new Int32Array([seed, seed + 1]),
    denomT: new Int32Array([seed + 2, seed + 3]),
    fields,
  };
}

function expectSameField(actual: RadarField | null, expected: RadarField | null): void {
  expect(actual).not.toBeNull();
  expect(expected).not.toBeNull();
  expect(actual!.scope.roundCount).toBe(expected!.scope.roundCount);
  expect(new Set(actual!.scope.matchIds)).toEqual(new Set(expected!.scope.matchIds));
  expect([...actual!.denomCt]).toEqual([...expected!.denomCt]);
  expect([...actual!.denomT]).toEqual([...expected!.denomT]);
  for (const base of RADAR_FIELD_BASES) {
    for (let s = 0; s < actual!.maxSec; s++) {
      expect([...actual!.fields[base][s]!]).toEqual([...expected!.fields[base][s]!]);
    }
  }
}

describe("buildScopeRadarFields", () => {
  beforeEach(() => {
    state.blobs.clear();
    state.fieldsById.clear();
    state.workerCalls = [];
    state.blobs.set("demos", new Map([
      ["m1", new ArrayBuffer(1)],
      ["m2", new ArrayBuffer(1)],
    ]));
  });

  it("同一批 match 一次加载即可产出赛事基线和队伍场，并可复用持久化缓存", async () => {
    const m1 = [makeField("m1", "A", 1), makeField("m1", "B", 100)];
    const m2 = [makeField("m2", "A", 1000), makeField("m2", "C", 10000)];
    state.fieldsById.set("m1", m1);
    state.fieldsById.set("m2", m2);

    const first = await buildScopeRadarFields({
      matchIds: ["m1", "m2"],
      team: { name: "A", includeTeam: (raw) => raw === "A" },
    });

    expect(state.workerCalls).toEqual(["m1", "m2"]);
    expectSameField(first.league, aggregateRadarFields([...m1, ...m2], { kind: "league", team: null }));
    expectSameField(first.team, aggregateRadarFields([m1[0]!, m2[0]!], { kind: "team", team: "A" }));

    state.workerCalls = [];
    await Promise.resolve();
    const second = await buildScopeRadarFields({
      matchIds: ["m1", "m2"],
      team: { name: "A", includeTeam: (raw) => raw === "A" },
    });

    expect(state.workerCalls).toEqual([]);
    expectSameField(second.league, first.league);
    expectSameField(second.team, first.team);
  });
});
