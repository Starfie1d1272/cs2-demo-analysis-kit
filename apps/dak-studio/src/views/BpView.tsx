import type { SeriesVeto } from "@cs2dak/contract";

const ACTION_LABEL: Record<string, string> = { ban: "BAN", pick: "PICK", decider: "DECIDER" };
const ACTION_VERB: Record<string, string> = { ban: "removed", pick: "picked", decider: "was left over" };

function teamName(veto: SeriesVeto, teamKey: "teamA" | "teamB" | null): string | null {
  if (teamKey === "teamA") return veto.teamAName;
  if (teamKey === "teamB") return veto.teamBName;
  return null;
}

function displayMapName(mapName: string): string {
  const base = mapName.replace(/^de_/, "");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** BP 流程时间线：顺序步骤 + BAN/PICK/DECIDER 标签 + pick 图的选边注释。 */
export function BpView({ veto, matchUrl }: { veto: SeriesVeto; matchUrl?: string | null }) {
  if (veto.steps.length === 0) {
    return <p className="stu-dim">该系列赛没有录入 BP 流程。</p>;
  }
  return (
    <ol className="stu-bp-flow">
      {veto.steps.map((step) => {
        const actor = teamName(veto, step.teamKey);
        const sideChoice = step.actionType === "pick"
          ? veto.sideChoices.find((row) => row.mapName === step.mapName)
          : undefined;
        // 兼容旧赛事包中 sideChoices.teamKey 曾被写成选图方：展示层按 PICK 规则明确取对手。
        const sideChooserKey = step.actionType === "pick"
          ? step.teamKey === "teamA" ? "teamB" : step.teamKey === "teamB" ? "teamA" : null
          : sideChoice?.teamKey ?? null;
        const sideChooser = sideChoice ? teamName(veto, sideChooserKey) : null;
        return (
          <li key={step.stepOrder} className="stu-bp-step">
            <span className="stu-bp-order">{step.stepOrder}.</span>
            <span className={`stu-bp-action stu-bp-action-${step.actionType}`}>{ACTION_LABEL[step.actionType]}</span>
            {actor && <b className="stu-bp-team">{actor}</b>}
            <span className="stu-bp-verb">{ACTION_VERB[step.actionType]}</span>
            <b className="stu-bp-map">{displayMapName(step.mapName)}</b>
            {sideChoice && sideChooser && (
              <span className="stu-bp-side">→ {sideChooser} chose {sideChoice.side.toUpperCase()}</span>
            )}
          </li>
        );
      })}
      {matchUrl && (
        <a href={matchUrl} target="_blank" rel="noreferrer" className="stu-dim" style={{ fontSize: "0.8em" }}>HLTV ↗</a>
      )}
    </ol>
  );
}
