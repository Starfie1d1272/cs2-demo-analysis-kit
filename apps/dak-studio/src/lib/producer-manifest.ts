import { MAP_INTELLIGENCE_FACT_VERSION, TACTICAL_FACT_VERSION } from "@cs2dak/core";
import type { StorageAdapter } from "./storage";

/**
 * 导入后的数据不是一份全局 facts，而是可独立恢复的 producer 快照。
 * manifest 只保存可见指针；candidate generation 在切换前永远不会被查询到。
 */
export type ProducerId =
  | "base-facts"
  | "duel"
  | "tactical"
  | "map-intelligence"
  | "utility"
  | "radar-field";

export type ProducerStatus = "missing" | "current" | "stale" | "failed";
export type ProducerStorageKind = "facts" | "derived";

export const PRODUCER_MANIFEST_NAMESPACE = "analysis:producer-manifests";

export const PRODUCER_REVISIONS: Record<ProducerId, string> = {
  "base-facts": "studio-base-facts/1",
  duel: "studio-duel/1",
  tactical: String(TACTICAL_FACT_VERSION),
  "map-intelligence": String(MAP_INTELLIGENCE_FACT_VERSION),
  utility: "studio-utility/1",
  "radar-field": "studio-radar-field/1",
};

export interface ProducerSnapshot {
  generation: string;
  producerRevision: string;
  sourcePackageHash: string;
  completedAt: number;
  rowCounts: Record<string, number>;
  /** 同一 producer 的 facts/derived 指针随 manifest 一起切换，避免半可见快照。 */
  storageGenerations?: Partial<Record<ProducerStorageKind, string>>;
}

export interface ProducerManifestRecord {
  matchId: string;
  producer: ProducerId;
  active?: ProducerSnapshot;
  lastAttempt?: {
    targetRevision: string;
    startedAt: number;
    finishedAt: number;
    outcome: "success" | "failed";
    error?: string;
  };
}

export interface ActivateProducerInput {
  generation: string;
  producerRevision: string;
  sourcePackageHash: string;
  rowCounts: Record<string, number>;
  storageGenerations: Partial<Record<ProducerStorageKind, string>>;
  startedAt: number;
}

function manifestKey(matchId: string, producer: ProducerId): string {
  return `${matchId}\t${producer}`;
}

export function producerGenerationKey(matchId: string, generation: string): string {
  return `${matchId}\tg:${generation}\t`;
}

export function newProducerGeneration(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function producerStatus(
  record: ProducerManifestRecord | undefined,
  sourcePackageHash: string | null | undefined,
  expectedRevision: string,
): ProducerStatus {
  const active = record?.active;
  const failedAfterActive = record?.lastAttempt?.outcome === "failed"
    && (!active || record.lastAttempt.finishedAt >= active.completedAt);
  if (!active) return failedAfterActive ? "failed" : "missing";
  if (failedAfterActive || active.sourcePackageHash !== sourcePackageHash || active.producerRevision !== expectedRevision) return "stale";
  return "current";
}

export interface ProducerManifestStore {
  get(matchId: string, producer: ProducerId): Promise<ProducerManifestRecord | undefined>;
  getForMatch(matchId: string): Promise<ProducerManifestRecord[]>;
  getAll(): Promise<ProducerManifestRecord[]>;
  activate(matchId: string, producer: ProducerId, input: ActivateProducerInput): Promise<ProducerManifestRecord>;
  fail(matchId: string, producer: ProducerId, targetRevision: string, startedAt: number, error: unknown): Promise<ProducerManifestRecord>;
  deleteMatch(matchId: string): Promise<void>;
}

export function createProducerManifestStore(adapter: StorageAdapter, namespace = PRODUCER_MANIFEST_NAMESPACE): ProducerManifestStore {
  const store = adapter.records(namespace);
  return {
    get(matchId, producer) {
      return store.get<ProducerManifestRecord>(manifestKey(matchId, producer));
    },
    async getForMatch(matchId) {
      return (await store.getByPrefix<ProducerManifestRecord>(`${matchId}\t`)).map(([, value]) => value);
    },
    getAll() {
      return store.getAll<ProducerManifestRecord>();
    },
    async activate(matchId, producer, input) {
      const key = manifestKey(matchId, producer);
      const previous = await store.get<ProducerManifestRecord>(key);
      const active: ProducerSnapshot = {
        generation: input.generation,
        producerRevision: input.producerRevision,
        sourcePackageHash: input.sourcePackageHash,
        completedAt: Date.now(),
        rowCounts: input.rowCounts,
        storageGenerations: {
          ...previous?.active?.storageGenerations,
          ...input.storageGenerations,
        },
      };
      const next: ProducerManifestRecord = {
        matchId,
        producer,
        active,
        lastAttempt: {
          targetRevision: input.producerRevision,
          startedAt: input.startedAt,
          finishedAt: active.completedAt,
          outcome: "success",
        },
      };
      await store.put(key, next);
      return next;
    },
    async fail(matchId, producer, targetRevision, startedAt, error) {
      const key = manifestKey(matchId, producer);
      const previous = await store.get<ProducerManifestRecord>(key);
      const next: ProducerManifestRecord = {
        matchId,
        producer,
        active: previous?.active,
        lastAttempt: {
          targetRevision,
          startedAt,
          finishedAt: Date.now(),
          outcome: "failed",
          error: error instanceof Error ? error.message : String(error),
        },
      };
      await store.put(key, next);
      return next;
    },
    deleteMatch(matchId) {
      return store.deleteByPrefix(`${matchId}\t`);
    },
  };
}
