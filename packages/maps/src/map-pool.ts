/** Current Valve Active Duty pool; verified against Premier Season Five on 2026-10-11.
 * Source: https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1836506165581827
 * This describes product rotation, not spatial asset availability.
 */
export const ACTIVE_DUTY_MAPS = [
  "de_ancient", "de_anubis", "de_cache", "de_dust2",
  "de_inferno", "de_mirage", "de_nuke",
] as const;
export type ActiveDutyMap = (typeof ACTIVE_DUTY_MAPS)[number];

/** Checked-in nav/route coverage; historical maps remain available. */
export const SPATIAL_ASSET_MAPS = [
  "de_ancient", "de_anubis", "de_dust2", "de_inferno",
  "de_mirage", "de_nuke", "de_overpass",
] as const;
export type SpatialAssetMap = (typeof SPATIAL_ASSET_MAPS)[number];
