import { useEffect, useRef, useState } from 'react';
import type { AnalysisFinding, PlayerSeasonProfile } from '@cs2dak/presentation';
import { FindingPanel } from '@cs2dak/react';
import { matchIdForEntry, type StudioDemoEntry } from '../../lib/demo-entry';
import type { OpenEvidence } from '../../lib/evidence-continuation';
import {
  createTrainingFocus,
  listTrainingFocus,
  type TrainingFocus,
} from '../../lib/training-focus';

/** 同一个观察必须有相同的结论、样本和证据；范围摘要本身不是观察身份。 */
function observationKey(
  playerKey: string,
  contextSummary: string,
  finding: TrainingFocus['finding'],
  evidence: TrainingFocus['evidence'],
): string {
  const {
    key,
    capability,
    title,
    statement,
    sample,
    baseline,
    basis,
    limitations,
    producerVersion,
    origin,
  } = finding;
  return JSON.stringify([
    playerKey,
    contextSummary,
    {
      key,
      capability,
      title,
      statement,
      sample,
      baseline,
      basis,
      limitations,
      producerVersion,
      origin,
    },
    evidence,
  ]);
}

type LoadState = {
  scope: string;
  loading: boolean;
  error: string | null;
  added: Record<string, string>;
};
export function PlayerFindingsPanel({
  findings,
  player,
  entries,
  contextSummary,
  onOpenEvidence,
  onOpenMaterials,
}: {
  findings: AnalysisFinding[];
  player: PlayerSeasonProfile;
  entries: StudioDemoEntry[];
  contextSummary: string;
  onOpenEvidence: OpenEvidence;
  onOpenMaterials: () => void;
}) {
  const keys = findings.map((finding) =>
    observationKey(player.playerKey, contextSummary, finding, finding.evidence),
  );
  const scope = JSON.stringify([player.playerKey, contextSummary, keys]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const [state, setState] = useState<LoadState>({ scope, loading: true, error: null, added: {} });
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const attempts = useRef(new Map<string, string>());
  const inFlight = useRef(new Set<string>());
  const current = state.scope === scope ? state : { scope, loading: true, error: null, added: {} };
  useEffect(() => {
    let live = true;
    setState({ scope, loading: true, error: null, added: {} });
    void listTrainingFocus(player.playerKey)
      .then((rows) => {
        if (!live) return;
        const added = Object.fromEntries(
          rows.map((row) => [
            observationKey(row.playerKey, row.contextSummary, row.finding, row.evidence),
            row.id,
          ]),
        );
        setState({ scope, loading: false, error: null, added });
      })
      .catch((reason) => {
        if (live)
          setState({
            scope,
            loading: false,
            error: reason instanceof Error ? reason.message : String(reason),
            added: {},
          });
      });
    return () => {
      live = false;
    };
  }, [scope, player.playerKey, retry]);
  const add = async (finding: AnalysisFinding, key: string) => {
    if (current.loading || current.error || current.added[key] || inFlight.current.has(key)) return;
    const id = attempts.current.get(key) ?? `training:${crypto.randomUUID()}`;
    attempts.current.set(key, id);
    inFlight.current.add(key);
    setPending((previous) => ({ ...previous, [key]: true }));
    try {
      const saved = await createTrainingFocus({
        id,
        playerKey: player.playerKey,
        finding,
        evidence: finding.evidence,
        contextSummary,
      });
      if (activeScope.current === scope)
        setState((previous) =>
          previous.scope === scope
            ? { ...previous, added: { ...previous.added, [key]: saved.id }, error: null }
            : previous,
        );
    } catch (reason) {
      if (activeScope.current === scope)
        setState((previous) =>
          previous.scope === scope
            ? { ...previous, error: reason instanceof Error ? reason.message : String(reason) }
            : previous,
        );
    } finally {
      inFlight.current.delete(key);
      setPending((previous) => ({ ...previous, [key]: false }));
    }
  };
  return (
    <section className="stu-card stu-card-wide">
      <div className="stu-section-head">
        <h3>待复核</h3>
        <button type="button" className="stu-button-sm" onClick={onOpenMaterials}>
          管理训练重点
        </button>
      </div>
      <p className="stu-dim">观察需要结合证据复核；只有明确加入才会保存训练重点。</p>
      {current.error && (
        <p role="alert">
          {current.error}{' '}
          <button type="button" className="stu-button-sm" onClick={() => setRetry((n) => n + 1)}>
            重试
          </button>
        </p>
      )}
      {findings.length === 0 ? (
        <p className="stu-muted">当前样本没有可自动提出的复盘结论。</p>
      ) : (
        findings.slice(0, 3).map((finding, index) => {
          const key = keys[index];
          return (
            <FindingPanel
              key={finding.key}
              id={`players:finding:${finding.key}`}
              finding={finding}
              onOpenEvidence={() => {
                const evidence = finding.evidence[0];
                const entry =
                  evidence && entries.find((item) => matchIdForEntry(item) === evidence.matchId);
                if (entry && evidence)
                  onOpenEvidence({
                    entryId: entry.id,
                    evidence,
                    sourceKey: `players:finding:${finding.key}`,
                    finding,
                  });
              }}
              action={
                current.added[key] ? (
                  <span>
                    <span role="status">已加入训练重点</span>{' '}
                    <button type="button" className="stu-button-sm" onClick={onOpenMaterials}>
                      查看
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="stu-button-sm"
                    disabled={current.loading || !!current.error || !!pending[key]}
                    onClick={() => void add(finding, key)}
                  >
                    {pending[key] ? '正在加入…' : '加入训练重点'}
                  </button>
                )
              }
            />
          );
        })
      )}
    </section>
  );
}
