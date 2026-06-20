import { z } from "zod";
import { seriesVetoSchema } from "./veto.js";

export const eventStageSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["round_robin", "swiss", "single_elim", "double_elim", "gsl_group"]),
  teamCount: z.number().int().positive(),
  advanceCount: z.number().int().nonnegative().default(0),
  matchFormat: z.enum(["bo1", "bo3", "bo5"]).optional(),
  finalFormat: z.enum(["bo3", "bo5"]).optional(),
});

export const eventTeamSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  players: z.array(z.object({
    name: z.string().min(1),
    steamId64: z.string().nullable().optional(),
  })).default([]),
});

export const eventMapSchema = z.object({
  order: z.number().int().positive(),
  mapName: z.string().min(1),
  pickedBy: z.enum(["teamA", "teamB"]).nullable().optional(),
  teamAStartSide: z.enum(["t", "ct"]).nullable().optional(),
  scoreA: z.number().int().nonnegative().nullable().optional(),
  scoreB: z.number().int().nonnegative().nullable().optional(),
  demoHint: z.object({
    fileName: z.string().nullable().optional(),
    sha256: z.string().nullable().optional(),
  }).nullable().optional(),
});

export const eventSeriesSchema = z.object({
  key: z.string().min(1),
  stage: z.string().nullable().optional(),
  round: z.number().int().nonnegative().nullable().optional(),
  entryRound: z.string().nullable().optional(),
  bracketNodeId: z.string().nullable().optional(),
  status: z.enum(["scheduled", "in_progress", "finished", "cancelled"]).default("scheduled"),
  teamARecordBefore: z.string().nullable().optional(),
  teamBRecordBefore: z.string().nullable().optional(),
  format: z.enum(["bo1", "bo3", "bo5"]),
  teamAKey: z.string().min(1),
  teamBKey: z.string().min(1),
  scoreA: z.number().int().nonnegative().nullable().optional(),
  scoreB: z.number().int().nonnegative().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  veto: seriesVetoSchema.nullable().optional(),
  maps: z.array(eventMapSchema).default([]),
});

export const eventPackageSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/event-package-1.0"),
  source: z.enum(["rivalhub", "manual", "r2"]),
  exportedAt: z.string().datetime(),
  event: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    kind: z.string().min(1),
    stages: z.array(eventStageSchema).default([]),
  }),
  teams: z.array(eventTeamSchema),
  series: z.array(eventSeriesSchema),
}).superRefine((value, context) => {
  const teamKeys = new Set(value.teams.map((team) => team.key));
  const stageKeys = new Set(value.event.stages.map((stage) => stage.key));
  const seriesKeys = new Set(value.series.map((series) => series.key));
  if (teamKeys.size !== value.teams.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["teams"], message: "队伍 key 必须唯一" });
  if (stageKeys.size !== value.event.stages.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["event", "stages"], message: "阶段 key 必须唯一" });
  if (seriesKeys.size !== value.series.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["series"], message: "系列赛 key 必须唯一" });
  for (const [index, series] of value.series.entries()) {
    if (!teamKeys.has(series.teamAKey) || !teamKeys.has(series.teamBKey)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["series", index], message: "series 引用了不存在的队伍" });
    }
    if (series.stage && !stageKeys.has(series.stage)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["series", index, "stage"], message: "series 引用了不存在的阶段" });
    }
    if (series.teamAKey === series.teamBKey) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["series", index], message: "系列赛双方不能是同一队" });
    }
    if (new Set(series.maps.map((map) => map.order)).size !== series.maps.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["series", index, "maps"], message: "系列赛地图顺序必须唯一" });
    }
  }
});

export type EventPackage = z.infer<typeof eventPackageSchema>;
export type EventStage = z.infer<typeof eventStageSchema>;
export type EventTeam = z.infer<typeof eventTeamSchema>;
export type EventSeries = z.infer<typeof eventSeriesSchema>;

export const eventsManifestSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/events-manifest-1.0"),
  generatedAt: z.string().datetime(),
  events: z.array(z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    size: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
    urls: z.array(z.string().url()).min(1),
    packageVersion: z.string().min(1),
  })),
});

export type EventsManifest = z.infer<typeof eventsManifestSchema>;
