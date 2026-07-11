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

/** 旧本地 `playlist` 记录的读取兼容形状；迁移后只写 PrepItem。 */
export type PlaylistItem = PrepItem;

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

export const playlistToMarkdown = prepItemsToMarkdown;
