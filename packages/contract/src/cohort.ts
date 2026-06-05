import type { PrismResult } from "@rivalhub/rival-rating";
import { z } from "zod";
import { teamKeySchema } from "cs2-demo-format";
import { accountContextAvailabilitySchema } from "./analysis.js";
import { rrIndicatorsSchema } from "./scoring.js";
import { playerWeaponHighlightFactsSchema } from "./analysis.js";

export const seasonPlayerRowSchema = z.object({
  playerKey: z.string(),
  steamIds: z.array(z.string()),
  primarySteamId64: z.string(),
  externalUserId: z.string().nullable(),
  name: z.string(),
  teamKeys: z.array(teamKeySchema),
  mapCount: z.number().int().positive(),
  rrV1: z.number().nonnegative(),
  rrV1Percentile: z.number().min(0).max(100),
  indicators: rrIndicatorsSchema,
  weaponHighlights: playerWeaponHighlightFactsSchema,
  accountRR: z.number().nonnegative(),
  accountRRRaw: z.number(),
  accountBreakdown: z.object({
    combat: z.number(),
    trade: z.number(),
    mapControl: z.number(),
    clutch: z.number(),
    objective: z.number(),
    utility: z.number()
  }),
  accountContextStatus: z.object({
    buyDelta: accountContextAvailabilitySchema,
    manState: accountContextAvailabilitySchema
  }),
  prism: z.custom<PrismResult>().nullable(),
  confidence: z.number().min(0).max(1),
  perMatch: z.array(z.object({
    matchId: z.string(),
    steamId64: z.string(),
    accountRR: z.number().nonnegative(),
    rrV1: z.number().nonnegative()
  }))
});

export const seasonCohortBundleSchema = z.object({
  version: z.literal("cs2-demo-analysis-kit/cohort-1.0"),
  matchCount: z.number().int().nonnegative(),
  players: z.array(seasonPlayerRowSchema),
  weightsVersion: z.string(),
  provenance: z.object({
    cohortVersion: z.literal("cs2-demo-analysis-kit/cohort-1.0"),
    sourceSchemaVersion: z.literal("cs2-demo-format/2.0"),
    matches: z.array(z.object({
      matchId: z.string(),
      sourceDemoHash: z.string().nullable()
    }))
  })
});

export type SeasonPlayerRow = z.infer<typeof seasonPlayerRowSchema>;
export type SeasonCohortBundle = z.infer<typeof seasonCohortBundleSchema>;
