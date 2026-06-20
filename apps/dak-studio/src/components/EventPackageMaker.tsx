import { useMemo, useState, type ChangeEvent } from "react";
import type { SeriesFormat, SeriesVeto } from "@cs2dak/contract";
import { detectDemBackend, exportDemToZip, isDemFile, pickAndExportDems } from "../lib/dem";
import {
  buildEventPackage,
  normalizeTeamNames,
  resourceFromFile,
  stagesForPreset,
  type EventMakerDraft,
  type EventPreset,
  type MakerSeriesDraft,
} from "../lib/event-maker";
import { VetoInputDialog } from "./VetoInputDialog";

const PRESETS: Array<{ id: EventPreset; label: string }> = [
  { id: "round_robin", label: "单循环" },
  { id: "swiss", label: "瑞士轮" },
  { id: "single_elim", label: "单败淘汰" },
  { id: "double_elim", label: "双败淘汰" },
  { id: "major", label: "Major：三阶段瑞士轮 + 单败" },
];

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function newSeries(index: number, draft: Pick<EventMakerDraft, "stages" | "teams">): MakerSeriesDraft {
  return {
    key: `series-${index}`,
    stage: draft.stages[0]?.key ?? "",
    round: 1,
    entryRound: null,
    status: "scheduled",
    format: draft.stages[0]?.matchFormat ?? "bo3",
    teamAName: draft.teams[0] ?? "",
    teamBName: draft.teams[1] ?? "",
    scheduledAt: "",
    veto: null,
    resources: [],
  };
}

