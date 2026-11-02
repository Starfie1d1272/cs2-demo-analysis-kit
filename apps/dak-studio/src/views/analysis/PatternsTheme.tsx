import { AnalysisExportButtons } from "../../components/AnalysisExportButtons";
import { buildPatternReportAnalysisResult } from "../../lib/analysis-export-patterns";
import { listMapPoolNotes, saveMapPoolNote } from "../../lib/map-pool-notes";
import type { AnalysisExportSource } from "../../lib/analysis-export";
import type { PatternExplorerState } from "../../lib/pattern-page-state";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "@cs2dak/react";
import { formatTacticalClusterName as autoName } from "@cs2dak/presentation";
import type { TacticalCluster, TacticalRoundFact } from "@cs2dak/tactics";
import { STUDIO_TABLE_CLASSES } from "../../components/table-styles";
import type { StudioDemoEntry } from "../../lib/demo-entry";
import type { AnalysisContext } from "../../lib/analysis-context";
import { listPatternNames, savePatternName } from "../../lib/pattern-names";
import { patternFingerprint } from "../../lib/pattern-observations";
import { getObservedMapPool } from "../../lib/queries/spatial-queries";
import { PatternExplorer } from "../coach/PatternExplorer";
import { MapPoolTable } from "../coach/MapPoolTable";

const SIDE_LABEL: Record<string, string> = { t: "T 方", ct: "CT 方" };

export interface PatternsThemeProps {
  exportSource?: AnalysisExportSource | null;
  section: "patterns" | "anti";
  explorerState: PatternExplorerState;
  onExplorerStateChange: Dispatch<SetStateAction<PatternExplorerState>>;
  clusters: TacticalCluster[];
  facts: TacticalRoundFact[];
  allFacts: TacticalRoundFact[];
  entryByMatchId: Map<string, StudioDemoEntry>;
  analysisContext: AnalysisContext;
  teamRenames: Record<string, string>;
  subjectTeam: string | null;
  mode: "own" | "scout";
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
}

/** 自动观察与人工材料相互独立；模式命名由用户明确保存。 */
export function PatternsTheme({ exportSource, section, explorerState, onExplorerStateChange, clusters, facts, allFacts, entryByMatchId, analysisContext, teamRenames, subjectTeam, mode, onOpenMatch, onWatchDemo }: PatternsThemeProps) {
  const notes = useStoredDrafts(listMapPoolNotes, saveMapPoolNote);
  const names = useStoredDrafts(listPatternNames, savePatternName, true);
  const mapPool = useMemo(() => getObservedMapPool(allFacts, analysisContext.roles.beneficiary?.label ?? null, analysisContext.roles.opponent?.label ?? null, teamRenames), [allFacts, analysisContext.roles.beneficiary?.label, analysisContext.roles.opponent?.label, teamRenames]);
  return <>
    {section === "patterns" && names.error && <div className="stu-notice" role="alert">模式命名读取失败：{names.error} <button type="button" onClick={names.retry}>重试读取</button></div>}
    {section === "patterns" && names.dirty && <div className="stu-notice">模式命名尚未保存，请保存后导出。</div>}
      {section === "patterns" && (
        <>
          <PatternExplorer
            exportSource={names.ready && !names.dirty ? exportSource : null} patternNames={names.persisted}
            state={explorerState}
            onStateChange={onExplorerStateChange}
            clusters={clusters}
            facts={facts}
            entryByMatchId={entryByMatchId}
            onOpenMatch={onOpenMatch}
            onWatchDemo={onWatchDemo}
          />
          <details className="stu-card stu-coach-pattern-names">
            <summary>模式命名与备注</summary>
            <PlaybookTable
              tableState={explorerState.namesTable}
              onTableStateChange={namesTable => onExplorerStateChange(current => ({ ...current, namesTable }))}
              clusters={clusters}
              drafts={names.drafts}
              persisted={names.persisted}
              saving={names.saving}
              errors={names.errors}
              ready={names.ready}
              onChange={names.change}
              onSave={names.save}
            />
          </details>
        </>
      )}
      {section === "anti" && (
        <>
          {notes.error && <div className="stu-notice" role="alert">地图池备注读取失败，无法导出备注：{notes.error} <button type="button" onClick={notes.retry}>重试读取</button></div>}
          {notes.dirty && <div className="stu-notice">地图池备注尚未保存，请保存后导出。</div>}
          {exportSource && notes.ready && analysisContext.roles.opponent && <AnalysisExportButtons disabled={notes.dirty} capture={() => buildPatternReportAnalysisResult(exportSource, mapPool, clusters, notes.persisted, Boolean(analysisContext.roles.beneficiary), subjectTeam, mode)} />}
          <MapPoolTable ready={notes.ready} notes={notes.drafts} persisted={notes.persisted} onNotesChange={notes.change} onSave={notes.save} saving={notes.saving} errors={notes.errors}
            rows={mapPool}
            hasOwn={Boolean(analysisContext.roles.beneficiary)}
            hasOpponent={Boolean(analysisContext.roles.opponent)}
          />

        </>
      )}
  </>;
}

