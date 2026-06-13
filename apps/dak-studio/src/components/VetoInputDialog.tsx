import { useMemo, useState } from "react";
import type { SeriesFormat, SeriesVeto, SeriesVetoStep } from "@cs2dak/contract";
import { deriveVetoSummary, mapDisplayName, SERIES_MAP_POOL, vetoSkeleton } from "../lib/series";

type TeamKey = "teamA" | "teamB";
type Side = "t" | "ct";

interface StepEdit {
  actionType: SeriesVetoStep["actionType"];
  mapName: string;
  teamKey: TeamKey | null;
  side: Side | null;
}

const ACTION_LABEL: Record<string, string> = { ban: "BAN", pick: "PICK", decider: "DECIDER" };
const FORMATS: SeriesFormat[] = ["bo1", "bo3", "bo5"];

function stepsFromVeto(veto: SeriesVeto | null, format: SeriesFormat, mapPool: string[]): StepEdit[] {
  if (veto && veto.format === format && veto.steps.length > 0) {
    return veto.steps.map((step) => ({
      actionType: step.actionType,
      mapName: step.mapName,
      teamKey: step.teamKey,
      side: step.side
    }));
  }
  void mapPool;
  return vetoSkeleton(format).map((step) => ({
    actionType: step.actionType,
    mapName: "",
    teamKey: step.teamKey,
    side: null
  }));
}

export interface VetoInputDialogProps {
  seriesId: string;
  teamAName: string;
  teamBName: string;
  initialFormat: SeriesFormat;
  initialVeto: SeriesVeto | null;
  mapPool?: string[];
  onSave: (veto: SeriesVeto) => Promise<void> | void;
  onClose: () => void;
}

/** BP 录入弹窗（对齐 RivalHub）：选 BO 格式 → 逐步选队/图/边，decider 可不选队=拼刀选边。 */
export function VetoInputDialog({
  seriesId,
  teamAName,
  teamBName,
  initialFormat,
  initialVeto,
  mapPool = SERIES_MAP_POOL,
  onSave,
  onClose
}: VetoInputDialogProps) {
  const [format, setFormat] = useState<SeriesFormat>(initialFormat);
  const [steps, setSteps] = useState<StepEdit[]>(() => stepsFromVeto(initialVeto, initialFormat, mapPool));
  const [saving, setSaving] = useState(false);

  const usedMaps = useMemo(() => new Set(steps.map((step) => step.mapName).filter(Boolean)), [steps]);
  const teamName = (key: TeamKey | null) => (key === "teamA" ? teamAName : key === "teamB" ? teamBName : "—");

  function changeFormat(next: SeriesFormat) {
    setFormat(next);
    setSteps(stepsFromVeto(initialVeto && initialVeto.format === next ? initialVeto : null, next, mapPool));
  }

  function updateStep(index: number, patch: Partial<StepEdit>) {
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function availableMaps(index: number): string[] {
    const current = steps[index]?.mapName;
    return mapPool.filter((map) => map === current || !usedMaps.has(map));
  }

  function validate(): string | null {
    if (steps.some((step) => !step.mapName)) return "每个步骤都要选图";
    if (steps.some((step) => step.actionType !== "decider" && !step.teamKey)) return "ban/pick 步骤必须指定队伍";
    if (steps.some((step) => step.actionType === "decider" && step.side && !step.teamKey)) return "decider 选了边就要指定哪队选";
    const maps = steps.map((step) => step.mapName);
    if (new Set(maps).size !== maps.length) return "地图不能重复";
    return null;
  }

  const error = validate();

  async function handleSave() {
    if (error) return;
    setSaving(true);
    const fullSteps: SeriesVetoStep[] = steps.map((step, index) => ({
      stepOrder: index + 1,
      actionType: step.actionType,
      mapName: step.mapName,
      teamKey: step.teamKey,
      side: step.side
    }));
    const veto: SeriesVeto = {
      version: "cs2-demo-analysis-kit/series-veto-0.1",
      seriesId,
      format,
      teamAName,
      teamBName,
      mapPool,
      ...deriveVetoSummary(fullSteps),
      steps: fullSteps
    };
    try {
      await onSave(veto);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stu-modal-backdrop" role="dialog" aria-modal="true" aria-label="录入 BP" onClick={onClose}>
      <div className="stu-modal" onClick={(event) => event.stopPropagation()}>
        <header className="stu-modal-head">
          <h3>BP 选图 · {teamAName} vs {teamBName}</h3>
          <button type="button" className="stu-modal-close" onClick={onClose} aria-label="关闭">✕</button>
        </header>

        <div className="stu-veto-toolbar">
          <label>
            赛制
            <select value={format} onChange={(event) => changeFormat(event.target.value as SeriesFormat)}>
              {FORMATS.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
            </select>
          </label>
          <span className="stu-muted">A = {teamAName} · B = {teamBName}</span>
        </div>

        <div className="stu-veto-steps">
          {steps.map((step, index) => (
            <div key={index} className="stu-veto-row">
              <span className="stu-veto-order">{index + 1}</span>
              <span className={`stu-veto-action stu-veto-action-${step.actionType}`}>{ACTION_LABEL[step.actionType]}</span>
              <div className="stu-veto-team">
                <button
                  type="button"
                  className={step.teamKey === "teamA" ? "stu-veto-ab stu-veto-ab-a active" : "stu-veto-ab"}
                  onClick={() => updateStep(index, { teamKey: step.teamKey === "teamA" ? null : "teamA" })}
                >A</button>
                <button
                  type="button"
                  className={step.teamKey === "teamB" ? "stu-veto-ab stu-veto-ab-b active" : "stu-veto-ab"}
                  onClick={() => updateStep(index, { teamKey: step.teamKey === "teamB" ? null : "teamB" })}
                >B</button>
              </div>
              <select
                className="stu-veto-map"
                value={step.mapName}
                onChange={(event) => updateStep(index, { mapName: event.target.value })}
              >
                <option value="">选择地图</option>
                {availableMaps(index).map((map) => <option key={map} value={map}>{mapDisplayName(map)}</option>)}
              </select>
              {step.actionType === "pick" && step.teamKey && (
                <SidePick
                  label={`→ ${teamName(step.teamKey === "teamA" ? "teamB" : "teamA")} 选边`}
                  side={step.side}
                  onChange={(side) => updateStep(index, { side })}
                />
              )}
              {step.actionType === "decider" && (
                <SidePick
                  label={step.teamKey ? `→ ${teamName(step.teamKey)} 选边` : "→ 拼刀选边"}
                  side={step.side}
                  onChange={(side) => updateStep(index, { side })}
                />
              )}
            </div>
          ))}
        </div>

        <footer className="stu-modal-foot">
          {error ? <span className="stu-veto-error">{error}</span> : <span className="stu-muted">填完即可保存</span>}
          <div className="stu-modal-actions">
            <button type="button" className="stu-button" onClick={() => setSteps(stepsFromVeto(null, format, mapPool))} disabled={saving}>重置</button>
            <button type="button" className="stu-button stu-button-primary" onClick={() => void handleSave()} disabled={!!error || saving}>保存 BP</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SidePick({
  label,
  side,
  onChange
}: {
  label: string;
  side: Side | null;
  onChange: (side: Side | null) => void;
}) {
  return (
    <span className="stu-veto-side">
      <small>{label}</small>
      <select value={side ?? ""} onChange={(event) => onChange((event.target.value || null) as Side | null)}>
        <option value="">边</option>
        <option value="t">T 方</option>
        <option value="ct">CT 方</option>
      </select>
    </span>
  );
}
