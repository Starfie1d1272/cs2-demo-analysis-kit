import { z } from "zod";
import { seriesVetoSchema } from "./veto.js";

export const eventBracketNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  round: z.number().int().positive(),
  lane: z.enum(["single", "winner", "loser", "grand"]).default("single"),
  nextWinNodeId: z.string().nullable().optional(),
  nextLossNodeId: z.string().nullable().optional(),
});

export const eventStageSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["round_robin", "swiss", "single_elim", "double_elim", "gsl_group"]),
  teamCount: z.number().int().positive(),
  advanceCount: z.number().int().nonnegative().default(0),
  matchFormat: z.enum(["bo1", "bo3", "bo5"]).optional(),
  finalFormat: z.enum(["bo3", "bo5"]).optional(),
  bracketNodes: z.array(eventBracketNodeSchema).optional(),
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

export const rawDemoHintSchema = z.object({
  downloadUrl: z.string().url().nullable().optional(),
  fileName: z.string().nullable().optional(),
}).nullable().optional();

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
  matchUrl: z.string().url().nullable().optional(), // 该系列来源页（HLTV match 页），展示层可链回
  rawDemoHint: rawDemoHintSchema, // 可选：打包侧已知的原始 demo 包直链（如 HLTV r2-demos rar）
  teamAKey: z.string().min(1),
  teamBKey: z.string().min(1),
  scoreA: z.number().int().nonnegative().nullable().optional(),
  scoreB: z.number().int().nonnegative().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
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
    sourceUrl: z.string().url().optional(), // 赛事来源页（如 HLTV results 页），展示层可链回
    group: z.string().optional(), // 共享归组键：同一赛事按 stage 拆多包时共用，Gallery 折叠
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
  for (const [stageIndex, stage] of value.event.stages.entries()) {
    const nodes = stage.bracketNodes ?? [];
    const nodeIds = new Set(nodes.map((node) => node.id));
    if (nodeIds.size !== nodes.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["event", "stages", stageIndex, "bracketNodes"], message: "bracket 节点 id 必须唯一" });
    for (const [nodeIndex, node] of nodes.entries()) {
      for (const target of [node.nextWinNodeId, node.nextLossNodeId]) {
        if (target && !nodeIds.has(target)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["event", "stages", stageIndex, "bracketNodes", nodeIndex], message: "bracket 晋级关系引用了不存在的节点" });
        const targetNode = target ? nodes.find((candidate) => candidate.id === target) : null;
        if (targetNode && targetNode.round <= node.round) context.addIssue({ code: z.ZodIssueCode.custom, path: ["event", "stages", stageIndex, "bracketNodes", nodeIndex], message: "bracket 晋级关系必须指向后续轮次" });
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const node = nodes.find((candidate) => candidate.id === id);
      const cyclic = [node?.nextWinNodeId, node?.nextLossNodeId].some((target) => target ? visit(target) : false);
      visiting.delete(id);
      visited.add(id);
      return cyclic;
    };
    if (nodes.some((node) => visit(node.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["event", "stages", stageIndex, "bracketNodes"], message: "bracket 晋级关系不能成环" });
  }
  for (const [index, series] of value.series.entries()) {
    if (!teamKeys.has(series.teamAKey) || !teamKeys.has(series.teamBKey)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["series", index], message: "series 引用了不存在的队伍" });
    }
    if (series.stage && !stageKeys.has(series.stage)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["series", index, "stage"], message: "series 引用了不存在的阶段" });
    }
    if (series.bracketNodeId) {
      const stage = value.event.stages.find((candidate) => candidate.key === series.stage);
      if (!stage?.bracketNodes?.some((node) => node.id === series.bracketNodeId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["series", index, "bracketNodeId"], message: "series 引用了不存在的 bracket 节点" });
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
export type EventBracketNode = z.infer<typeof eventBracketNodeSchema>;
export type EventTeam = z.infer<typeof eventTeamSchema>;
export type EventSeries = z.infer<typeof eventSeriesSchema>;
export type RawDemoHint = z.infer<typeof rawDemoHintSchema>;

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
    // 展示层可选字段（向后兼容；旧 manifest 不带也合法）：
    description: z.string().optional(), // 卡片副标题文案
    builtin: z.boolean().optional(), // 首发/内置：进入页面提示一键下载
    group: z.string().optional(), // UI 归组键（同 group 折叠成一个赛事、展开见各阶段，如 iem-cologne-major-2026）
  })),
});

export type EventsManifest = z.infer<typeof eventsManifestSchema>;
