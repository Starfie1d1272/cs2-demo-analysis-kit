import { z } from "zod";
import { seriesVetoSchema } from "@cs2dak/contract";

export const RIVALHUB_EVENTS_CONTRACT = "rivalhub-dak-events/1" as const;
export const RIVALHUB_EVIDENCE_CONTRACT = "rivalhub-demo-evidence/1" as const;

export const rivalHubDemoSyncStatusSchema = z.enum([
  "not_started",
  "live",
  "finished_pending_demo",
  "demo_processing",
  "synced",
  "needs_attention",
]);
export type RivalHubDemoSyncStatus = z.infer<typeof rivalHubDemoSyncStatusSchema>;

const integrationIssueSchema = z.object({
  code: z.string().min(1),
  path: z.string().min(1).optional(),
  message: z.string().min(1),
}).strict();

const uuidSchema = z.string().uuid();
const remotePlayerSchema = z.object({
  entryId: uuidSchema,
  userId: uuidSchema,
  eventRosterMemberId: uuidSchema,
  steamId64: z.string().regex(/^\d{17}$/),
  name: z.string().min(1),
  isStarter: z.boolean(),
}).strict();

const remoteTargetSchema = z.object({
  seasonId: uuidSchema,
  stageKey: z.string().min(1),
  stageRunId: uuidSchema.nullable(),
  matchId: uuidSchema,
  matchMapId: uuidSchema,
  mapOrder: z.number().int().positive().max(5),
  entryAId: uuidSchema,
  entryBId: uuidSchema,
  expectedMapName: z.string().min(1),
  evidenceRevision: z.string().min(1),
}).strict();

const remoteStageSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["round_robin", "swiss", "single_elim", "double_elim", "gsl_group"]),
  teamCount: z.number().int().positive(),
  advanceCount: z.number().int().nonnegative(),
  matchFormat: z.enum(["bo1", "bo3", "bo5"]).nullable(),
  finalFormat: z.enum(["bo3", "bo5"]).nullable(),
  bracketNodes: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    round: z.number().int().positive(),
    lane: z.enum(["single", "winner", "loser", "grand"]),
    nextWinNodeId: z.string().nullable(),
    nextLossNodeId: z.string().nullable(),
  }).strict()).optional(),
}).strict();

const remoteMapSchema = z.object({
  id: uuidSchema,
  order: z.number().int().positive().max(5),
  mapName: z.string().min(1),
  scoreA: z.number().int().nonnegative().nullable(),
  scoreB: z.number().int().nonnegative().nullable(),
  completedAt: z.string().datetime().nullable(),
  evidenceRevision: z.string().min(1),
  target: remoteTargetSchema,
  lineup: z.array(remotePlayerSchema),
  demoStatus: rivalHubDemoSyncStatusSchema,
  demoIssues: z.array(integrationIssueSchema),
  importId: uuidSchema.nullable(),
  demoSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict();

const remoteSeriesSchema = z.object({
  id: uuidSchema,
  key: z.string().min(1),
  stageKey: z.string().min(1),
  round: z.number().int().nonnegative().nullable(),
  entryRound: z.string().nullable(),
  bracketNodeId: z.string().nullable(),
  status: z.enum(["scheduled", "in_progress", "finished", "cancelled"]),
  format: z.enum(["bo1", "bo3", "bo5"]),
  entryAId: uuidSchema,
  entryBId: uuidSchema,
  teamAKey: uuidSchema,
  teamBKey: uuidSchema,
  teamAName: z.string().min(1),
  teamBName: z.string().min(1),
  scoreA: z.number().int().nonnegative().nullable(),
  scoreB: z.number().int().nonnegative().nullable(),
  scheduledAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  teamARecordBefore: z.string().nullable(),
  teamBRecordBefore: z.string().nullable(),
  maps: z.array(remoteMapSchema),
  veto: seriesVetoSchema.nullable(),
}).strict();

const remoteEventSchema = z.object({
  id: uuidSchema,
  seasonId: uuidSchema,
  slug: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  revision: z.string().min(1),
  stages: z.array(remoteStageSchema),
  teams: z.array(z.object({ key: uuidSchema, name: z.string().min(1), players: z.array(remotePlayerSchema) }).strict()),
  series: z.array(remoteSeriesSchema),
}).strict();

export const rivalHubEventsResponseSchema = z.object({
  contractVersion: z.literal(RIVALHUB_EVENTS_CONTRACT),
  generatedAt: z.string().datetime(),
  events: z.array(remoteEventSchema),
}).strict();

export type RivalHubRemotePlayer = z.infer<typeof remotePlayerSchema>;
export type RivalHubRemoteStage = z.infer<typeof remoteStageSchema>;
export type RivalHubRemoteMap = z.infer<typeof remoteMapSchema>;
export type RivalHubRemoteSeries = z.infer<typeof remoteSeriesSchema>;
export type RivalHubRemoteEvent = z.infer<typeof remoteEventSchema>;
export type RivalHubEventsResponse = z.infer<typeof rivalHubEventsResponseSchema>;
export type RivalHubRemoteTarget = z.infer<typeof remoteTargetSchema>;

// V1 的权威解析器在 RivalHub 服务端；Studio 只负责使用 DAK producer 生成并提交，
// 不在第二个仓库复制一份服务端业务校验器。
export const rivalHubEvidenceSubmissionSchema = z.unknown();
export type RivalHubEvidenceSubmission = z.infer<typeof rivalHubEvidenceSubmissionSchema>;

export interface IntegrationIssue {
  code: string;
  path?: string;
  message: string;
}

export interface EvidenceSubmissionResponse {
  status: "synced" | "needs_attention";
  importId: string | null;
  matchMapId: string;
  demoSha256: string;
  issues: IntegrationIssue[];
}
