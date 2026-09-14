import type { DemoPackage } from "@cs2dak/contract";
import type { ExportedDemoFile } from "./dem";
import { entryDate, importDemoFile, loadDemoPackageTransient, type StudioDemoEntry } from "./library";
import { linkDemoToRivalHubMap } from "./events";
import {
  buildRivalHubDemoEvidenceV1,
  resolveRivalHubParticipants,
  resolveRivalHubParticipantsFromEventRoster,
  resolveRivalHubParticipantsForReview,
} from "./rivalhub-evidence";
import {
  evidenceTargetFromRemoteMap,
  matchRivalHubMap,
  type RivalHubMatchCandidate,
  type RivalHubMatchResult,
} from "./rivalhub-match";
import { rivalHubEvidenceIdempotencyKey, submitRivalHubEvidence } from "./rivalhub";
import type { EvidenceSubmissionResponse } from "./rivalhub-contract";

export type { RivalHubMatchCandidate } from "./rivalhub-match";

export type RivalHubBatchPhase =
  | "queued"
  | "exporting"
  | "importing"
  | "matching"
  | "building_evidence"
  | "submitting"
  | "synced"
  | "needs_attention"
  | "already_synced"
  | "needs_target"
  | "skipped"
  | "failed";

export type RivalHubImportScope = "event" | "stage" | "series" | "map";

export interface RivalHubImportContext {
  scope: RivalHubImportScope;
  eventId: string;
  candidates: RivalHubMatchCandidate[];
  fixedMatchMapId?: string;
}

export interface RivalHubTargetCandidateSummary {
  matchMapId: string;
  mapName: string;
  stageName: string;
  teamAName: string;
  teamBName: string;
  scoreA: number | null;
  scoreB: number | null;
  completedAt: string | null;
  demoStatus: RivalHubMatchCandidate["map"]["demoStatus"];
}

export interface RivalHubBatchItem {
  id: string;
  fileName: string;
  phase: RivalHubBatchPhase;
  message: string;
  detail?: string;
  localEntryId?: string;
  demoSha256?: string | null;
  matchedMapId?: string;
  matchedSeriesLabel?: string;
  serverIssues?: Array<{ code: string; path?: string; message: string }>;
  localDuplicate?: boolean;
  reusedLocal?: boolean;
  targetCandidates?: RivalHubTargetCandidateSummary[];
}

export interface RivalHubBatchSession {
  id: string;
  status: "running" | "stopping" | "completed";
  currentIndex: number;
  /** Only non-null while resolveTarget is awaiting the user's decision. */
  awaitingTargetItemId: string | null;
  total: number;
  items: RivalHubBatchItem[];
  counts: {
    synced: number;
    needsAttention: number;
    alreadySynced: number;
    needsTarget: number;
    skipped: number;
    failed: number;
    reusedLocal: number;
  };
}

interface RivalHubBatchDependencies {
  exportDem: (file: File, onProgress?: (message: string) => void) => Promise<ExportedDemoFile>;
  importDemo: typeof importDemoFile;
  loadPackage: (id: string) => Promise<DemoPackage>;
  matchMap: typeof matchRivalHubMap;
  submit: typeof submitRivalHubEvidence;
  idempotencyKey: typeof rivalHubEvidenceIdempotencyKey;
  linkMap: typeof linkDemoToRivalHubMap;
  resolveParticipants: typeof resolveRivalHubParticipants;
  resolveParticipantsFromEventRoster: typeof resolveRivalHubParticipantsFromEventRoster;
  resolveParticipantsForReview: typeof resolveRivalHubParticipantsForReview;
  buildEvidence: typeof buildRivalHubDemoEvidenceV1;
}

export interface RivalHubBatchCallbacks {
  exportDem: RivalHubBatchDependencies["exportDem"];
  onUpdate?: (session: RivalHubBatchSession) => void;
  shouldStop?: () => boolean;
  resolveTarget?: (item: RivalHubBatchItem, candidates: RivalHubMatchCandidate[]) => Promise<string | null>;
  dependencies?: Partial<Omit<RivalHubBatchDependencies, "exportDem">>;
}

