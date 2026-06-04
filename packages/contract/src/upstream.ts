import { z } from "zod";
import {
  sideSchema,
  teamKeySchema,
  economyTypeSchema,
  teamEconomySchema,
  vec3Schema,
  playerRowSchema,
  roundRowSchema,
  killRowSchema,
  damageRowSchema,
  playerEconomyRowSchema,
  playerStatsRowSchema,
  blindRowSchema,
  bombRowSchema,
  grenadeRowSchema,
  clutchRowSchema,
  shotRowSchema,
  positionRowSchema,
  replaySchema,
  replayRoundSchema,
  replayPlayerTrackSchema,
} from "cs2-demo-format";

export {
  SCHEMAS_BY_KEY,
  blindRowSchema,
  blindsSchema,
  bombEventTypeSchema,
  bombRowSchema,
  bombsSchema,
  clutchRowSchema,
  clutchesSchema,
  damageRowSchema,
  damagesSchema,
  economyTypeSchema,
  endReasonSchema,
  grenadeRowSchema,
  grenadeTypeSchema,
  grenadesSchema,
  hitgroupSchema,
  killRowSchema,
  killsSchema,
  manifestSchema,
  matchSchema,
  playerEconomiesSchema,
  playerEconomyRowSchema,
  playerRowSchema,
  playersSchema,
  playerStatsRowSchema,
  playerStatsSchema,
  positionRowSchema,
  positionsSchema,
  replaySchema,
  replayPlayerTrackSchema,
  replayRoundSchema,
  roundRowSchema,
  roundsSchema,
  shotRowSchema,
  shotsSchema,
  sideSchema,
  steamId64Schema,
  teamEconomySchema,
  teamEconomyTypeSchema,
  teamKeySchema,
  teamSummarySchema,
  vec3Schema,
} from "cs2-demo-format";

export type Side = z.infer<typeof sideSchema>;
export type TeamKey = z.infer<typeof teamKeySchema>;
export type EconomyType = z.infer<typeof economyTypeSchema>;
export type TeamEconomyType = z.infer<typeof teamEconomySchema>;
export type Vec3 = z.infer<typeof vec3Schema>;

export type PackagePlayer = z.infer<typeof playerRowSchema>;
export type PackageRound = z.infer<typeof roundRowSchema>;
export type PackageKill = z.infer<typeof killRowSchema>;
export type PackageDamage = z.infer<typeof damageRowSchema>;
export type PackagePlayerEconomy = z.infer<typeof playerEconomyRowSchema>;
export type PackagePlayerStats = z.infer<typeof playerStatsRowSchema>;
export type PackageBlind = z.infer<typeof blindRowSchema>;
export type PackageBomb = z.infer<typeof bombRowSchema>;
export type PackageGrenade = z.infer<typeof grenadeRowSchema>;
export type PackageClutch = z.infer<typeof clutchRowSchema>;
export type PackageShot = z.infer<typeof shotRowSchema>;
export type PackagePosition = z.infer<typeof positionRowSchema>;
export type Replay = z.infer<typeof replaySchema>;
export type ReplayRound = z.infer<typeof replayRoundSchema>;
export type ReplayPlayerTrack = z.infer<typeof replayPlayerTrackSchema>;
