import type { PatternExplorerState } from "../../lib/pattern-page-state";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DataTable, type DataTableColumn } from "@cs2dak/react";
import { formatTacticalClusterName as autoName } from "@cs2dak/presentation";
import type { TacticalCluster, TacticalRoundFact } from "@cs2dak/tactics";
import { STUDIO_TABLE_CLASSES } from "../../components/table-styles";
import type { StudioDemoEntry } from "../../lib/demo-entry";
import type { AnalysisContext } from "../../lib/analysis-context";
import { listPatternNames, savePatternName } from "../../lib/pattern-names";
import { buildAntiStratMarkdown, patternFingerprint } from "../../lib/pattern-observations";
import { savePrepItem, type PrepItem } from "../../lib/prep-items";
import { getObservedMapPool } from "../../lib/queries/spatial-queries";
import { PatternExplorer } from "../coach/PatternExplorer";
import { MapPoolTable } from "../coach/MapPoolTable";

const SIDE_LABEL: Record<string, string> = { t: "T 方", ct: "CT 方" };

export interface PatternsThemeProps {
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
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onWatchDemo?: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onPrepSaved?: () => void;
}

/** 自动观察与人工材料相互独立；只保存用户明确命名或加入的项目。 */
export function PatternsTheme({ section, explorerState, onExplorerStateChange, clusters, facts, allFacts, entryByMatchId, analysisContext, teamRenames, subjectTeam, onOpenMatch, onWatchDemo, onPrepSaved }: PatternsThemeProps) {
  const [playbook, setPlaybook] = useState<Record<string, string>>({});
  const [namesError, setNamesError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    listPatternNames().then((rows) => { if (!cancelled) setPlaybook(rows); })
      .catch((error) => { if (!cancelled) setNamesError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, []);
  const antiMarkdown = useMemo(() => buildAntiStratMarkdown(clusters, subjectTeam), [clusters, subjectTeam]);
  return <>
    {namesError && <div className="stu-notice" role="alert">模式命名读取失败：{namesError}</div>}
      {section === "patterns" && (
        <>
          <PatternExplorer
            state={explorerState}
            onStateChange={onExplorerStateChange}
            clusters={clusters}
            facts={facts}
            entryByMatchId={entryByMatchId}
            onOpenMatch={onOpenMatch}
            onWatchDemo={onWatchDemo}
            onAddToPlaylist={async (cluster, fact) => {
              const entry = entryByMatchId.get(fact.matchId);
              const item: PrepItem = {
                id: `${cluster.id}:${fact.matchId}:${fact.roundNumber}`,
                group: autoName(cluster) || `${cluster.mapName} ${cluster.side.toUpperCase()}`,
                matchId: fact.matchId,
                mapName: fact.mapName,
                roundNumber: fact.roundNumber,
                clusterId: cluster.id,
                patternFingerprint: patternFingerprint(cluster),
                source: "tactical-pattern",
                coverage: `${cluster.roundCount} 回合 · ${cluster.mapName} · ${SIDE_LABEL[cluster.side]}`,
                note: entry ? `${entry.meta.teamAName} ${entry.meta.teamAScore}:${entry.meta.teamBScore} ${entry.meta.teamBName}` : "",
              };
              await savePrepItem(item);
              onPrepSaved?.();
            }}
          />
          <details className="stu-card stu-coach-pattern-names">
            <summary>模式命名与备注</summary>
            <PlaybookTable
              tableState={explorerState.namesTable}
              onTableStateChange={namesTable => onExplorerStateChange(current => ({ ...current, namesTable }))}
              clusters={clusters}
              playbook={playbook}
              onRename={async (patternKey, name) => {
                await savePatternName(patternKey, name);
                setPlaybook(await listPatternNames());
              }}
            />
          </details>
        </>
      )}
      {section === "anti" && (
        <>
          <MapPoolTable
            rows={getObservedMapPool(allFacts, analysisContext.roles.beneficiary?.label ?? null, analysisContext.roles.opponent?.label ?? null, teamRenames)}
            hasOwn={Boolean(analysisContext.roles.beneficiary)}
            hasOpponent={Boolean(analysisContext.roles.opponent)}
          />
          <details className="stu-card stu-coach-report-details">
            <summary>备战报告 Markdown</summary>
            <textarea className="stu-coach-report" readOnly value={antiMarkdown} />
          </details>
        </>
      )}
  </>;
}

function PlaybookTable({
  tableState, onTableStateChange,
  clusters,
  playbook,
  onRename
}: {
  tableState: import("@cs2dak/presentation").TableState;
  onTableStateChange: (state: import("@cs2dak/presentation").TableState) => void;
  clusters: TacticalCluster[];
  playbook: Record<string, string>;
  onRename: (clusterId: string, name: string) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // ref 持有 drafts 最新值，避免按键时 columns useMemo 失效重建
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  // 预计算 fingerprint，避免 name/action 两列重复计算
  const fingerprints = useMemo(
    () => new Map(clusters.map((c) => [c.id, patternFingerprint(c)] as const)),
    [clusters],
  );

  const columns = useMemo<DataTableColumn<TacticalCluster>[]>(() => [
    {
      key: "name", label: "模式名",
      render: (cluster) => {
        const key = fingerprints.get(cluster.id)!;
        const value = draftsRef.current[key] ?? playbook[key] ?? "";
        return <input className="stu-input stu-input-sm" value={value} placeholder="命名模式" onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} />;
      }
    },
    { key: "pattern", label: "打法模式", format: (c) => `${c.mapName} · ${SIDE_LABEL[c.side]} · ${autoName(c)}` },
    { key: "rounds", label: "样本", numeric: true, sortable: true, sortValue: (c) => c.roundCount, format: (c) => c.roundCount },
    {
      key: "action", label: "",
      render: (cluster) => {
        const key = fingerprints.get(cluster.id)!;
        const value = draftsRef.current[key] ?? playbook[key] ?? "";
        return <button type="button" className="stu-button-sm" onClick={() => void onRename(key, value)}>保存</button>;
      }
    },
  ], [fingerprints, playbook, onRename]);

  return (
    <div className="stu-card">
      <h3>模式命名</h3>
      <DataTable
        state={tableState} onStateChange={onTableStateChange}
        classes={STUDIO_TABLE_CLASSES}
        rows={clusters}
        rowKey={(c) => c.id}
        pageSize={20}
        paginationInfo={(total) => `${total} 个打法模式`}
        columns={columns}
      />
    </div>
  );
}
