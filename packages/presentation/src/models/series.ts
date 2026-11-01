import { z } from "zod";
import { matchWorkspaceModelSchema } from "./workspace.js";

export const mvpCandidateSchema = z.object({
  playerKey: z.string(),
  name: z.string(),
  teamName: z.string(),
  recommendationScore: z.number().nonnegative(),
  rivalhubRR: z.number().nonnegative(),
  hltvRating: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  explanation: z.array(z.string())
});

export const mvpRecommendationSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/mvp-recommendation-0.1"),
  recommended: mvpCandidateSchema,
  candidates: z.array(mvpCandidateSchema).min(1)
});

export const seriesMatchInputSchema = z.object({
  matchId: z.string(),
  model: matchWorkspaceModelSchema
});

export const seriesPlayerMapTrendSchema = z.object({
  matchId: z.string(),
  mapName: z.string(),
  rivalhubRR: z.number().nonnegative(),
  hltvRating: z.number().nonnegative(),
  adr: z.number().nonnegative(),
  kast: z.number().min(0).max(100)
});

export const seriesPlayerRowSchema = z.object({
  playerKey: z.string(),
  name: z.string(),
  teamName: z.string(),
  mapCount: z.number().int().positive(),
  totalRounds: z.number().int().positive(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  adr: z.number().nonnegative(),
  kast: z.number().min(0).max(100),
  rivalhubRR: z.number().nonnegative(),
  hltvRating: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  perMap: z.array(seriesPlayerMapTrendSchema)
});

export const seriesSummarySchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/series-summary-0.1"),
  mapCount: z.number().int().positive(),
  maps: z.array(z.object({
    matchId: z.string(),
    mapName: z.string(),
    scoreline: z.string(),
    teamAName: z.string(),
    teamBName: z.string(),
    winnerName: z.string().nullable()
  })),
  teams: z.array(z.object({
    teamKey: z.string(),
    name: z.string(),
    mapsWon: z.number().int().nonnegative()
  })),
  scoreboard: z.array(seriesPlayerRowSchema),
  mvpCandidates: z.array(mvpCandidateSchema)
});

export type MvpCandidate = z.infer<typeof mvpCandidateSchema>;
export type MvpRecommendation = z.infer<typeof mvpRecommendationSchema>;
export type SeriesMatchInput = z.infer<typeof seriesMatchInputSchema>;
export type SeriesPlayerMapTrend = z.infer<typeof seriesPlayerMapTrendSchema>;
export type SeriesPlayerRow = z.infer<typeof seriesPlayerRowSchema>;
export type SeriesSummary = z.infer<typeof seriesSummarySchema>;