export function EventPackageMaker({ onNotice }: { onNotice: (message: string) => void }) {
  const [preset, setPreset] = useState<EventPreset>("round_robin");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState("tournament");
  const [teamText, setTeamText] = useState("");
  const [series, setSeries] = useState<MakerSeriesDraft[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingVeto, setEditingVeto] = useState<string | null>(null);
  const stages = useMemo(() => stagesForPreset(preset), [preset]);
  const teams = useMemo(() => normalizeTeamNames(teamText), [teamText]);
  const draft = useMemo<EventMakerDraft>(() => ({ slug, name, kind, stages, teams, series }), [slug, name, kind, stages, teams, series]);

  function patchSeries(key: string, patch: Partial<MakerSeriesDraft>) {
    setSeries((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  async function attachFiles(key: string, files: File[]) {
    const row = series.find((item) => item.key === key);
    if (!row) return;
    if (row.resources.length + files.length > 5) {
      onNotice("每个系列赛最多附加 5 张地图");
      return;
    }
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
      patchSeries(key, { resources: [...row.resources, ...resources] });
      onNotice(`已为 ${row.key} 附加 ${resources.length} 张地图`);
    } catch (error) {
      onNotice(`demo 处理失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function attachNative(key: string) {
    const row = series.find((item) => item.key === key);
    if (!row) return;
    setBusyKey(key);
    try {
      const result = await pickAndExportDems(onNotice);
      if (result.cancelled) return;
      if (result.errors.length > 0) onNotice(result.errors.join("；"));
      if (row.resources.length + result.files.length > 5) throw new Error("每个系列赛最多附加 5 张地图");
      const resources = await Promise.all(result.files.map((item) => resourceFromFile(item.file)));
      patchSeries(key, { resources: [...row.resources, ...resources] });
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function generate() {
    if (!name.trim() || !slug.trim() || teams.length < 2 || series.length === 0) {
      onNotice("请填写赛事名、slug、至少两支队伍和一个系列赛");
      return;
    }
    if (series.some((row) => !row.teamAName || !row.teamBName || row.teamAName === row.teamBName)) {
      onNotice("每个系列赛必须选择两支不同队伍");
      return;
    }
    setBusyKey("__build__");
    try {
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
      setBusyKey(null);
    }
  }

  const vetoRow = series.find((row) => row.key === editingVeto) ?? null;
  return (
    <details className="stu-card">
      <summary><b>赛事资源制作器</b></summary>
      <p className="stu-muted">创建赛事框架，逐系列录入 BP 与 1–5 场原始 .dem/v3 ZIP，生成可直接导入或发布到 R2 的赛事资源包。</p>
      <div className="stu-veto-toolbar">
        <label>赛事名<input value={name} onChange={(event) => { setName(event.target.value); if (!slug) setSlug(slugify(event.target.value)); }} placeholder="Cologne Major 2026" /></label>
        <label>slug<input value={slug} onChange={(event) => setSlug(slugify(event.target.value))} placeholder="cologne-major-2026" /></label>
        <label>类型<input value={kind} onChange={(event) => setKind(event.target.value)} placeholder="major / league" /></label>
        <label>框架<select value={preset} onChange={(event) => { setPreset(event.target.value as EventPreset); setSeries([]); }}>
          {PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
      </div>
      <p className="stu-muted">阶段：{stages.map((stage) => `${stage.name}（${stage.type}，${stage.matchFormat?.toUpperCase() ?? "—"}）`).join(" → ")}</p>
      <label>参赛队伍（每行一个，也可逗号分隔）<textarea className="stu-coach-report" value={teamText} onChange={(event) => setTeamText(event.target.value)} rows={4} /></label>
      <div className="stu-header-actions">
        <button className="stu-button stu-button-ghost" type="button" disabled={teams.length < 2} onClick={() => setSeries((rows) => [...rows, newSeries(Date.now(), { stages, teams })])}>添加系列赛</button>
        <button className="stu-button" type="button" disabled={busyKey != null || series.length === 0} onClick={() => void generate()}>{busyKey === "__build__" ? "打包中…" : "生成赛事资源包"}</button>
      </div>
      {series.map((row) => (
        <div key={row.key} className="stu-card">
          <div className="stu-veto-toolbar">
            <label>系列 key<input value={row.key} onChange={(event) => patchSeries(row.key, { key: event.target.value })} /></label>
            <label>阶段<select value={row.stage} onChange={(event) => patchSeries(row.key, { stage: event.target.value })}>{stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.name}</option>)}</select></label>
            <label>轮次<input type="number" min={1} value={row.round ?? ""} onChange={(event) => patchSeries(row.key, { round: event.target.value ? Number(event.target.value) : null })} /></label>
            <label>组别/节点<input value={row.entryRound ?? ""} onChange={(event) => patchSeries(row.key, { entryRound: event.target.value || null })} placeholder="winner-r1 / quarterfinal" /></label>
            <label>A 队<select value={row.teamAName} onChange={(event) => patchSeries(row.key, { teamAName: event.target.value, veto: null })}>{teams.map((team) => <option key={team}>{team}</option>)}</select></label>
            <label>B 队<select value={row.teamBName} onChange={(event) => patchSeries(row.key, { teamBName: event.target.value, veto: null })}>{teams.map((team) => <option key={team}>{team}</option>)}</select></label>
            <label>赛制<select value={row.format} onChange={(event) => patchSeries(row.key, { format: event.target.value as SeriesFormat, veto: null })}>{(["bo1", "bo3", "bo5"] as const).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}</select></label>
            <label>状态<select value={row.status} onChange={(event) => patchSeries(row.key, { status: event.target.value as MakerSeriesDraft["status"] })}><option value="scheduled">未开始</option><option value="in_progress">进行中</option><option value="finished">已结束</option><option value="cancelled">取消</option></select></label>
            <label>时间<input type="datetime-local" value={row.scheduledAt} onChange={(event) => patchSeries(row.key, { scheduledAt: event.target.value })} /></label>
          </div>
          <div className="stu-chip-row">
            <button type="button" className="stu-button-sm" onClick={() => setEditingVeto(row.key)}>录入 BP{row.veto ? "（已填）" : ""}</button>
            {typeof window.pywebview?.api?.pick_dems === "function" && <button type="button" className="stu-button-sm" disabled={busyKey != null} onClick={() => void attachNative(row.key)}>选择 .dem / ZIP</button>}
            <label className="stu-button-sm">从文件附加<input hidden type="file" accept=".dem,.zip" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; void attachFiles(row.key, files); }} /></label>
            <button type="button" className="stu-button-sm" onClick={() => setSeries((rows) => rows.filter((item) => item.key !== row.key))}>删除系列</button>
          </div>
          <p className="stu-muted">资源 {row.resources.length}/{row.format === "bo1" ? 1 : row.format === "bo3" ? 3 : 5}：{row.resources.map((resource) => `${resource.mapName} ${resource.scoreA}:${resource.scoreB}`).join(" / ") || "尚未附加"}</p>
        </div>
      ))}
      {vetoRow && <VetoInputDialog seriesId={vetoRow.key} teamAName={vetoRow.teamAName} teamBName={vetoRow.teamBName} initialFormat={vetoRow.format} initialVeto={vetoRow.veto} onClose={() => setEditingVeto(null)} onSave={(veto: SeriesVeto) => patchSeries(vetoRow.key, { veto, format: veto.format })} />}
    </details>
  );
}
