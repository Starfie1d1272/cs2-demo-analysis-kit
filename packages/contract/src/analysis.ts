import { z } from 'zod';
import {
  teamKeySchema,
  sideSchema,
  economyTypeSchema,
  teamEconomySchema,
  grenadeTypeSchema,
} from 'cs2-demo-format';

export const playerRoundFactSchema = z.object({
  roundNumber: z.number().int().positive(),
  steamId64: z.string(),
  name: z.string(),
  teamKey: teamKeySchema,
  side: sideSchema,
  survived: z.boolean(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  damage: z.number().int().nonnegative(),
  utilityDamage: z.number().int().nonnegative(),
  flashAssists: z.number().int().nonnegative(),
  tradeKills: z.number().int().nonnegative(),
  tradedDeaths: z.number().int().nonnegative(),
  openingDuel: z.enum(['none', 'won', 'lost']),
  kastTags: z.array(z.enum(['kill', 'assist', 'survive', 'trade'])),
  equipmentValue: z.number().int().nonnegative().nullable(),
  economyType: economyTypeSchema.nullable(),
});

export const weaponKillRowSchema = z.object({
  weapon: z.string(),
  kills: z.number().int().nonnegative(),
  headshotKills: z.number().int().nonnegative(),
  tradeKills: z.number().int().nonnegative(),
  noScopeKills: z.number().int().nonnegative(),
  throughSmokeKills: z.number().int().nonnegative(),
  wallbangKills: z.number().int().nonnegative(),
  penetratedObjects: z.number().int().nonnegative(),
});

export const playerWeaponHighlightFactsSchema = z.object({
  steamId64: z.string(),
  totalKills: z.number().int().nonnegative(),
  weapons: z.array(weaponKillRowSchema),
  highlights: z.object({
    wallbangKills: z.number().int().nonnegative().nullable(),
    noScopeKills: z.number().int().nonnegative().nullable(),
    throughSmokeKills: z.number().int().nonnegative().nullable(),
    collateralKills: z.number().int().nonnegative().nullable(),
  }),
});

export const timelineEventSchema = z.object({
  id: z.string(),
  roundNumber: z.number().int().positive(),
  tick: z.number().int().positive(),
  timeSeconds: z.number().nonnegative(),
  clockPhase: z.enum(['freeze', 'round', 'bomb', 'round-end']),
  clockSeconds: z.number().nonnegative(),
  clockLabel: z.string(),
  type: z.enum(['kill', 'bomb', 'grenade', 'round-end']),
  label: z.string(),
  teamKey: teamKeySchema.nullable(),
});

export const economyPointSchema = z.object({
  roundNumber: z.number().int().positive(),
  teamA: z.number().int().nonnegative(),
  teamB: z.number().int().nonnegative(),
  advantage: z.number().int(),
  teamAEconomy: teamEconomySchema,
  teamBEconomy: teamEconomySchema,
  winnerTeamKey: teamKeySchema,
});

export const heatmapPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  roundNumber: z.number().int().positive(),
  teamKey: teamKeySchema.nullable(),
  steamId64: z.string().nullable(),
  side: sideSchema.nullable(),
  kind: z.enum(['kill', 'death', 'grenade']),
  grenadeType: grenadeTypeSchema.nullable(),
});

export type PlayerRoundFact = z.infer<typeof playerRoundFactSchema>;
export type WeaponKillRow = z.infer<typeof weaponKillRowSchema>;
export type PlayerWeaponHighlightFacts = z.infer<typeof playerWeaponHighlightFactsSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type EconomyPoint = z.infer<typeof economyPointSchema>;
export type GrenadeType = z.infer<typeof grenadeTypeSchema>;
export type HeatmapPoint = z.infer<typeof heatmapPointSchema>;
