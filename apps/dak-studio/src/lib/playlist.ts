export interface PlaylistItem {
  id: string;
  group: string;
  matchId: string;
  mapName?: string;
  roundNumber: number;
  clusterId?: string;
  patternFingerprint?: string;
  note: string;
  addedAt?: number;
}

export function playlistToMarkdown(title: string, items: PlaylistItem[]): string {
  const groups = new Map<string, PlaylistItem[]>();
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
