import type { DemoMeta } from "./demo-meta";
import type { BuiltWith } from "./analysis-manifest";

export interface StudioDemoEntry {
  id: string;
  fileName: string;
  /** Local facts/derived identity. Legacy unique filenames retain their key. */
  analysisMatchId?: string;
  importedAt: number;
  /** cs2df 写入的 raw .dem SHA-256；与本地 ZIP record id 有意分离。 */
  demoSha256: string | null;
  /** 用户标签（赛事、阶段等），导入时附加，可后续编辑。 */
  tags: string[];
  /** 本机原始 .dem 路径，仅用于桌面端重新导出；浏览器/ZIP 导入为空。 */
  sourceDemPath?: string | null;
  /** 榨 facts 时所用的 facts revision（AnalysisManifest）；缺失=历史条目，视为旧口径。 */
  builtWith?: BuiltWith;
  /** 原始 v3 ZIP 字节数（导入时记录）；用于资产占用统计，免去读全部 blob。 */
  sizeBytes?: number;
  meta: DemoMeta;
}

/** Local projection identity; historical noncolliding filenames retain their original key. */
export function matchIdForEntry(entry: Pick<StudioDemoEntry, "fileName" | "analysisMatchId">): string {
  return entry.analysisMatchId ?? entry.fileName.replace(/\.zip$/i, "");
}

/** 从 exporter 命名（YYYY-MM-DD_map_A-vs-B_x-y.zip）提取比赛日期；不匹配时返回 null。 */
export function matchDateFromFileName(fileName: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})_/.exec(fileName);
  return match ? match[1] : null;
}

/** 比赛日期统一收口：优先文件名，不命中则 fallback 到 meta.matchDate（事件包导入写入）。 */
export function entryDate(entry: Pick<StudioDemoEntry, "fileName" | "meta">): string | null {
  return matchDateFromFileName(entry.fileName) ?? entry.meta.matchDate ?? null;
}

/** 格式化为可读的比赛标签："de_mirage · 2025-03-15 · FURIA 13:9 Vitality"。消除多处的重复拼接。 */
export function formatMatchLabel(entry: StudioDemoEntry): string {
  const date = entryDate(entry);
  return [
    entry.meta.mapName,
    date,
    `${entry.meta.teamAName} ${entry.meta.teamAScore}:${entry.meta.teamBScore} ${entry.meta.teamBName}`
  ].filter(Boolean).join(" · ");
}
