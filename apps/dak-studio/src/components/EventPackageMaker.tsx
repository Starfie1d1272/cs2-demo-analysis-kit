import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { EventStage, SeriesFormat, SeriesVeto } from "@cs2dak/contract";
import { detectDemBackend, exportDemToZip, isDemFile } from "../lib/dem";
import {
  buildEventPackage,
  buildEventPackageNative,
  cleanupNativeMakerSession,
  deriveEventTeams,
  frameworkSlots,
  newStage,
  resourceFromFile,
  resourceFromNativePath,
  seriesForSlot,
  seriesSkeletonForPreset,
  startNativeMakerSession,
  stagesForPreset,
  vetoMapMismatch,
  KIND_OPTIONS,
  STAGE_TYPE_OPTIONS,
  bracketNodesForType,
  type EventMakerDraft,
  type EventPreset,
  type FrameworkSlot,
  type MakerSeriesDraft,
} from "../lib/event-maker";
import { EventFrameworkBoard, seriesInSlot, type FrameworkSelection } from "./EventFrameworkBoard";
import { VetoInputDialog } from "./VetoInputDialog";

const PRESETS: Array<{ id: EventPreset; label: string }> = [
  { id: "round_robin", label: "单循环" },
  { id: "swiss", label: "瑞士轮" },
  { id: "single_elim", label: "单败淘汰" },
  { id: "double_elim", label: "双败淘汰" },
  { id: "major", label: "Major：三阶段瑞士轮 + 单败" },
];

