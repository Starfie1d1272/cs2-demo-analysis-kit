import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { StudioDemoEntry } from "../lib/demo-entry";
import { deriveCapabilityAvailability, loadCapabilityAvailabilityInputs, type CapabilityAvailability, type CapabilityRepairAction, type StudioCapability } from "../lib/capability-availability";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, invalidateAnalysisQueries } from "../lib/queries/query-cache";
import { useSyncExternalStore } from "react";

const LABEL = { ready: "可用", partial: "部分可用", unavailable: "不可用" } as const;
const DEPENDENCY = { replay: "回放轨迹", shots: "射击记录", tri: "地图碰撞资源" } as const;
const REPAIR_LABEL: Record<CapabilityRepairAction, string> = {
  "rebuild-facts": "前往比赛库维护",
  "reimport-with-replay": "前往比赛导入回放轨迹",
  "reimport-with-shots": "前往比赛导入射击记录",
  "install-tri": "管理地图碰撞资源",
};
function displayReason(reason: string): string {
  return reason.replace("facts 需要重建", "分析数据待更新").replace(/shots\/duels/g, "射击记录").replace(/replay/g, "回放轨迹").replace(/facts/g, "分析数据");
}
/** Same visible exclusions and missing dependencies can share one notice. */
export function sameCapabilityNotice(a: CapabilityAvailability | null, b: CapabilityAvailability | null): boolean {
  if (!a || !b || a.status === "ready" || b.status === "ready") return false;
  const key = (value: CapabilityAvailability) => JSON.stringify({
    status: value.status, eligible: value.eligibleMatches, total: value.totalMatches,
    excluded: value.excluded.map(item => [item.reason, [...item.entryIds].sort()]).sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    missing: value.dependencies.filter(item => item.available < item.totalEligible).map(item => [item.key, item.available, item.totalEligible, item.required]).sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    actions: [...value.repairActions].sort(),
  });
  return key(a) === key(b);
}
export function CapabilityBar({ availability, onRepair }: { availability: CapabilityAvailability; onRepair?: (action: CapabilityRepairAction) => void }) {
  const firstExclusion = availability.excluded[0];
  const firstDependency = firstExclusion ? undefined : availability.dependencies.find(item => item.available < item.totalEligible);
  const limitation = firstExclusion ? displayReason(firstExclusion.reason) : firstDependency ? `${DEPENDENCY[firstDependency.key]}不完整（${firstDependency.available}/${firstDependency.totalEligible} 场具备）` : null;
  return <div className={`stu-capability-bar stu-capability-${availability.status}`}>
    <span>{availability.eligibleMatches}/{availability.totalMatches} 场可用</span>
    {availability.status !== "ready" && <>
      <span>{LABEL[availability.status]}{limitation && `：${limitation}`}{firstExclusion && `（${firstExclusion.count} 场未纳入）`}</span>
      <details><summary>详情</summary>
        <p>覆盖单位为比赛；{availability.outputLevel === "system-finding" ? "可生成带证据的分析结论" : "提供描述性观察"}。</p>
        {availability.excluded.slice(1).map(item => <p key={item.reason}>{displayReason(item.reason)}：{item.count} 场未纳入</p>)}
        {availability.dependencies.filter(item => item !== firstDependency).map(item => <p key={item.key}>{DEPENDENCY[item.key]}：{item.available}/{item.totalEligible} 场具备{item.required ? "（必需）" : "（可选）"}</p>)}
        {(availability.repairActions.includes("reimport-with-replay") || availability.repairActions.includes("reimport-with-shots")) && <p>已有 ZIP 没有相应流时，需要从原始 demo 重新导出并导入；重建不能生成缺失的流。</p>}
      </details>
      {onRepair && availability.repairActions.map(action => <button key={action} type="button" className="stu-button-sm" onClick={() => onRepair(action)}>{REPAIR_LABEL[action]}</button>)}
    </>}
  </div>;
}

export function useCapability(entries: StudioDemoEntry[], capability: StudioCapability, playerScope?: { playerKeys: string[]; steamIds: string[] }) {
  const [result, setResult] = useState<{ key: string; revision: string; generation: number; availability: CapabilityAvailability } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const data = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const key = JSON.stringify([capability, entries.map(entry => entry.id), playerScope]);
  const revision = JSON.stringify(entries.map(entry => entry.builtWith?.factsRevision));
  const current = result?.key === key ? result.availability : null;
  const eligible = useMemo(() => {
    const excluded = new Set(current?.excluded.flatMap(item => item.entryIds) ?? []);
    return current ? entries.filter(entry => !excluded.has(entry.id)) : null;
  }, [entries, current]);
  useEffect(() => {
    let cancelled = false;
    if (data.status === "ready") {
      setError(null);
      void loadCapabilityAvailabilityInputs(entries, capability, undefined, undefined, undefined, playerScope)
        .then(inputs => { if (!cancelled && getAnalysisDataSnapshot().generation === data.generation && getAnalysisDataSnapshot().status === "ready") setResult({ key, revision, generation: data.generation, availability: deriveCapabilityAvailability(entries, capability, inputs) }); })
        .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    }
    return () => { cancelled = true; };
  }, [entries, capability, data, key, revision, retryVersion]);
  const effectiveError = data.status === "error" ? "分析缓存不可用，请重试刷新。" : error;
  return { availability: current, eligible, error: effectiveError, retry: () => { if (data.status === "error") void invalidateAnalysisQueries().catch(() => {}); else setRetryVersion(version => version + 1); }, stale: !!current && (data.status !== "ready" || result?.generation !== data.generation || result?.revision !== revision || !!effectiveError) };
}

const CapabilityBlockedContext = createContext<"excluded" | "error" | null>(null);
/** Distinguishes an excluded sample from a genuinely empty scope in child views. */
export function useCapabilityBlocked(): "excluded" | "error" | null { return useContext(CapabilityBlockedContext); }

export function CapabilityPanel({ entries, capability, onRepair, children }: { entries: StudioDemoEntry[]; capability: StudioCapability; onRepair: (action: CapabilityRepairAction) => void; children: (eligible: StudioDemoEntry[], current: boolean, availability: CapabilityAvailability) => ReactNode }) {
  const { availability, eligible, error, stale, retry } = useCapability(entries, capability);
  if (!availability || !eligible) return error ? <div role="alert">读取可用性失败：{error} <button type="button" className="stu-button-sm" onClick={retry}>重试</button></div> : <div className="stu-loading">读取分析数据可用性…</div>;
  const blocked = entries.length > 0 && eligible.length === 0 ? (error ? "error" : "excluded") : null;
  return <CapabilityBlockedContext.Provider value={blocked}>
    {entries.length > 0 && <CapabilityBar availability={availability} onRepair={onRepair} />}
    {stale && <p className="stu-muted" role="status">{error ? <>可用性更新失败。 <button type="button" className="stu-button-sm" onClick={retry}>重试</button></> : "正在更新可用性。"}</p>}
    {children(eligible, !stale, availability)}
  </CapabilityBlockedContext.Provider>;
}
