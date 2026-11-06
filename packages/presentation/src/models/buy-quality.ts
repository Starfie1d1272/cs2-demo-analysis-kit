import { z } from 'zod';

export const buyQualityRowSchema = z.object({
  economy: z.string(),
  label: z.string(),
  rounds: z.number(),
  wins: z.number(),
  winRatePercent: z.number().nullable(),
});
const conversionSchema = z.object({ rounds: z.number(), wins: z.number() });
export const buyQualitySchema = z.object({
  teamA: z.array(buyQualityRowSchema),
  teamB: z.array(buyQualityRowSchema),
  conversion: z.object({ teamA: conversionSchema, teamB: conversionSchema }),
});

export type BuyQualityRow = z.infer<typeof buyQualityRowSchema>;
export type MatchBuyQuality = z.infer<typeof buyQualitySchema>;
