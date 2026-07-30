import type { EvidenceRef } from "@cs2dak/contract";
import type { AnalysisFinding } from "@cs2dak/presentation";
import { getStorage, type RecordStore } from "./storage";
import type { FindingSnapshotV1 } from "./finding-snapshot";

/** 用户明确确认的个人复盘重点；独立于可删除、可重建的 facts。 */
export interface TrainingFocus {
  id: string;
  playerKey: string;
  finding: Pick<AnalysisFinding, "key" | "capability" | "title" | "statement" | "sample" | "baseline" | "basis" | "limitations" | "producerVersion" | "origin">;
  snapshot?: FindingSnapshotV1;
  origin?: "system" | "user";
  evidence: EvidenceRef[];
  contextSummary: string;
  note: string;
  reviewCondition: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTrainingFocusInput {
  playerKey: string;
  finding: TrainingFocus["finding"];
  snapshot?: FindingSnapshotV1;
  origin?: "system" | "user";
  evidence: EvidenceRef[];
  contextSummary: string;
  note?: string;
  reviewCondition?: string;
}

export interface TrainingFocusStore {
  list(playerKey?: string): Promise<TrainingFocus[]>;
  create(input: CreateTrainingFocusInput): Promise<TrainingFocus>;
  update(id: string, patch: Pick<TrainingFocus, "note" | "reviewCondition">): Promise<TrainingFocus | null>;
  remove(id: string): Promise<void>;
}

function newId(): string {
  return `training:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function createTrainingFocusStore(records: RecordStore): TrainingFocusStore {
  return {
    async list(playerKey) {
      const items = await records.getAll<TrainingFocus>();
      return items
        .filter((item) => !playerKey || item.playerKey === playerKey)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async create(input) {
      const now = Date.now();
      const focus: TrainingFocus = {
        id: newId(),
        playerKey: input.playerKey,
        finding: { ...input.finding },
        snapshot: input.snapshot ? structuredClone(input.snapshot) : undefined,
        origin: input.origin ?? "system",
        evidence: input.evidence.map((evidence) => ({ ...evidence })),
        contextSummary: input.contextSummary,
        note: input.note?.trim() ?? "",
        reviewCondition: input.reviewCondition?.trim() ?? "",
        createdAt: now,
        updatedAt: now,
      };
      await records.put(focus.id, focus);
      return focus;
    },
    async update(id, patch) {
      const current = await records.get<TrainingFocus>(id);
      if (!current) return null;
      const next: TrainingFocus = {
        ...current,
        note: patch.note.trim(),
        reviewCondition: patch.reviewCondition.trim(),
        updatedAt: Date.now(),
      };
      await records.put(id, next);
      return next;
    },
    async remove(id) {
      await records.delete(id);
    },
  };
}

const trainingFocusStore = createTrainingFocusStore(getStorage().records("training-focus"));

export const listTrainingFocus = trainingFocusStore.list;
export const createTrainingFocus = trainingFocusStore.create;
export const updateTrainingFocus = trainingFocusStore.update;
export const removeTrainingFocus = trainingFocusStore.remove;
