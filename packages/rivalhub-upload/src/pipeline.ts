import { normalizeDiagnostic, type SafeDiagnostic } from "./diagnostics";
import { loadDemoPackageFromZip } from "@cs2dak/core/evidence";
import { buildRivalHubDemoEvidenceV1, resolveRivalHubParticipants, resolveRivalHubParticipantsForReview, resolveRivalHubParticipantsFromEventRoster } from "./evidence";
import { evidenceTargetFromRemoteMap, matchRivalHubMap, type RivalHubMatchCandidate } from "./match";
import { rivalHubEvidenceIdempotencyKey } from "./client";
import type { EvidenceSubmissionResponse, RivalHubEventsResponse } from "./contract";

export type UploadPhase = "waiting" | "parsing" | "matching" | "selecting" | "uploading" | "done" | "needs_attention" | "unconfirmed" | "failed";
export interface UploadReceipt { target: RivalHubMatchCandidate; response: EvidenceSubmissionResponse; match?: string }
export interface UploadUpdate { phase: UploadPhase; message: string; match?: string; target?: RivalHubMatchCandidate; response?: EvidenceSubmissionResponse; receipt?: UploadReceipt }
export interface UploadDependencies {
  receipt?: UploadReceipt;
  warning?(diagnostic: SafeDiagnostic): void;
  hash(): Promise<string>;
  exportZip(): Promise<Uint8Array>;
  cleanup(): Promise<void>;
  events(): Promise<RivalHubEventsResponse>;
  submit(evidence: unknown, key: string): Promise<EvidenceSubmissionResponse>;
  choose(candidates: RivalHubMatchCandidate[]): Promise<RivalHubMatchCandidate | null>;
  update(update: UploadUpdate): void;
}

async function confirmSubmission(deps: UploadDependencies, receipt: UploadReceipt, hash: string): Promise<void> {
  const { target, response, match } = receipt;
  deps.update({ phase: "uploading", message: "网站已接收，正在确认最终状态", target, response, match, receipt });
  let confirmed: RivalHubMatchCandidate | undefined;
  try {
    confirmed = uploadCandidates(await deps.events()).find(c => c.map.id === target.map.id);
    if (!confirmed || confirmed.map.demoSha256 !== hash || !["synced", "needs_attention"].includes(confirmed.map.demoStatus)) {
      throw new Error("网站状态尚未包含本次 Demo 回执");
    }
  } catch (error) {
    const diagnostic = normalizeDiagnostic(error, { stage: "confirmation" });
    deps.update({ phase: "unconfirmed", message: "网站已接收，状态待确认；请仅刷新状态", target, response, match, receipt });
    throw Object.assign(new Error("STATUS_UNCONFIRMED：网站已接收，但暂未确认最终状态。请打开网站核对，重试将只查询状态", { cause: diagnostic }), {
      code: "STATUS_UNCONFIRMED", stage: "confirmation", status: diagnostic.status, requestId: diagnostic.requestId,
    });
  }
  const issues = confirmed.map.demoIssues.length ? confirmed.map.demoIssues : response.issues;
  const needsAttention = confirmed.map.demoStatus === "needs_attention";
  deps.update({ phase: needsAttention ? "needs_attention" : "done", message: needsAttention ? issues.map(i => `${i.code}：${i.message}`).join("；") || "网站需要人工核对比赛数据" : "上传完成，网站已确认同步", match, target, response: { ...response, issues }, receipt });
}

export function uploadCandidates(response: RivalHubEventsResponse): RivalHubMatchCandidate[] {
  return response.events.flatMap(event => event.series.filter(series => series.status !== "cancelled").flatMap(series =>
    series.maps.map(map => ({ series, map, eventTeams: event.teams }))));
}

/** One Demo at a time. The shell owns file selection, byte transport and cleanup. */
export async function uploadDemo(deps: UploadDependencies): Promise<void> {
  try {
    deps.update({ phase: "parsing", message: "正在检查 Demo 文件" });
    const hash = await deps.hash();
    if (deps.receipt) {
      if (deps.receipt.response.demoSha256 !== hash || deps.receipt.response.matchMapId !== deps.receipt.target.map.id) {
        throw new Error("DEMO_CHANGED：本地 Demo 与已接收回执不一致，请重新选择文件");
      }
      await confirmSubmission(deps, deps.receipt, hash);
      return;
    }
    const candidates = uploadCandidates(await deps.events());
    const sameHash = candidates.filter(c => c.map.demoSha256 === hash);
    if (sameHash.length === 1 && sameHash[0]!.map.demoStatus === "synced") {
      deps.update({ phase: "done", message: "这份 Demo 已上传，无需重复解析", target: sameHash[0] });
      return;
    }
    deps.update({ phase: "parsing", message: "正在解析 Demo，大文件可能需要几分钟" });
    const pkg = await loadDemoPackageFromZip(await deps.exportZip(), { profile: "evidence" });
    if (pkg.manifest.demo?.hash !== hash) throw new Error("DEMO_CHANGED：Demo 在解析期间发生变化，请等待录制结束后重新选择");
    const label = `${pkg.match.teamA.name ?? "队伍 A"} vs ${pkg.match.teamB.name ?? "队伍 B"} · ${pkg.match.mapName}`;
    deps.update({ phase: "matching", message: "正在查找对应的赛事比赛", match: label });
    const match = matchRivalHubMap(pkg, candidates, { demoSha256: hash });
    if (match.status === "not_found") throw new Error(`TARGET_NOT_FOUND：${match.reason}`);
    let selected: RivalHubMatchCandidate | null;
    if (match.status === "needs_target") {
      deps.update({ phase: "selecting", message: "发现多个可能的比赛，请选择本场的目标", match: label });
      selected = await deps.choose(match.candidates);
      if (!selected) throw new Error("TARGET_SKIPPED：已跳过本场；确认比赛后可重试");
      if (!match.candidates.includes(selected)) throw new Error("TARGET_INVALID：选择的目标不属于本次候选");
    } else selected = match.candidate;
    const target = evidenceTargetFromRemoteMap(selected.map);
    let participants;
    try {
      participants = resolveRivalHubParticipantsFromEventRoster(pkg, target, selected.eventTeams ?? []);
    } catch {
      try { participants = resolveRivalHubParticipants(pkg, target, selected.map.lineup ?? []); }
      catch { participants = resolveRivalHubParticipantsForReview(pkg, target, selected.map.lineup ?? []); }
    }
    const evidence = buildRivalHubDemoEvidenceV1(pkg, target, participants.identities, participants.orientation);
    deps.update({ phase: "uploading", message: "正在提交比赛数据", match: label, target: selected });
    const response = await deps.submit(evidence, await rivalHubEvidenceIdempotencyKey(selected.map.id, evidence));
    if (response.matchMapId !== selected.map.id || response.demoSha256 !== hash) throw new Error("RESPONSE_MISMATCH：网站返回的比赛或 Demo 标识不一致，请联系管理员");
    await confirmSubmission(deps, { target: selected, response, match: label }, hash);
  } finally {
    try { await deps.cleanup(); }
    catch (error) {
      const diagnostic = normalizeDiagnostic(error, { stage: "cleanup" });
      // Cleanup is secondary, including when the upload has already succeeded.
      try {
        if (deps.warning) deps.warning(diagnostic);
        else console.warn("Upload cleanup failed", diagnostic);
      } catch { /* Reporting must not replace the primary outcome. */ }
    }
  }
}
