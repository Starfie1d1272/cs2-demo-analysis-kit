import type { CapabilityAvailability, CapabilityRepairAction } from "../lib/capability-availability";

const LABEL = { ready: "可用", partial: "部分可用", unavailable: "不可用" } as const;

const REPAIR_LABEL: Record<CapabilityRepairAction, string> = {
  "rebuild-facts": "去资料库重建 facts",
  "reimport-with-replay": "重新导入含 replay 的 ZIP",
  "reimport-with-shots": "重新导入含 shots 的 ZIP",
  "install-tri": "管理 .tri 资产",
};

export function CapabilityBar({ availability, onRepair }: { availability: CapabilityAvailability; onRepair?: (action: CapabilityRepairAction) => void }) {
  const limitation = availability.excluded[0]?.reason
    ?? availability.dependencies.find((item) => item.available < item.totalEligible)?.label
    ?? null;
  return <div className={`stu-capability-bar stu-capability-${availability.status}`}>
    <b>{LABEL[availability.status]}</b>
    <span>{availability.eligibleMatches}/{availability.totalMatches} 场可用</span>
    <span>{availability.outputLevel === "system-finding" ? "支持系统 Finding" : "描述性观察"}</span>
    {limitation && <span>限制：{limitation}</span>}
    {onRepair && availability.repairActions.map((action) => (
      <button key={action} type="button" className="stu-button-sm" onClick={() => onRepair(action)}>{REPAIR_LABEL[action]}</button>
    ))}
  </div>;
}
