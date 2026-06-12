import { z } from "zod";
import {
  manifestSchema,
  matchSchema,
  playersSchema,
  roundsSchema,
  playerEconomiesSchema,
  playerStatsSchema,
  killsSchema,
  damagesSchema,
  blindsSchema,
  bombsSchema,
  grenadesSchema,
  clutchesSchema,
  shotsSchema,
  replaySchema,
  duelsSchema,
} from "cs2-demo-format";

export const demoPackageSchema = z.object({
  manifest: manifestSchema,
  match: matchSchema,
  players: playersSchema,
  rounds: roundsSchema,
  playerEconomies: playerEconomiesSchema.default([]),
  playerStats: playerStatsSchema.default([]),
  kills: killsSchema.default([]),
  damages: damagesSchema.default([]),
  blinds: blindsSchema.default([]),
  bombs: bombsSchema.default([]),
  grenades: grenadesSchema.default([]),
  clutches: clutchesSchema.default([]),
  shots: shotsSchema.optional(),
  replay: replaySchema.optional(),
  duels: duelsSchema.optional(),
});

export type DemoPackage = z.infer<typeof demoPackageSchema>;
