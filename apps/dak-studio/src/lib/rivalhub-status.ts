import type { RivalHubBatchPhase } from "./rivalhub-import";
import type { RivalHubDemoSyncStatus } from "./rivalhub-contract";

export type RivalHubStatus = RivalHubDemoSyncStatus | RivalHubBatchPhase;

export interface RivalHubStatusPresentation {
  label: string;
  className: string;
}
const REMOTE: Record<RivalHubDemoSyncStatus, RivalHubStatusPresentation> = {
  synced: { label: "已同步", className: "stu-rivalhub-status stu-rivalhub-status-synced" },
  needs_attention: { label: "需要处理", className: "stu-rivalhub-status stu-rivalhub-status-needs-attention" },
  finished_pending_demo: { label: "已结束 · 待 Demo", className: "stu-rivalhub-status stu-rivalhub-status-finished" },
  demo_processing: { label: "Demo 处理中", className: "stu-rivalhub-status stu-rivalhub-status-processing" },
  live: { label: "LIVE", className: "stu-rivalhub-status stu-rivalhub-status-live" },
  not_started: { label: "未开始", className: "stu-rivalhub-status stu-rivalhub-status-not-started" },
};

const BATCH: Record<RivalHubBatchPhase, RivalHubStatusPresentation> = {
  queued: { label: "排队中", className: "stu-rivalhub-status stu-rivalhub-status-queued" },
  exporting: { label: "导出 Demo", className: "stu-rivalhub-status stu-rivalhub-status-processing" },
  importing: { label: "写入本地", className: "stu-rivalhub-status stu-rivalhub-status-processing" },
  matching: { label: "匹配中", className: "stu-rivalhub-status stu-rivalhub-status-processing" },
  building_evidence: { label: "构建证据", className: "stu-rivalhub-status stu-rivalhub-status-processing" },
  submitting: { label: "提交中", className: "stu-rivalhub-status stu-rivalhub-status-processing" },
  synced: REMOTE.synced,
  needs_attention: REMOTE.needs_attention,
  already_synced: { label: "已存在同步结果", className: "stu-rivalhub-status stu-rivalhub-status-synced" },
  needs_target: { label: "待选目标", className: "stu-rivalhub-status stu-rivalhub-status-needs-target" },
  skipped: { label: "已跳过", className: "stu-rivalhub-status stu-rivalhub-status-needs-target" },
  failed: { label: "失败", className: "stu-rivalhub-status stu-rivalhub-status-needs-attention" },
};

export function rivalHubStatusPresentation(status: RivalHubStatus): RivalHubStatusPresentation {
  return status in REMOTE ? REMOTE[status as RivalHubDemoSyncStatus] : BATCH[status as RivalHubBatchPhase];
}
