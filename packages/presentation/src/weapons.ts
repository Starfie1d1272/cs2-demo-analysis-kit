import { normalizeWeapon } from "./workspace-utils.js";

/**
 * Single source of truth for weapon display names.
 *
 * Keyed by the *normalized* raw code (lowercase, `weapon_` prefix stripped — see
 * {@link normalizeWeapon}). This consolidates what RivalHub previously kept in
 * three drifting tables (`weapon-names.ts` `WEAPON_LABELS` / `WEAPON_FULL_NAMES`
 * and `DemoKillFeed.WEAPON_DISPLAY`). Consumers — replay tokens, the current-frame
 * panel, and a future kill feed — should all route through {@link displayWeaponName}.
 */
const WEAPON_DISPLAY_NAMES: Record<string, string> = {
  // Rifles
  ak47: "AK-47",
  m4a4: "M4A4",
  m4a1: "M4A4",
  m4a1_silencer: "M4A1-S",
  aug: "AUG",
  sg556: "SG 553",
  sg553: "SG 553",
  famas: "FAMAS",
  galilar: "Galil AR",
  galil: "Galil AR",
  // Snipers
  awp: "AWP",
  ssg08: "SSG 08",
  scar20: "SCAR-20",
  g3sg1: "G3SG1",
  // Pistols
  deagle: "Desert Eagle",
  deserteagle: "Desert Eagle",
  revolver: "R8 Revolver",
  glock: "Glock-18",
  usp_silencer: "USP-S",
  usp: "USP-S",
  hkp2000: "P2000",
  p2000: "P2000",
  p250: "P250",
  fiveseven: "Five-SeveN",
  tec9: "Tec-9",
  cz75a: "CZ75-Auto",
  cz75: "CZ75-Auto",
  elite: "Dual Berettas",
  // SMGs
  mp9: "MP9",
  mp7: "MP7",
  mp5sd: "MP5-SD",
  ump45: "UMP-45",
  p90: "P90",
  bizon: "PP-Bizon",
  mac10: "MAC-10",
  // Heavy
  nova: "Nova",
  xm1014: "XM1014",
  mag7: "MAG-7",
  sawedoff: "Sawed-Off",
  m249: "M249",
  negev: "Negev",
  // Equipment / utility
  taser: "Zeus x27",
  zeus: "Zeus x27",
  hegrenade: "HE 手雷",
  flashbang: "闪光弹",
  smokegrenade: "烟雾弹",
  molotov: "燃烧弹",
  incgrenade: "燃烧弹",
  decoy: "诱饵弹",
  c4: "C4"
};

/**
 * Map a raw weapon code to a stable display name.
 *
 * Always returns a non-empty string: a mapped name when known, the generic "刀"
 * for any knife/bayonet variant, otherwise the normalized raw code (never the
 * literal "unknown"-style placeholder). Never returns a purely numeric string,
 * so replay frames stay free of numeric weapon ids.
 */
export function displayWeaponName(raw: string): string {
  const normalized = normalizeWeapon(raw);
  if (!normalized) {
    return raw;
  }
  // Catch all knife/blade variants: knife_*, *knife*, bayonet, karambit, etc.
  if (
    normalized.includes("knife") ||
    normalized.includes("bayonet") ||
    normalized === "karambit"
  ) {
    return "knife";
  }
  return WEAPON_DISPLAY_NAMES[normalized] ?? normalized;
}
