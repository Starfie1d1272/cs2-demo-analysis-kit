import type { LineupCluster } from "@cs2dak/maps";
import { getStorage, type RecordStore } from "./storage";

/** 用户明确保存的练习点位；与可重建 lineup facts 完全分离。 */
export interface PracticeLineup {
  id: string;
  clusterId: string;
  mapName: string;
  grenade: string;
  side: "t" | "ct" | null;
  label: string;
  evidence: { entryId: string; roundNumber: number; tick: number } | null;
  practiceCommand: string | null;
  createdAt: number;
  updatedAt: number;
}

function snapshot(cluster: LineupCluster, command: string | null): PracticeLineup {
  const evidence = cluster.throws[0] ?? null;
  const id = `lineup:${cluster.mapName}:${cluster.mode}:${cluster.id}`;
  return {
    id, clusterId: cluster.id, mapName: cluster.mapName, grenade: cluster.grenade, side: cluster.side,
    label: `${cluster.mapName} · ${cluster.throwerPlaceName ?? "出手点"} → ${cluster.effectCallout ?? "落点"}`,
    evidence: evidence && { entryId: evidence.entryId, roundNumber: evidence.roundNumber, tick: evidence.tick },
    practiceCommand: command, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

export function createPracticeLineupStore(records: RecordStore) {
  return {
    async save(cluster: LineupCluster, command: string | null): Promise<PracticeLineup> {
      const next = snapshot(cluster, command);
      const current = await records.get<PracticeLineup>(next.id);
      const value = current ? { ...next, createdAt: current.createdAt } : next;
      await records.put(value.id, value);
      return value;
    },
    async list(): Promise<PracticeLineup[]> {
      return (await records.getAll<PracticeLineup>()).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async remove(id: string): Promise<void> { await records.delete(id); },
  };
}

const practiceLineupStore = createPracticeLineupStore(getStorage().records("practice-lineups"));
export const savePracticeLineup = practiceLineupStore.save;
export const listPracticeLineups = practiceLineupStore.list;
export const removePracticeLineup = practiceLineupStore.remove;
