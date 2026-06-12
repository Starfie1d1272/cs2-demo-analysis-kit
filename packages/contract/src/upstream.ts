import { z } from "zod";
import {
  sideSchema,
  teamKeySchema,
  economyTypeSchema,
  teamEconomySchema,
  vec3Schema,
  playerIndexSchema,
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
  shotTrackSchema,
  shotsSchema,
  replaySchema,
  replayRoundSchema,
  replayPlayerTrackSchema,
  replayProjectileSchema,
  duelsSchema,
  duelWindowSchema,
  duelPlayerTrackSchema,
  duelAnchorSchema,
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
  decodeDelta,
  duelAnchorSchema,
  duelPlayerTrackSchema,
  duelsSchema,
  duelWindowSchema,
  economyTypeSchema,
  endReasonSchema,
  FLAG_ALIVE,
  FLAG_HAS_BOMB,
  FLAG_HAS_DEFUSE_KIT,
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
  playerIndexSchema,
  playerRowSchema,
  playersSchema,
  playerStatsRowSchema,
  playerStatsSchema,
  replaySchema,
  replayPlayerTrackSchema,
  replayProjectileSchema,
  replayRoundSchema,
  roundRowSchema,
  roundsSchema,
  shotTrackSchema,
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
export type PlayerIndex = z.infer<typeof playerIndexSchema>;

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
export type PackageShots = z.infer<typeof shotsSchema>;
export type PackageShotTrack = z.infer<typeof shotTrackSchema>;
export type Replay = z.infer<typeof replaySchema>;
export type ReplayRound = z.infer<typeof replayRoundSchema>;
export type ReplayPlayerTrack = z.infer<typeof replayPlayerTrackSchema>;
export type ReplayProjectile = z.infer<typeof replayProjectileSchema>;
export type Duels = z.infer<typeof duelsSchema>;
export type DuelWindow = z.infer<typeof duelWindowSchema>;
export type DuelPlayerTrack = z.infer<typeof duelPlayerTrackSchema>;
export type DuelAnchor = z.infer<typeof duelAnchorSchema>;
