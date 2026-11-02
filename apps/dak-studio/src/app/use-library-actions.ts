import { useCallback, useState } from "react";
import { bulkUpdateTags, importDemoFile, isFactsStale, listDemoEntries, rebuildFactsFromZip, removeDemo, removeDemos, updateDemoSourcePath, updateDemoTags } from "../lib/library";
import type { StudioDemoEntry } from "../lib/demo-entry";
import { detectDemBackend, exportDemToZip, fileFromNativePath, isDemFile, pickAndExportDems, pickDemPaths, triggerWindowsDropCapture, watchDemoPath, type ExportedDemoFile } from "../lib/dem";
import { parseTags } from "../lib/tags";
import { pruneOrphanSeries } from "../lib/series";
import { importEventAssetArchive } from "../lib/event-assets";
import type { BuiltinEvent } from "../lib/builtin-events";
import type { ActivityActions } from "./activity-types";
type Options = { entries: StudioDemoEntry[]; refreshEntries: () => Promise<StudioDemoEntry[]>; refreshEventRecords: () => Promise<void>; activity: ActivityActions };
type MatchDeepLink = { roundNumber: number; tick?: number };
export function useLibraryActions({ entries, refreshEntries, refreshEventRecords, activity }: Options) {
  const { tryBegin, setNotice } = activity;
  const [importTagsRaw, setImportTagsRaw] = useState("");
  const importFilesCore = useCallback(async (files: Iterable<File | ExportedDemoFile>, tags: string[] = [], initialErrors: string[] = []): Promise<StudioDemoEntry[]> => {
    const fileList = [...files];
    const items = fileList.map((item) => item instanceof File ? { file: item, sourceDemPath: null } : item);
    const zips = items.filter((item) => item.file.name.toLowerCase().endsWith(".zip"));
    const dems = items.filter((item) => isDemFile(item.file));
    if (zips.length === 0 && dems.length === 0 && initialErrors.length === 0) {
      setNotice("请选择 .dem 或 cs2-demo-format/3.x ZIP 文件");
      return [];
    }
    setNotice(null);
    let imported = 0;
    let duplicates = 0;
    const errors: string[] = [...initialErrors];
    const importedEntries: StudioDemoEntry[] = [];

    try {
    // .dem 先经 exporter 转 ZIP（数据库只存 ZIP）
    if (dems.length > 0) {
      const backend = await detectDemBackend();
      for (const [index, demItem] of dems.entries()) {
        const dem = demItem.file;
        try {
          setNotice(`正在导出 ${dem.name}…（${index + 1}/${dems.length}，demo 解析需要一点时间）`);
          zips.push(await exportDemToZip(dem, backend, setNotice));
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
    }

    // 解析 + facts 抽取都在 worker 池里跑；滑动窗口并发让批量导入并行、且不冻结 UI。
    // 并发 2：每场 worker 要驻留一份完整 DemoPackage（含 replay），并发过高会让多份大包
    // 同时占用 + 多个 worker 同时冷启动模块图，撑爆渲染器；2 兼顾吞吐与内存安全。
    const IMPORT_CONCURRENCY = 2;
    const total = zips.length;
    const queue = [...zips];
    let done = 0;
    const runWorker = async (): Promise<void> => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          const result = await importDemoFile(item.file, { tags, sourceDemPath: item.sourceDemPath });
          importedEntries.push(result.entry);
          if (result.duplicate) duplicates += 1;
          else imported += 1;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        } finally {
          done += 1;
          if (total > 1) setNotice(`正在入库…（${done}/${total}）`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, total) }, () => runWorker()));
    await refreshEntries();
    const parts: string[] = [];
    if (imported > 0) parts.push(`导入 ${imported} 场`);
    if (duplicates > 0) parts.push(`跳过重复 ${duplicates} 场`);
    if (errors.length > 0) parts.push(`失败 ${errors.length} 场（${errors[0]}）`);
    setNotice(parts.join("，") || null);
    return importedEntries;
    } catch (error) {
      setNotice(`导入失败：${error instanceof Error ? error.message : String(error)}`);
      return importedEntries;
    }
  }, [refreshEntries, setNotice]);

  const importFiles = useCallback(async (files: Iterable<File | ExportedDemoFile>, tags: string[] = [], errors: string[] = []) => {
    const release = tryBegin();
    if (!release) return [];
    try { return await importFilesCore(files, tags, errors); } finally { release(); }
  }, [tryBegin, importFilesCore]);

  // 桌面壳：原生文件对话框选 .dem/.zip → 本机 exporter 转 ZIP → 入库
  const importViaNativeDialog = useCallback(async () => {
    const release = tryBegin();
    if (!release) return;
    setNotice(null);
    try {
      const { files, errors, cancelled } = await pickAndExportDems(setNotice);
      if (cancelled) {
        setNotice(null); // 用户取消了对话框
        return;
      }
      await importFilesCore(files, parseTags(importTagsRaw), errors);
    } catch (err) {
      setNotice(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      release();
    }
  }, [importFilesCore, importTagsRaw, tryBegin]);

  /** pywebview 桌面壳提供原生对话框，由 LibraryView 条件展示。 */
  const nativeImportAvailable = typeof window.pywebview?.api?.pick_dems === "function";

  // 载入一个内置赛事/示例：拉随包 event-package zip，走与在线/cologne 完全相同的导入路径
  // （importEventAssetArchive：逐图导入 demo + 建立赛事/系列/BP）。BP 已写在包里，无需回填。
  const loadBuiltinEvent = useCallback(async (builtin: BuiltinEvent) => {
    const release = tryBegin();
    if (!release) return;
    setNotice(null);
    try {
      const response = await fetch(builtin.packageUrl);
      const bytes = await response.arrayBuffer();
      const existing = await listDemoEntries();
      const result = await importEventAssetArchive(bytes, existing, builtin.slug, { onProgress: setNotice });
      await refreshEntries();
      await refreshEventRecords();
      setNotice(`已载入「${result.event.event.name}」：匹配 ${result.event.matchedMaps} 图${result.errors.length ? `；${result.errors.length} 图失败` : ""}`);
    } catch (err) {
      setNotice(`载入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      release();
    }
  }, []);

  const handleLinkRawDemo = useCallback(async (entry: StudioDemoEntry) => {
    try {
      const paths = await pickDemPaths();
      const path = paths.find((candidate) => candidate.toLowerCase().endsWith(".dem")) ?? null;
      if (!path) {
        setNotice(paths.length > 0 ? "请选择 .dem 文件作为原始 demo 路径" : null);
        return;
      }
      await updateDemoSourcePath(entry.id, path);
      await refreshEntries();
      setNotice(`已关联原始 demo：${entry.fileName}`);
    } catch (err) {
      setNotice(`关联原始 demo 失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const watchRawDemo = useCallback(async (entryId: string, target?: MatchDeepLink) => {
    try {
      const entry = entries.find((row) => row.id === entryId);
      if (!entry) {
        setNotice("打开游戏失败：资料库条目不存在");
        return;
      }
      if (!entry.sourceDemPath) {
        setNotice("打开游戏失败：该条目还没有关联原始 .dem 路径");
        return;
      }
      const api = window.pywebview?.api;
      if (typeof api?.path_exists === "function" && !(await api.path_exists(entry.sourceDemPath))) {
        setNotice(`打开游戏失败：原始 demo 不存在（${entry.sourceDemPath}）`);
        return;
      }
      const result = await watchDemoPath(entry.sourceDemPath, target?.tick);
      if (result.ok) {
        setNotice(result.warning ?? `已请求 CS2 播放 ${entry.fileName}`);
      } else {
        setNotice(`打开游戏失败：${result.error}`);
      }
    } catch (err) {
      setNotice(`打开游戏失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [entries]);

  const handleRemove = useCallback(
    async (id: string) => {
      await removeDemo(id);
      const next = await refreshEntries();
      await pruneOrphanSeries(new Set(next.map((entry) => entry.id))).catch(() => 0);
      await refreshEventRecords();
    },
    []
  );

  const handleUpdateTags = useCallback(async (id: string, tags: string[]) => {
    await updateDemoTags(id, tags);
    await refreshEntries();
  }, []);

  const handleBulkUpdateTags = useCallback(async (ids: string[], add: string[], remove: string[]) => {
    await bulkUpdateTags(ids, add, remove);
    await refreshEntries();
  }, []);

  /** 单场重导核心：exporter 转 ZIP 后原地替换；调用方负责 importing 状态与错误提示。 */
  const reexportOne = useCallback(async (entry: StudioDemoEntry) => {
    if (!entry.sourceDemPath) throw new Error(`${entry.fileName}：没有记录原始 .dem 路径`);
    const api = window.pywebview?.api;
    if (typeof api?.path_exists === "function" && !(await api.path_exists(entry.sourceDemPath))) {
      throw new Error(`${entry.fileName}：原始文件不存在（${entry.sourceDemPath}）`);
    }
    const backend = await detectDemBackend();
    const demFile = fileFromNativePath(entry.sourceDemPath);
    const exported = await exportDemToZip(demFile, backend, setNotice);
    const result = await importDemoFile(exported.file, {
      tags: entry.tags,
      sourceDemPath: entry.sourceDemPath,
      replaceId: entry.id
    });
    void result;
  }, []);

  const handleReexportDemo = useCallback(async (entry: StudioDemoEntry) => {
    const release = tryBegin();
    if (!release) return;
    setNotice(`正在重新导出 ${entry.fileName}…`);
    try {
      await reexportOne(entry);
      await refreshEntries();
      setNotice(`已重新导出并替换 ${entry.fileName}`);
    } catch (err) {
      setNotice(`重新导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      release();
    }
  }, [reexportOne]);

  /** 全部重新导出：逐场串行（exporter 与内存吃不住并发），失败不打断，结束后汇总。 */
  /** 逐场串行重新导出给定条目集合（exporter 与内存吃不住并发），失败不打断，结束后汇总。 */
  const reexportEntries = useCallback(async (targets: StudioDemoEntry[]) => {
    const withPath = targets.filter((entry) => entry.sourceDemPath);
    if (withPath.length === 0) {
      setNotice("选中的条目都没有记录原始 .dem 路径，无法重新导出");
      return;
    }
    if (!window.confirm(`将重新导出 ${withPath.length} 场 demo（逐场进行，可能需要较长时间），继续？`)) return;
    const release = tryBegin();
    if (!release) return;
    try {
    let done = 0;
    const failures: string[] = [];
    for (const [index, entry] of withPath.entries()) {
      setNotice(`批量重新导出（${index + 1}/${withPath.length}）：${entry.fileName}…`);
      try {
        await reexportOne(entry);
        done += 1;
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
      await refreshEntries();
    }
    setNotice(
      `批量重新导出完成：成功 ${done} 场` +
        (failures.length > 0 ? `，失败 ${failures.length} 场（${failures[0]}）` : "")
    );
    } finally { release(); }
  }, [reexportOne, refreshEntries]);

  const handleReexportAll = useCallback(async () => {
    await reexportEntries(entries);
  }, [entries, reexportEntries]);

  /** 从已存 ZIP 重榨 facts（不走 .dem / cs2df）；逐场串行，失败不打断，结束汇总。 */
  const rebuildFactsForEntries = useCallback(async (targets: StudioDemoEntry[]) => {
    if (targets.length === 0) return;
    if (!window.confirm(`将用当前分析口径重建 ${targets.length} 场 facts（从已存 ZIP，无需原始 .dem），继续？`)) return;
    const release = tryBegin();
    if (!release) return;
    try {
    let done = 0;
    const failures: string[] = [];
    for (const [index, entry] of targets.entries()) {
      setNotice(`重建 facts（${index + 1}/${targets.length}）：${entry.fileName}…`);
      try {
        if (await rebuildFactsFromZip(entry.id)) done += 1;
        else failures.push(`${entry.fileName}: 原始 ZIP 缺失`);
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    await refreshEntries();
    setNotice(
      `重建完成：成功 ${done} 场` + (failures.length > 0 ? `，失败 ${failures.length} 场（${failures[0]}）` : "")
    );
    } finally { release(); }
  }, [refreshEntries]);

  const handleRebuildFacts = useCallback(async (id: string) => {
    const release = tryBegin();
    if (!release) return;
    setNotice("正在从 ZIP 重建 facts…");
    try {
      const entry = await rebuildFactsFromZip(id);
      await refreshEntries();
      setNotice(entry ? `已重建 ${entry.fileName} 的 facts` : "重建失败：原始 ZIP 缺失");
    } catch (err) {
      setNotice(`重建失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      release();
    }
  }, []);

  const handleRebuildStale = useCallback(async () => {
    await rebuildFactsForEntries(entries.filter(isFactsStale));
  }, [entries, rebuildFactsForEntries]);

  const handleRebuildSelected = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    await rebuildFactsForEntries(entries.filter((entry) => idSet.has(entry.id)));
  }, [entries, rebuildFactsForEntries]);

  const handleReexportSelected = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    await reexportEntries(entries.filter((entry) => idSet.has(entry.id)));
  }, [entries, reexportEntries]);

  const handleRemoveMany = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!window.confirm(`确认从资料库删除 ${ids.length} 场 demo？此操作不可撤销。`)) return;
    const release = tryBegin();
    if (!release) return;
    try {
      await removeDemos(ids, (done, total) => setNotice(`正在删除（${done}/${total}）…`));
      const next = await refreshEntries();
      await pruneOrphanSeries(new Set(next.map((entry) => entry.id))).catch(() => 0);
      await refreshEventRecords();
      setNotice(`已删除 ${ids.length} 场 demo`);
    } catch (err) {
      setNotice(`批量删除失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      release();
    }
  }, []);

  const importDropped = (files: FileList) => {
    const release = tryBegin();
    if (!release) return;
    try {
      triggerWindowsDropCapture(files);
      void importFilesCore(files, parseTags(importTagsRaw)).finally(release);
    } catch (error) { release(); throw error; }
  };
  return { importTagsRaw, setImportTagsRaw, importFiles, importDropped, importViaNativeDialog, nativeImportAvailable, loadBuiltinEvent, handleLinkRawDemo, watchRawDemo, handleRemove, handleRemoveMany, handleUpdateTags, handleBulkUpdateTags, handleReexportDemo, handleReexportAll, handleReexportSelected, handleRebuildFacts, handleRebuildStale, handleRebuildSelected };
}