// The page owns both the persisted snapshot and editable drafts. Reads are only retried
// before editing starts; individual writes update the snapshot without replacing drafts.
function useStoredDrafts(load: () => Promise<Record<string, string>>, write: (key: string, value: string) => Promise<void>, trim = false) {
  const [persisted, setPersisted] = useState<Record<string, string> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void load().then(rows => { if (!cancelled) { setPersisted(rows); setDrafts(rows); } })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [load, attempt]);
  const normalize = (value: string) => trim ? value.trim() : value;
  const dirty = persisted !== null && Object.keys(drafts).some(key => normalize(drafts[key] ?? "") !== (persisted[key] ?? ""));
  const change = (key: string, value: string) => setDrafts(current => ({ ...current, [key]: value }));
  const save = (key: string) => {
    if (saving[key] || persisted === null) return;
    const value = normalize(drafts[key] ?? "");
    setSaving(current => ({ ...current, [key]: true }));
    setErrors(current => { const next = { ...current }; delete next[key]; return next; });
    void write(key, value).then(() => setPersisted(current => current && ({ ...current, [key]: value })))
      .catch(reason => setErrors(current => ({ ...current, [key]: reason instanceof Error ? reason.message : String(reason) })))
      .finally(() => setSaving(current => ({ ...current, [key]: false })));
  };
  return { persisted: persisted ?? {}, drafts, ready: persisted !== null, error, retry: () => setAttempt(n => n + 1), saving, errors, dirty: dirty || Object.values(saving).some(Boolean), change, save };
}

function PlaybookTable({ tableState, onTableStateChange, clusters, drafts, persisted, saving, errors, ready, onChange, onSave }: {
  tableState: import("@cs2dak/presentation").TableState;
  onTableStateChange: (state: import("@cs2dak/presentation").TableState) => void;
  clusters: TacticalCluster[];
  drafts: Record<string, string>;
  persisted: Record<string, string>;
  saving: Record<string, boolean>;
  errors: Record<string, string>;
  ready: boolean;
  onChange: (key: string, value: string) => void;
  onSave: (key: string) => void;
}) {
  const fingerprints = useMemo(() => new Map(clusters.map(c => [c.id, patternFingerprint(c)] as const)), [clusters]);
  const columns: DataTableColumn<TacticalCluster>[] = [
    { key: "name", label: "模式名", render: cluster => {
      const key = fingerprints.get(cluster.id)!;
      return <input className="stu-input stu-input-sm" disabled={!ready} value={drafts[key] ?? ""} placeholder="命名模式" onChange={event => onChange(key, event.target.value)} />;
    } },
    { key: "pattern", label: "打法模式", format: c => `${c.mapName} · ${SIDE_LABEL[c.side]} · ${autoName(c)}` },
    { key: "rounds", label: "样本", numeric: true, sortable: true, sortValue: c => c.roundCount, format: c => c.roundCount },
    { key: "action", label: "", render: cluster => {
      const key = fingerprints.get(cluster.id)!;
      return <><button type="button" className="stu-button-sm" disabled={!ready || saving[key] || (drafts[key] ?? "").trim() === (persisted[key] ?? "")} onClick={() => onSave(key)}>{saving[key] ? "保存中…" : errors[key] ? "重试保存" : "保存"}</button>{errors[key] && <div role="alert">保存失败，名称仍保留在此页面：{errors[key]}</div>}</>;
    } },
  ];
  return <div className="stu-card"><h3>模式命名</h3><DataTable state={tableState} onStateChange={onTableStateChange} classes={STUDIO_TABLE_CLASSES} rows={clusters} rowKey={c => c.id} pageSize={20} paginationInfo={total => `${total} 个打法模式`} columns={columns} /></div>;
}