function sessionId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `batch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function candidateSummary(candidate: RivalHubMatchCandidate): RivalHubTargetCandidateSummary {
  return {
    matchMapId: candidate.map.id,
    mapName: candidate.map.mapName,
    stageName: candidate.series.stageKey ?? "未分阶段",
    teamAName: candidate.series.teamAName,
    teamBName: candidate.series.teamBName,
    scoreA: candidate.map.scoreA,
    scoreB: candidate.map.scoreB,
    completedAt: candidate.series.completedAt ?? candidate.map.completedAt,
    demoStatus: candidate.map.demoStatus,
  };
}

function messageForPhase(phase: RivalHubBatchPhase): string {
  return {
    queued: "排队中",
    exporting: "导出 Demo",
    importing: "写入本地资料库",
    matching: "匹配 RivalHub Map",
    building_evidence: "构建证据",
    submitting: "提交 RivalHub",
    synced: "已同步",
    needs_attention: "需要处理",
    already_synced: "已存在同步结果",
    needs_target: "等待选择目标",
    skipped: "已跳过",
    failed: "失败",
  }[phase];
}

function newItem(file: File, index: number): RivalHubBatchItem {
  return { id: `item-${index}-${file.name}`, fileName: file.name, phase: "queued", message: messageForPhase("queued") };
}

function replacementResult(
  item: RivalHubBatchItem,
  result: Extract<RivalHubMatchResult, { status: "matched" }>,
): RivalHubBatchItem {
  return {
    ...item,
    matchedMapId: result.candidate.map.id,
    matchedSeriesLabel: `${result.candidate.series.teamAName} vs ${result.candidate.series.teamBName}`,
    detail: `匹配方式：${result.mode}`,
  };
}

function isDem(file: File): boolean {
  return file.name.toLowerCase().endsWith(".dem");
}

function freshSession(files: File[]): RivalHubBatchSession {
  return {
    id: sessionId(),
    status: "running",
    currentIndex: 0,
    awaitingTargetItemId: null,
    total: files.length,
    items: files.map(newItem),
    counts: { synced: 0, needsAttention: 0, alreadySynced: 0, needsTarget: 0, skipped: 0, failed: 0, reusedLocal: 0 },
  };
}

function recount(session: RivalHubBatchSession): RivalHubBatchSession {
  const terminal = session.items;
  return {
    ...session,
    counts: {
      synced: terminal.filter((item) => item.phase === "synced").length,
      needsAttention: terminal.filter((item) => item.phase === "needs_attention").length,
      alreadySynced: terminal.filter((item) => item.phase === "already_synced").length,
      needsTarget: terminal.filter((item) => item.phase === "needs_target").length,
      skipped: terminal.filter((item) => item.phase === "skipped").length,
      failed: terminal.filter((item) => item.phase === "failed").length,
      reusedLocal: terminal.filter((item) => item.reusedLocal).length,
    },
  };
}

/**
 * Serial RivalHub import pipeline. The only package held between callbacks is
 * the current item; the transient loader never touches the normal workspace
 * cache. A target picker resumes after matching, so export/import are not repeated.
 */
export async function runRivalHubBatch(
  filesInput: Iterable<File>,
  context: RivalHubImportContext,
  callbacks: RivalHubBatchCallbacks,
): Promise<RivalHubBatchSession> {
  const files = [...filesInput];
  const deps: RivalHubBatchDependencies = {
    exportDem: callbacks.exportDem,
    importDemo: importDemoFile,
    loadPackage: loadDemoPackageTransient,
    matchMap: matchRivalHubMap,
    submit: submitRivalHubEvidence,
    idempotencyKey: rivalHubEvidenceIdempotencyKey,
    linkMap: linkDemoToRivalHubMap,
    resolveParticipants: resolveRivalHubParticipants,
    resolveParticipantsFromEventRoster: resolveRivalHubParticipantsFromEventRoster,
    resolveParticipantsForReview: resolveRivalHubParticipantsForReview,
    buildEvidence: buildRivalHubDemoEvidenceV1,
    ...callbacks.dependencies,
  };
  let session = freshSession(files);
  const emit = () => callbacks.onUpdate?.(recount(session));
  const updateItem = (index: number, patch: Partial<RivalHubBatchItem>) => {
    const currentItem = session.items[index];
    const nextPhase = patch.phase ?? currentItem?.phase;
    const awaitingTargetItemId = nextPhase === "needs_target"
      ? currentItem?.id ?? null
      : session.awaitingTargetItemId === currentItem?.id ? null : session.awaitingTargetItemId;
    session = recount({
      ...session,
      currentIndex: index,
      awaitingTargetItemId,
      items: session.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    });
    emit();
  };
  emit();

  for (let index = 0; index < files.length; index += 1) {
    if (callbacks.shouldStop?.()) {
      session = { ...session, status: "stopping", currentIndex: index };
      emit();
      break;
    }
    const input = files[index]!;
    let localEntry: StudioDemoEntry | null = null;
    try {
      let exported: ExportedDemoFile;
      if (isDem(input)) {
        updateItem(index, { phase: "exporting", message: messageForPhase("exporting") });
        exported = await deps.exportDem(input, (message) => updateItem(index, { detail: message }));
      } else {
        exported = { file: input, sourceDemPath: null };
      }
      updateItem(index, { phase: "importing", message: messageForPhase("importing"), detail: undefined });
      const imported = await deps.importDemo(exported.file, {
        lowMemory: true,
        sourceDemPath: exported.sourceDemPath ?? null,
      });
      localEntry = imported.entry;
      updateItem(index, {
        phase: "matching",
        message: messageForPhase("matching"),
        localEntryId: localEntry.id,
        demoSha256: localEntry.demoSha256,
        localDuplicate: imported.duplicate,
        reusedLocal: imported.duplicate,
        detail: imported.duplicate ? "复用本地 Demo 条目，继续在线匹配" : undefined,
      });

      if (!localEntry.demoSha256) {
        updateItem(index, { phase: "failed", message: messageForPhase("failed"), detail: "缺少 canonical raw Demo hash，无法同步" });
        continue;
      }

      const hashMatches = context.candidates.filter(({ map }) => map.demoSha256?.toLowerCase() === localEntry!.demoSha256!.toLowerCase());
      let match: RivalHubMatchResult;
      let pkg: DemoPackage | null = null;
      if (context.fixedMatchMapId) {
        pkg = await deps.loadPackage(localEntry.id);
        match = deps.matchMap(pkg, context.candidates, { fixedMatchMapId: context.fixedMatchMapId, demoDate: entryDate(localEntry) });
      } else if (hashMatches.length === 1) {
        match = { status: "matched", candidate: hashMatches[0]!, mode: "remote_demo_sha" };
      } else if (hashMatches.length > 1) {
        match = { status: "needs_target", candidates: hashMatches, reason: "同一个 raw Demo hash 对应多个 RivalHub Map，服务端上下文不一致" };
      } else {
        pkg = await deps.loadPackage(localEntry.id);
        match = deps.matchMap(pkg, context.candidates, { demoSha256: localEntry.demoSha256, demoDate: entryDate(localEntry) });
      }
      if (match.status === "needs_target") {
        updateItem(index, {
          phase: "needs_target",
          message: messageForPhase("needs_target"),
          detail: match.reason,
          targetCandidates: match.candidates.map(candidateSummary),
        });
        const selectedId = await callbacks.resolveTarget?.(session.items[index]!, match.candidates) ?? null;
        const selected = selectedId ? match.candidates.find((candidate) => candidate.map.id === selectedId) : undefined;
        if (!selected) {
          updateItem(index, {
            phase: "skipped",
            message: messageForPhase("skipped"),
            detail: "用户跳过目标，保留待后续处理",
            targetCandidates: undefined,
          });
          continue;
        }
        match = { status: "matched", candidate: selected, mode: "fixed" };
      }
      // Hash identity is checked before loading the full package. An already
      // synced remote map is terminal and must not trigger submit or extraction.
      // Keep this check after the picker too: an ambiguous hash may resolve to
      // one already-synced official map.
      if (match.status === "matched"
        && match.candidate.map.demoStatus === "synced"
        && match.candidate.map.demoSha256?.toLowerCase() === localEntry.demoSha256.toLowerCase()) {
        await deps.linkMap(match.candidate.series.id, match.candidate.map.id, localEntry.id);
        updateItem(index, { ...replacementResult({ ...session.items[index]! }, match), phase: "already_synced", message: messageForPhase("already_synced") });
        continue;
      }
      if (match.status === "not_found") {
        updateItem(index, { phase: "failed", message: messageForPhase("failed"), detail: match.reason });
        continue;
      }

      const selected = match.candidate;
      pkg ??= await deps.loadPackage(localEntry.id);
      updateItem(index, { ...replacementResult(session.items[index]!, match), phase: "building_evidence", message: messageForPhase("building_evidence"), targetCandidates: undefined });
      const target = evidenceTargetFromRemoteMap(selected.map);
      let participantMatch: ReturnType<typeof resolveRivalHubParticipants> | ReturnType<typeof resolveRivalHubParticipantsFromEventRoster> | ReturnType<typeof resolveRivalHubParticipantsForReview>;
      let eventRosterMatch: ReturnType<typeof resolveRivalHubParticipantsFromEventRoster> | null = null;
      if (selected.eventTeams && selected.eventTeams.length > 0) {
        try {
          eventRosterMatch = deps.resolveParticipantsFromEventRoster(pkg, target, selected.eventTeams);
        } catch {
          // A partial/mismatched EventRoster cannot establish identity; retain
          // the pre-existing MatchRoster validation/review fallback below.
        }
      }
      if (eventRosterMatch) {
        // EventRoster owns the base identity and orientation. MatchRoster is
        // only an after-target per-match check; its result never replaces this
        // canonical resolution, and the server records any mismatch.
        if ((selected.map.lineup?.length ?? 0) > 0) {
          try {
            deps.resolveParticipants(pkg, target, selected.map.lineup ?? []);
          } catch {
            // Keep EventRoster participant identity/orientation for evidence.
          }
        }
        participantMatch = eventRosterMatch;
      } else {
        try {
          participantMatch = deps.resolveParticipants(pkg, target, selected.map.lineup ?? []);
        } catch {
          participantMatch = deps.resolveParticipantsForReview(pkg, target, selected.map.lineup ?? []);
        }
      }
      const evidence = deps.buildEvidence(pkg, target, participantMatch.identities, participantMatch.orientation);
      updateItem(index, { phase: "submitting", message: messageForPhase("submitting") });
      const response: EvidenceSubmissionResponse = await deps.submit(evidence, await deps.idempotencyKey(selected.map.id, evidence));
      await deps.linkMap(selected.series.id, selected.map.id, localEntry.id);
      updateItem(index, {
        phase: response.status === "synced" ? "synced" : "needs_attention",
        message: messageForPhase(response.status === "synced" ? "synced" : "needs_attention"),
        serverIssues: response.issues,
        detail: response.status === "synced" ? undefined : response.issues.map((issue) => issue.message).join("；") || "RivalHub 返回需要处理",
      });
    } catch (error) {
      updateItem(index, { phase: "failed", message: messageForPhase("failed"), detail: error instanceof Error ? error.message : String(error) });
    }
  }
  session = recount({ ...session, status: "completed" });
  emit();
  return session;
}
