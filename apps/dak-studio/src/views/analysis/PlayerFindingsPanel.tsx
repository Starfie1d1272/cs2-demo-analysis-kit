import { useEffect, useRef, useState } from "react";
import type { AnalysisFinding, PlayerSeasonProfile } from "@cs2dak/presentation";
import { FindingPanel } from "@cs2dak/react";
import { matchIdForEntry, type StudioDemoEntry } from "../../lib/demo-entry";
import type { OpenEvidence } from "../../lib/evidence-continuation";
import { createTrainingFocus, listTrainingFocus } from "../../lib/training-focus";

export function PlayerFindingsPanel({ findings, player, entries, contextSummary, onOpenEvidence, onOpenMaterials }: {
  findings: AnalysisFinding[]; player: PlayerSeasonProfile; entries: StudioDemoEntry[]; contextSummary: string;
  onOpenEvidence: OpenEvidence; onOpenMaterials: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const attempts = useRef(new Map<string, string>());
  const inFlight = useRef(new Set<string>());
  const scope = JSON.stringify([player.playerKey, contextSummary]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  useEffect(() => {
    let live = true;
    setLoading(true); setError(null); setAdded({});
    void listTrainingFocus(player.playerKey).then(rows => {
      if (!live) return;
      setAdded(Object.fromEntries(rows.filter(row => row.contextSummary === contextSummary).map(row => [row.finding.key, row.id])));
      setLoading(false);
    }).catch(reason => {
      if (live) { setError(reason instanceof Error ? reason.message : String(reason)); setLoading(false); }
    });
    return () => { live = false; };
  }, [player.playerKey, contextSummary, retry]);
  const add = async (finding: AnalysisFinding) => {
    const key = JSON.stringify([scope, finding.key]);
    if (loading || error || added[finding.key] || inFlight.current.has(key)) return;
    const id = attempts.current.get(key) ?? `training:${crypto.randomUUID()}`;
    attempts.current.set(key, id); inFlight.current.add(key);
    setPending(current => ({ ...current, [key]: true }));
    try {
      const saved = await createTrainingFocus({ id, playerKey: player.playerKey, finding, evidence: finding.evidence, contextSummary });
      if (activeScope.current === scope) {
        setAdded(current => ({ ...current, [finding.key]: saved.id }));
        setError(null);
      }
    } catch (reason) {
      if (activeScope.current === scope) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      inFlight.current.delete(key);
      setPending(current => ({ ...current, [key]: false }));
    }
  };
  return <section className="stu-card stu-card-wide"><div className="stu-section-head"><h3>待复核</h3><button type="button" className="stu-button-sm" onClick={onOpenMaterials}>管理训练重点</button></div>
    <p className="stu-dim">观察需要结合证据复核；只有明确加入才会保存训练重点。</p>
    {error && <p role="alert">{error} <button type="button" className="stu-button-sm" onClick={() => { setError(null); setRetry(n => n + 1); }}>重试</button></p>}
    {findings.length === 0 ? <p className="stu-muted">当前样本没有可自动提出的复盘结论。</p> : findings.slice(0, 3).map(finding => {
      const key = JSON.stringify([scope, finding.key]);
      return <FindingPanel key={finding.key} id={`players:finding:${finding.key}`} finding={finding} onOpenEvidence={() => { const evidence = finding.evidence[0]; const entry = evidence && entries.find(item => matchIdForEntry(item) === evidence.matchId); if (entry && evidence) onOpenEvidence({ entryId: entry.id, evidence, sourceKey: `players:finding:${finding.key}`, finding }); }} action={added[finding.key]
        ? <span><span role="status">已加入训练重点</span> <button type="button" className="stu-button-sm" onClick={onOpenMaterials}>查看</button></span>
        : <button type="button" className="stu-button-sm" disabled={loading || !!error || !!pending[key]} onClick={() => void add(finding)}>{pending[key] ? "正在加入…" : "加入训练重点"}</button>} />;
    })}
  </section>;
}
