import { z } from "zod";

/** UI vocabulary; producers explicitly project their domain values into these fields. */
export const teamKeySchema = z.enum(["teamA", "teamB"]);
export const sideSchema = z.enum(["t", "ct"]);
export const economyTypeSchema = z.enum(["pistol", "eco", "semi", "force", "full"]);
export const teamEconomySchema = z.enum(["pistol", "eco", "semi", "force", "full"]);
export const grenadeTypeSchema = z.enum(["hegrenade", "flashbang", "smoke", "molotov", "incendiary", "decoy"]);
export type TeamKey = z.infer<typeof teamKeySchema>;
export type Side = z.infer<typeof sideSchema>;
export type EconomyType = z.infer<typeof economyTypeSchema>;
export type GrenadeType = z.infer<typeof grenadeTypeSchema>;