export function slugifyEventName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  const ascii = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (ascii) return ascii;
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `event-${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

// 草稿自动保存：只持久化录入数据（赛事框架、阶段、系列赛骨架/BP/赛制/时间），
// 不持久化附加的 .dem/ZIP（二进制不入草稿，刷新后重新附加；队伍由 demo 派生）。
const DRAFT_KEY = "dak.event-maker.draft.v2";

interface PersistedDraft {
  name: string;
  slug: string;
  kind: string;
  sourceUrl?: string;
  stages: EventStage[];
  series: MakerSeriesDraft[];
}

function loadDraft(): PersistedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      name: parsed.name ?? "",
      slug: parsed.slug || slugifyEventName(parsed.name ?? ""),
      kind: parsed.kind ?? "tournament",
      sourceUrl: parsed.sourceUrl ?? undefined,
      stages: Array.isArray(parsed.stages) && parsed.stages.length > 0 ? parsed.stages : stagesForPreset("major"),
      // 恢复时 resources 一律清空：二进制不入草稿。teamAName/teamBName 是 demo 派生缓存，一并清空。
      // matchUrl 保留（字符串，可持久化）。
      series: Array.isArray(parsed.series) ? parsed.series.map((row) => ({ ...row, status: row.status === "cancelled" ? "cancelled" : "finished", resources: [], teamAName: "", teamBName: "" })) : [],
    };
  } catch {
    return null;
  }
}

function saveDraft(draft: PersistedDraft): void {
  try {
    const stripped: PersistedDraft = {
      ...draft,
      series: draft.series.map((row) => ({ ...row, resources: [] })),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stripped));
  } catch {
    // 配额超限或禁用 localStorage 时静默降级。
  }
}

export function EventPackageMaker({ onNotice }: { onNotice: (message: string) => void }) {
  const initial = useMemo(() => loadDraft(), []);
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug || slugifyEventName(initial?.name ?? ""));
  const [kind, setKind] = useState(initial?.kind ?? "tournament");
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const [stages, setStages] = useState<EventStage[]>(initial?.stages ?? stagesForPreset("major"));
  // 无草稿时直接铺开默认 Major 框架（淘汰赛节点预建定额系列），框架板即开即用。
  const [series, setSeries] = useState<MakerSeriesDraft[]>(initial?.series ?? seriesSkeletonForPreset("major"));
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingVeto, setEditingVeto] = useState<string | null>(null);
  const [selected, setSelected] = useState<FrameworkSelection | null>(null);
  const makerSession = useRef<string | null>(null);
  const teams = useMemo(() => deriveEventTeams(series), [series]);
  const draft = useMemo<EventMakerDraft>(() => ({ slug, name, kind, sourceUrl: sourceUrl || undefined, stages, series }), [slug, name, kind, sourceUrl, stages, series]);

  useEffect(() => {
    saveDraft({ name, slug, kind, sourceUrl: sourceUrl || undefined, stages, series });
  }, [name, slug, kind, sourceUrl, stages, series]);

  useEffect(() => () => { void cleanupNativeMakerSession(makerSession.current); }, []);

  async function ensureMakerSession(): Promise<string> {
    makerSession.current ??= await startNativeMakerSession();
    if (!makerSession.current) throw new Error("桌面赛事制作桥不可用");
    return makerSession.current;
  }

  function releaseMakerSession() {
    const current = makerSession.current;
    makerSession.current = null;
    void cleanupNativeMakerSession(current);
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* 忽略 */ }
    setName("");
    setSlug("");
    setKind("tournament");
    setSourceUrl("");
    setStages(stagesForPreset("major"));
    setSeries([]);
    releaseMakerSession();
    onNotice("已清空赛事草稿");
  }

  function patchSeries(key: string, patch: Partial<MakerSeriesDraft>) {
    setSeries((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  }
  function patchStage(key: string, patch: Partial<EventStage>) {
    setStages((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  // 附加 demo：解析后队伍/地图/比分自动从 demo 取；首张 demo 决定该系列对阵。
  async function attachResources(key: string, newResources: Awaited<ReturnType<typeof resourceFromFile>>[]) {
    const row = series.find((item) => item.key === key);
    if (!row) return;
    if (row.resources.length + newResources.length > 5) {
      onNotice("每个系列赛最多附加 5 张地图");
      return;
    }
    const merged = [...row.resources, ...newResources];
    const first = merged[0];
    patchSeries(key, {
      resources: merged,
      // demo 优先：对阵从首张 demo 派生，不手填。
      teamAName: first?.teamAName ?? row.teamAName,
      teamBName: first?.teamBName ?? row.teamBName,
    });
    onNotice(`已为 ${key} 附加 ${newResources.length} 张地图（队伍/比分已从 demo 自动识别）`);
  }

  async function attachFiles(key: string, files: File[]) {
    setBusyKey(key);
    try {
      const backend = await detectDemBackend();
      const resources = [];
      for (const file of files) {
        const zip = isDemFile(file)
          ? (await exportDemToZip(file, backend, (message) => onNotice(message))).file
          : file;
        resources.push(await resourceFromFile(zip));
      }
      await attachResources(key, resources);
    } catch (error) {
      onNotice(`demo 处理失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function attachNative(key: string) {
    setBusyKey(key);
    try {
      const api = window.pywebview?.api;
      if (!api) throw new Error("桌面壳不可用");
      const paths = await api.pick_dems();
      if (paths.length === 0) return;
      const sessionId = await ensureMakerSession();
      const resources = [];
      for (const [index, path] of paths.entries()) {
        onNotice(`正在准备第 ${index + 1}/${paths.length} 图：${path.split(/[\\/]/).at(-1)}`);
        resources.push(await resourceFromNativePath(sessionId, path));
      }
      await attachResources(key, resources);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function generate() {
    if (!name.trim() || !slug.trim() || stages.length === 0 || series.length === 0) {
      onNotice("请填写赛事名、slug、至少一个阶段和一个系列赛");
      return;
    }
    if (!series.some((row) => row.resources.length > 0)) {
      onNotice("请至少为一个系列赛附加 demo；模板中的空节点不会写入资源包");
      return;
    }
    setBusyKey("__build__");
    let releaseNative = false;
    try {
      const native = await buildEventPackageNative(draft, makerSession.current);
      if (native) {
        releaseNative = true;
        if (native.path) onNotice(`赛事资源包已生成：${native.path}`);
        return;
      }
      const { blob } = await buildEventPackage(draft);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onNotice(`赛事资源包已生成：${slug}.zip`);
    } catch (error) {
      onNotice(`生成失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (releaseNative) {
        releaseMakerSession();
        setSeries((rows) => rows.map((row) => {
          const resources = row.resources.filter((resource) => !resource.nativePath);
          return { ...row, resources, teamAName: resources[0]?.teamAName ?? "", teamBName: resources[0]?.teamBName ?? "" };
        }));
      }
      setBusyKey(null);
    }
  }

  const selectedStage = selected ? stages.find((stage) => stage.key === selected.stageKey) ?? null : null;
  const selectedSlot: FrameworkSlot | null = selectedStage && selected
    ? frameworkSlots(selectedStage).find((slot) => slot.id === selected.slotId) ?? null
    : null;
  const slotSeries = selectedStage && selectedSlot ? seriesInSlot(series, selectedStage.key, selectedSlot) : [];

  function addMatchToSlot() {
    if (!selectedStage || !selectedSlot) return;
    addMatchForSlot(selectedStage.key, selectedSlot.id);
  }

  function addMatchForSlot(stageKey: string, slotId: string) {
    const stage = stages.find((row) => row.key === stageKey);
    const slot = stage ? frameworkSlots(stage).find((item) => item.id === slotId) : null;
    if (!stage || !slot) return;
    const ordinal = series.filter((row) => row.key.startsWith(`${stage.key}-${slot.id}-`)).length + 1;
    setSeries((rows) => [...rows, seriesForSlot(stage, slot, ordinal)]);
    setSelected({ stageKey, slotId });
  }

  const vetoRow = series.find((row) => row.key === editingVeto) ?? null;
  return (
    <details className="stu-card">
      <summary><b>赛事资源制作器</b></summary>
      <p className="stu-muted">选定赛制即生成赛程框架——点击框架中的任一格子（淘汰赛节点 / 瑞士轮战绩组），在下方逐场附加 1–5 张原始 .dem/v3 ZIP，队伍/地图/比分自动从 demo 识别，再录 BP，生成可导入或发布的 <code>&lt;slug&gt;.zip</code> 资源包。附加的 demo 不入草稿，刷新后需重附。</p>

      <div className="stu-veto-toolbar">
        <label>赛事名<input value={name} onChange={(event) => { setName(event.target.value); setSlug(slugifyEventName(event.target.value)); }} placeholder="Cologne Major 2026" /></label>
        <label>资源标识<input value={slug} readOnly placeholder="由赛事名自动生成" /></label>
        <label>赛事页 URL<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://www.hltv.org/results?event=8301" /></label>
        <label>类型<select value={kind} onChange={(event) => setKind(event.target.value)}>
          {KIND_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select></label>
        <label>套用模板<select value="" onChange={(event) => { if (event.target.value) { const preset = event.target.value as EventPreset; const nextStages = stagesForPreset(preset); setStages(nextStages); setSeries(seriesSkeletonForPreset(preset, nextStages)); setSelected(null); } }}>
          <option value="">— 生成阶段与系列骨架 —</option>
          {PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
      </div>

      {/* 阶段编辑：几个阶段 + 每阶段赛制（type）+ 赛制（format），与赛事框架解耦 */}
      <div className="stu-card">
        <div className="stu-header-actions">
          <b>阶段（{stages.length}）</b>
          <button className="stu-button-sm" type="button" onClick={() => setStages((rows) => [...rows, newStage(rows.length + 1)])}>添加阶段</button>
        </div>
        {stages.map((stage) => (
          <div key={stage.key} className="stu-veto-toolbar">
            <label>名称<input value={stage.name} onChange={(event) => patchStage(stage.key, { name: event.target.value })} /></label>
            <label>赛制<select value={stage.type} onChange={(event) => {
              const type = event.target.value as EventStage["type"];
              // 切赛制时一并挂上/清除对应 bracketNodes（淘汰/GSL 才有节点），否则双败/GSL 渲染不出 lane。
              patchStage(stage.key, { type, bracketNodes: bracketNodesForType(type, stage.teamCount) });
            }}>
              {STAGE_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select></label>
            <label>默认局制<select value={stage.matchFormat ?? "bo3"} onChange={(event) => patchStage(stage.key, { matchFormat: event.target.value as SeriesFormat })}>
              {(["bo1", "bo3", "bo5"] as const).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
            </select></label>
            <label>队伍数<input type="number" min={2} value={stage.teamCount} onChange={(event) => {
              const teamCount = Number(event.target.value) || 2;
              patchStage(stage.key, { teamCount, bracketNodes: bracketNodesForType(stage.type, teamCount) });
            }} /></label>
            <button className="stu-button-sm" type="button" disabled={stages.length <= 1} onClick={() => setStages((rows) => rows.filter((row) => row.key !== stage.key))}>删除</button>
          </div>
        ))}
      </div>

      {/* 赛事框架：选定赛制即成型，点击格子在下方附加 demo（免手填轮次/分组） */}
      {stages.length > 0 && <EventFrameworkBoard stages={stages} series={series} selected={selected} onSelect={setSelected} onAddMatch={addMatchForSlot} />}

      <div className="stu-header-actions">
        <button className="stu-button" type="button" disabled={busyKey != null || series.length === 0} onClick={() => void generate()}>{busyKey === "__build__" ? "打包中…" : "生成赛事资源包"}</button>
        <button className="stu-button stu-button-ghost" type="button" onClick={clearDraft}>清空草稿</button>
      </div>
      <p className="stu-muted">参赛队伍（{teams.length}，自动来自已附 demo）：{teams.join(" / ") || "—"}</p>

      {!selectedSlot && <p className="stu-muted">点击上方框架中的任一格子，在此附加该场 demo。</p>}
      {selectedStage && selectedSlot && (
        <div className="stu-header-actions">
          <b>{selectedStage.name} · {selectedSlot.label}</b>
          {(selectedSlot.kind === "bucket" || slotSeries.length === 0) && <button className="stu-button-sm" type="button" onClick={addMatchToSlot}>添加比赛</button>}
        </div>
      )}

      {slotSeries.map((row) => {
        const mismatch = vetoMapMismatch(row);
        return (
          <div key={row.key} className="stu-card">
            {/* 阶段/轮次/组别由框架槽位自动绑定，无需手填；这里只调局制与状态 */}
            <div className="stu-veto-toolbar">
              <label>局制<select value={row.format} onChange={(event) => patchSeries(row.key, { format: event.target.value as SeriesFormat, veto: null })}>{(["bo1", "bo3", "bo5"] as const).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}</select></label>
              <label>状态<select value={row.status === "cancelled" ? "cancelled" : "finished"} onChange={(event) => patchSeries(row.key, { status: event.target.value as MakerSeriesDraft["status"] })}><option value="finished">已结束</option><option value="cancelled">取消</option></select></label>
              <label>比赛 URL<input value={row.matchUrl ?? ""} onChange={(event) => patchSeries(row.key, { matchUrl: event.target.value || undefined })} placeholder="https://www.hltv.org/matches/..." /></label>
            </div>
            <p className="stu-muted">内部标识：<code>{row.key}</code> · 对阵（来自 demo）：{row.teamAName && row.teamBName ? `${row.teamAName} vs ${row.teamBName}` : "尚未附加 demo"} · 时间：{row.resources[0]?.occurredAt ? new Date(row.resources[0].occurredAt).toLocaleString("zh-CN") : "附加 demo 后自动读取文件时间"}</p>
            <div className="stu-chip-row">
              <button type="button" className="stu-button-sm" disabled={!row.teamAName} onClick={() => setEditingVeto(row.key)}>录入 BP{row.veto ? "（已填）" : ""}</button>
              {typeof window.pywebview?.api?.pick_dems === "function" && <button type="button" className="stu-button-sm" disabled={busyKey != null} onClick={() => void attachNative(row.key)}>选择 .dem / ZIP</button>}
              <label className="stu-button-sm">从文件附加<input hidden type="file" accept=".dem,.zip" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; void attachFiles(row.key, files); }} /></label>
              <button type="button" className="stu-button-sm" onClick={() => setSeries((rows) => rows.filter((item) => item.key !== row.key))}>删除系列</button>
            </div>
            <p className="stu-muted">资源 {row.resources.length}/{row.format === "bo1" ? 1 : row.format === "bo3" ? 3 : 5}：{row.resources.map((resource) => `${resource.mapName} ${resource.scoreA}:${resource.scoreB}`).join(" / ") || "尚未附加"}</p>
            {mismatch.length > 0 && <p className="stu-veto-error">BP 与 demo 不一致：{mismatch.join("；")}</p>}
          </div>
        );
      })}
      {vetoRow && <VetoInputDialog seriesId={vetoRow.key} teamAName={vetoRow.teamAName} teamBName={vetoRow.teamBName} initialFormat={vetoRow.format} initialVeto={vetoRow.veto} onClose={() => setEditingVeto(null)} onSave={(veto: SeriesVeto) => patchSeries(vetoRow.key, { veto, format: veto.format })} />}

      <details className="stu-card" style={{ marginTop: "1em" }}>
        <summary className="stu-muted">高级：从 HLTV 批量爬取赛事</summary>
        <p className="stu-muted">适用于主办方 / 高级用户从 HLTV 批量获取完整赛事数据（比赛列表 → 下载 demo → 提取 BP → 出包），全部在命令行完成。需要 Node.js + Chrome 浏览器。</p>
        <p className="stu-muted">
          <a href="https://github.com/Starfie1d1272/cs2-demo-analysis-kit/tree/main/scripts/hltv" target="_blank" rel="noreferrer">📖 查看完整教程与脚本 →</a>
        </p>
      </details>
    </details>
  );
}
