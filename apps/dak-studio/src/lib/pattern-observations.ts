import { TACTICAL_FACT_VERSION, type TacticalCluster, type TacticalRoundFact } from "@cs2dak/tactics";
import { formatTacticalClusterName as autoName } from "@cs2dak/presentation";
import { displayTeamName } from "./identity";

export function patternFingerprint(cluster: TacticalCluster): string {
  return [cluster.mapName, cluster.side, cluster.teamIdentity, cluster.economyEntry, cluster.openingSignature].join(":");
}

function normalizeTeamName(name: string | null | undefined, teamRenames: Record<string, string>): string {
  return displayTeamName(name ?? "", teamRenames).trim().toLowerCase();
}

/**
 * 按"分析主体队伍"过滤——只看该队的回合，跨其所有对手聚合（对手是抽象维度）。
 * subjectTeam 为 null 时返回全部（"全部队伍"概览）。绝不做 head-to-head 对手限制。
 */
export function filterBySubjectTeam(
  rows: TacticalRoundFact[],
  subjectTeam: string | null,
  teamRenames: Record<string, string>,
): TacticalRoundFact[] {
  if (!subjectTeam) return rows;
  const subject = normalizeTeamName(subjectTeam, teamRenames);
  return rows.filter((row) => normalizeTeamName(row.teamName, teamRenames) === subject);
}

/** 验证 site entry 子字段包含扩展口径（trajectory / entryChokeId / routeFamilyId）。 */
function hasExtendedEntryFields(entry: object): boolean {
  return Array.isArray((entry as Record<string, unknown>).trajectory) && "entryChokeId" in entry && "routeFamilyId" in entry;
}

export function isCurrentTacticalRoundFact(row: TacticalRoundFact): boolean {
  // 口径版本不符（旧 facts 无 analysisVersion / 缺 c4Route 等新字段）→ 需重建。
  if (row.analysisVersion !== TACTICAL_FACT_VERSION) return false;
  if (!row.openingPattern || typeof row.openingPattern.coarseSignature !== "string") return false;
  if (typeof row.openingPattern.detailedSignature !== "string" || !Array.isArray(row.openingPattern.evidence)) return false;
  if (!Array.isArray(row.openingPressure)) return false;
  if (!row.siteEntries?.a || !row.siteEntries.b) return false;
  if (typeof row.opponentEconomy !== "string") return false;
  if (![...row.siteEntries.a.order, ...row.siteEntries.b.order].every(hasExtendedEntryFields)) return false;
  if (!Array.isArray(row.grenades) || !Array.isArray(row.grenadeOccurrenceIds)) return false;
  if (typeof row.teamName !== "string" || typeof row.opponentName !== "string") return false;
  return row.openingPressure.every((event) =>
    event &&
    typeof event.callout === "string" &&
    typeof event.calloutLabel === "string" &&
    (event.kind === "forward" || event.kind === "deep")
  );
}

export function buildAntiStratMarkdown(clusters: TacticalCluster[], myTeamName: string | null): string {
  const mapPool = [...new Set(clusters.map((c) => c.mapName))].sort();
  const sections = mapPool.map((map) => {
    const mapClusters = clusters.filter((c) => c.mapName === map);
    const tPatterns = mapClusters.filter((c) => c.side === "t").slice(0, 5);
    const ctPatterns = mapClusters.filter((c) => c.side === "ct").slice(0, 5);
    const fmt = (cs: TacticalCluster[]) =>
      cs.map((c) => `- ${autoName(c)}（${c.roundCount} 回合，胜率 ${c.winRatePercent?.toFixed(1) ?? "—"}%）`).join("\n");
    return `## ${map}\n\n### T 方\n${fmt(tPatterns) || "暂无数据"}\n\n### CT 方\n${fmt(ctPatterns) || "暂无数据"}`;
  });
  const header = `# 备战报告${myTeamName ? `（${myTeamName}）` : ""}\n`;
  return sections.length > 0 ? `${header}\n${sections.join("\n\n")}` : `${header}\n暂无聚类数据。`;
}
