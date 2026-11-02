import type { AtomicStorageAdapter } from "./storage/types";
import { commitMaterialRevision, materialBaseline } from "./material-revision";
import type { EvidenceRef } from "@cs2dak/contract";
import type { AnalysisFinding } from "@cs2dak/presentation";
import { getStorage } from "./storage";

/** 用户明确确认的个人复盘重点；独立于可删除、可重建的 facts。 */
export interface TrainingFocus {
  id: string;
  playerKey: string;
  finding: Pick<AnalysisFinding, "key" | "capability" | "title" | "statement" | "sample" | "baseline" | "basis" | "limitations" | "producerVersion" | "origin">;
  evidence: EvidenceRef[];
  contextSummary: string;
  note: string;
  reviewCondition: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTrainingFocusInput {
  id: string;
  playerKey: string;
  finding: TrainingFocus["finding"];
  evidence: EvidenceRef[];
  contextSummary: string;
  note?: string;
  reviewCondition?: string;
}

function isTrainingFocus(value: unknown): value is TrainingFocus {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TrainingFocus>;
  return typeof item.id === "string" && typeof item.playerKey === "string" && !!item.finding && typeof item.finding === "object" && Array.isArray(item.evidence) && typeof item.contextSummary === "string" && typeof item.note === "string" && typeof item.reviewCondition === "string" && typeof item.createdAt === "number" && typeof item.updatedAt === "number";
}

export interface TrainingFocusStore {
  list(playerKey?: string): Promise<TrainingFocus[]>;
  create(input: CreateTrainingFocusInput): Promise<TrainingFocus>;
  update(id: string, patch: Pick<TrainingFocus, "note" | "reviewCondition">, revision: string): Promise<TrainingFocus>;
  remove(id: string, revision: string): Promise<void>;
}

export function createTrainingFocusStore(storage: AtomicStorageAdapter): TrainingFocusStore {
  const namespace = "training-focus";
  const records = storage.records(namespace);
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
        id: input.id,
        playerKey: input.playerKey,
        finding: { ...input.finding },
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
    async update(id, patch, revision) {
      const current = materialBaseline(revision, id, isTrainingFocus);
      const next: TrainingFocus = {
        ...current,
        note: patch.note.trim(),
        reviewCondition: patch.reviewCondition.trim(),
        updatedAt: Date.now(),
      };
      await commitMaterialRevision(storage, namespace, id, current, { namespace, key: id, kind: "put", value: next });
      return next;
    },
    async remove(id, revision) {
      const current = materialBaseline(revision, id, isTrainingFocus);
      await commitMaterialRevision(storage, namespace, id, current, { namespace, key: id, kind: "delete" });
    },
  };
}

const trainingFocusStore = createTrainingFocusStore(getStorage());

export const listTrainingFocus = trainingFocusStore.list;
export const createTrainingFocus = trainingFocusStore.create;
export const updateTrainingFocus = trainingFocusStore.update;
export const removeTrainingFocus = trainingFocusStore.remove;
