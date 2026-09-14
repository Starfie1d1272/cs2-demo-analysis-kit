import {
  backfillDemoIdentities,
  rebuildFactsFromZip,
  removeDemoAnalysis,
  removeDemoStorageOnly,
  saveDemoEntry,
  matchIdForEntry,
  type StudioDemoEntry,
} from "./library";
import { replaceDemoEntryReferences as replaceSeriesEntryReferences } from "./series";

export interface LibraryIdentityRepairResult {
  backfilled: number;
  duplicateGroups: number;
  removed: number;
  rewiredSeries: number;
  errors: string[];
}

function byLatestImport(a: StudioDemoEntry, b: StudioDemoEntry): number {
  return b.importedAt - a.importedAt || a.id.localeCompare(b.id);
}

/**
 * 回填历史 raw Demo 身份、合并重复条目，并把 series 的引用收口到 survivor。
 * series 的命名空间只通过 replaceDemoEntryReferences 触碰；删除 duplicate 时不清理
 * facts，避免多个条目共享 matchId 时误删 survivor 的 facts。
 */
export async function repairDemoIdentityAndDuplicates(): Promise<LibraryIdentityRepairResult> {
  const result = await backfillDemoIdentities();
  const errors = [...result.errors];
  const groups = new Map<string, StudioDemoEntry[]>();
  for (const entry of result.entries) {
    if (!entry.demoSha256) continue;
    const rows = groups.get(entry.demoSha256) ?? [];
    rows.push(entry);
    groups.set(entry.demoSha256, rows);
  }

  const replacements = new Map<string, string>();
  const duplicateEntries: Array<{ duplicate: StudioDemoEntry; survivor: StudioDemoEntry }> = [];
  let duplicateGroups = 0;
  let removed = 0;
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    duplicateGroups += 1;
    const ordered = [...rows].sort(byLatestImport);
    const survivor = ordered[0]!;
    const duplicates = ordered.slice(1);
    const latestSource = ordered.find((entry) => entry.sourceDemPath)?.sourceDemPath ?? survivor.sourceDemPath ?? null;
    const mergedTags = [...new Set(ordered.flatMap((entry) => entry.tags ?? []))];
    await saveDemoEntry({ ...survivor, tags: mergedTags, sourceDemPath: latestSource });
    for (const duplicate of duplicates) {
      replacements.set(duplicate.id, survivor.id);
      duplicateEntries.push({ duplicate, survivor });
    }
  }

  const rewiredSeries = replacements.size > 0
    ? await replaceSeriesEntryReferences(replacements)
    : 0;
  // Series/Event references are rewritten before any duplicate storage is
  // deleted, so a failed rewrite cannot leave records pointing at missing IDs.
  for (const { duplicate, survivor } of duplicateEntries) {
    await removeDemoStorageOnly(duplicate.id);
    if (matchIdForEntry(duplicate) !== matchIdForEntry(survivor)) {
      await removeDemoAnalysis(matchIdForEntry(duplicate));
    }
    removed += 1;
  }
  // The imported ZIP is still the source of truth after duplicate deletion. Rebuild it
  // last so a duplicate with the same fileName cannot erase the survivor facts.
  for (const survivorId of new Set(replacements.values())) {
    try {
      if (!await rebuildFactsFromZip(survivorId)) errors.push(`${survivorId}：survivor ZIP 缺失，无法重建 facts`);
    } catch (error) {
      errors.push(`${survivorId}：重建 survivor facts 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    backfilled: result.backfilled,
    duplicateGroups,
    removed,
    rewiredSeries,
    errors,
  };
}
