import { getStorage } from "./storage";
import type { MaterialRef } from "./material-ref";

export type LastWorkTarget =
  | { kind: "match"; entryId: string; roundNumber?: number; tick?: number }
  | { kind: "saved-analysis"; queryId: string }
  | { kind: "material"; materialRef: MaterialRef };
export interface LastWork { schemaVersion: 1; openedAt: number; target: LastWorkTarget }
const key = "last-successful-work:v1";
const kv = getStorage().records("kv");
let pending = Promise.resolve();

export async function getLastWork(): Promise<LastWork | null> {
  try {
    const value = await kv.get<LastWork>(key);
    if (!value || value.schemaVersion !== 1 || !Number.isFinite(value.openedAt) || !Number.isFinite(new Date(value.openedAt).getTime()) || !value.target) return null;
    const target = value.target;
    if (target.kind === "match" && typeof target.entryId === "string" && target.entryId && (target.roundNumber === undefined || Number.isInteger(target.roundNumber)) && (target.tick === undefined || Number.isFinite(target.tick))) return value;
    if (target.kind === "saved-analysis" && typeof target.queryId === "string" && target.queryId) return value;
    if (target.kind === "material" && target.materialRef && typeof target.materialRef.id === "string" && target.materialRef.id && ["study-note", "training-focus", "prep-item", "practice-lineup", "playbook", "assignment-set", "match-sheet"].includes(target.materialRef.kind)) return value;
    return null;
  } catch { return null; }
}
export function setLastWork(target: LastWorkTarget | null): Promise<void> {
  const value: LastWork | null = target ? { schemaVersion: 1, openedAt: Date.now(), target } : null;
  pending = pending.then(async () => { if (value) await kv.put(key, value); else await kv.delete(key); }).catch(() => {});
  return pending;
}
