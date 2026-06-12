import { z } from "zod";

export const seriesFormatSchema = z.enum(["bo1", "bo3", "bo5"]);
export const vetoActionTypeSchema = z.enum(["ban", "pick", "decider"]);
export const vetoTeamRefSchema = z.enum(["teamA", "teamB"]).nullable();

export const seriesVetoStepSchema = z.object({
  stepOrder: z.number().int().positive(),
  actionType: vetoActionTypeSchema,
  mapName: z.string().min(1),
  teamKey: vetoTeamRefSchema,
  side: z.enum(["t", "ct"]).nullable()
});

export const seriesVetoSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/series-veto-0.1"),
  seriesId: z.string(),
  format: seriesFormatSchema,
  teamAName: z.string(),
  teamBName: z.string(),
  mapPool: z.array(z.string().min(1)),
  steps: z.array(seriesVetoStepSchema)
});

export type SeriesFormat = z.infer<typeof seriesFormatSchema>;
export type VetoActionType = z.infer<typeof vetoActionTypeSchema>;
export type SeriesVetoStep = z.infer<typeof seriesVetoStepSchema>;
export type SeriesVeto = z.infer<typeof seriesVetoSchema>;
