import { getStorage, type RecordStore } from "./storage";
/** Coach 的具体用户行动条目，不是通用 Finding 仓库。 */
export interface PrepItem {
  id: string;
  group: string;
  matchId: string;
  mapName?: string;
  roundNumber: number;
  clusterId?: string;
  patternFingerprint?: string;
  source?: "tactical-pattern" | "user";
  coverage?: string;
  note: string;
  addedAt?: number;
}

export function prepItemsToMarkdown(title: string, items: PrepItem[]): string {
  const groups = new Map<string, PrepItem[]>();
  for (const item of items) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }

  const sections = [...groups.entries()].map(([group, rows]) => {
    const lines = rows.map((r) => {
      const source = [r.mapName, r.matchId, `R${r.roundNumber}`].filter(Boolean).join(" · ");
      return r.note ? `- ${source} — ${r.note}` : `- ${source}`;
    });
    return `## ${group}\n${lines.join("\n")}`;
  });

  return `# ${title}\n\n${sections.join("\n\n")}`;
}

export function createPrepItemsStore(records: RecordStore) {
  return {
    async list(): Promise<PrepItem[]> { return (await records.getAll<PrepItem>()).sort((a,b) => (a.addedAt ?? 0) - (b.addedAt ?? 0)); },
    async save(item: PrepItem): Promise<void> {
      const existing = await records.get<PrepItem>(item.id);
      await records.put(item.id, existing ? item : { ...item, source: item.source ?? "tactical-pattern", addedAt: item.addedAt ?? Date.now() });
    },
    async remove(id: string): Promise<void> { await records.delete(id); },
  };
}
const store = createPrepItemsStore(getStorage().records("prep-items"));
export const listPrepItems = store.list;
export const savePrepItem = store.save;
export const removePrepItem = store.remove;
