import type { OpeningPatternCluster } from "@cs2dak/cohort";

export interface PlaybookPatternRow {
  id: string;
  mapName: string;
  side: string;
  name: string | null;
  basis: string;
  roundCount: number;
  winRatePercent: number | null;
  grenadeSequence: string[];
  timingHeatmap: Array<{ second: number; count: number }>;
}

export function buildPlaybookRows(
  clusters: OpeningPatternCluster[],
  names: Record<string, string> = {}
): PlaybookPatternRow[] {
  return clusters.map((cluster) => ({
    id: cluster.id,
    mapName: cluster.mapName,
    side: cluster.side,
    name: names[cluster.id] || null,
    basis: cluster.basis,
    roundCount: cluster.roundCount,
    winRatePercent: cluster.winRatePercent,
    grenadeSequence: cluster.grenadeSequence,
    timingHeatmap: cluster.grenadeSequence.map((_, index) => ({ second: (index + 1) * 5, count: 1 }))
  }));
}

export function buildAntiStratMarkdownFromPatterns(
  clusters: OpeningPatternCluster[],
  options: { opponentName?: string | null; myTeamName?: string | null; mapPool?: string[] } = {}
): string {
  const title = options.opponentName ? `# Anti-Strat：${options.opponentName}` : "# Anti-Strat";
  const lines = [
    title,
    "",
    "## 地图池",
    options.mapPool && options.mapPool.length > 0 ? `- ${options.mapPool.join(" / ")}` : "- 当前范围地图池不足，需补更多 demo。",
    "",
    "## 开局倾向"
  ];
  for (const cluster of clusters.slice(0, 10)) {
    lines.push(`- ${cluster.mapName} ${cluster.side.toUpperCase()}：${cluster.basis}，样本 ${cluster.roundCount}，胜率 ${cluster.winRatePercent ?? "—"}%`);
  }
  lines.push("", "## 道具偏好");
  const grenades = new Map<string, number>();
  for (const cluster of clusters) {
    for (const item of cluster.grenadeSequence) grenades.set(item, (grenades.get(item) ?? 0) + cluster.roundCount);
  }
  for (const [grenade, count] of [...grenades.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    lines.push(`- ${grenade}: ${count}`);
  }
  lines.push("", "## 弱点与 BP 建议");
  lines.push("- 优先复盘低胜率高频开局，并在 BP 中规避对手高频舒适图。");
  if (options.myTeamName) lines.push(`- 视角：${options.myTeamName} 教练准备稿。`);
  return lines.join("\n");
}

