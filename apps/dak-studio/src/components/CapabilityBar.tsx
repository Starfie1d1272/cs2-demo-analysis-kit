import type { CapabilityAvailability } from "../lib/capability-availability";

const LABEL = { ready: "可用", partial: "部分可用", unavailable: "不可用" } as const;

export function CapabilityBar({ availability }: { availability: CapabilityAvailability }) {
  const limitation = availability.excluded[0]?.reason
    ?? availability.dependencies.find((item) => item.available < item.totalEligible)?.label
    ?? null;
  return <div className={`stu-capability-bar stu-capability-${availability.status}`}>
    <b>{LABEL[availability.status]}</b>
    <span>{availability.eligibleMatches}/{availability.totalMatches} 场可用</span>
    <span>{availability.outputLevel === "system-finding" ? "支持系统 Finding" : "描述性观察"}</span>
    {limitation && <span>限制：{limitation}</span>}
  </div>;
}
