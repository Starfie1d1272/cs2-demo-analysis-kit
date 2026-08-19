const STEM_ALIASES: Record<string, string> = {
  mac_10: "mac10",
  knife_ct: "knife",
  planted_c4: "c4",
  defuse_kit: "defuser",
  world: "suicide",
  m4a1_s: "m4a1_silencer",
  usp_s: "usp_silencer",
  dual_berettas: "elite",
  desert_eagle: "deagle",
  smoke: "smokegrenade",
  incendiary: "incgrenade",
  incendiary_grenade: "incgrenade",
  he: "hegrenade",
  high_explosive_grenade: "hegrenade",
};

const HUD_STEMS = [
  "m4a1_silencer_off", "m4a1_silencer", "usp_silencer_off", "usp_silencer",
  "smokegrenade", "hegrenade", "incgrenade", "flashbang", "frag_grenade",
  "hkp2000", "fiveseven", "sawedoff", "revolver", "galilar", "g3sg1",
  "scar20", "sg556", "ssg08", "cz75a", "deagle", "ump45", "mp5sd",
  "mac_10", "mac10", "tec9", "bizon", "p2000", "p250", "elite",
  "famas", "glock", "m249", "mag7", "molotov", "negev", "nova",
  "p90", "mp7", "mp9", "aug", "awp", "ak47", "m4a1", "xm1014",
  "decoy", "taser", "c4", "defuser", "armor_helmet", "armor", "knife",
].sort((left, right) => right.length - left.length || left.localeCompare(right));

/** 与授权复用的 CS2 HUD SVG 文件名保持一致。 */
export function resolveReplayHudStem(raw: string | null | undefined): string | null {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^weapon_/, "")
    .replace(/-/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
  if (!normalized) return null;
  if (STEM_ALIASES[normalized]) return STEM_ALIASES[normalized]!;
  const compact = normalized.replace(/_/g, "");
  for (const stem of HUD_STEMS) {
    if (normalized.includes(stem) || compact.includes(stem.replace(/_/g, ""))) {
      return STEM_ALIASES[stem] ?? stem;
    }
  }
  return null;
}

export function ReplayHudIcon({
  kind,
  label,
  assetBaseUrl,
  className = "",
}: {
  kind: string | null | undefined;
  label: string;
  assetBaseUrl?: string | null;
  className?: string;
}) {
  const stem = resolveReplayHudStem(kind);
  if (!stem || !assetBaseUrl) return <span className={`dak-hud-text ${className}`.trim()}>{label}</span>;
  return (
    <span className={`dak-hud-icon ${className}`.trim()} aria-label={label} data-tooltip={label} tabIndex={0}>
      <img src={`${assetBaseUrl.replace(/\/$/, "")}/${stem}.svg`} alt="" aria-hidden="true" />
    </span>
  );
}
