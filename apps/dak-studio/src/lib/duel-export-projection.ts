import type { DuelFinderRow, PlayerMechanicsRow } from "@cs2dak/contract";
import type { DuelPageState } from "./analysis-theme-state";

// ── 武器分类映射（用于筛选栏） ──
type FilterWeaponCategory = "步枪" | "狙击" | "手枪" | "冲锋枪" | "霰弹机枪";

const WEAPON_CATS: Record<string, FilterWeaponCategory> = {
  // 步枪（从 WEAPON_DISPLAY_NAMES 的 key 看）
  ak47: "步枪", m4a4: "步枪", m4a1: "步枪", m4a1_silencer: "步枪",
  aug: "步枪", sg556: "步枪", sg553: "步枪",
  famas: "步枪", galilar: "步枪", galil: "步枪",
  // 狙击
  awp: "狙击", ssg08: "狙击", scar20: "狙击", g3sg1: "狙击",
  // 手枪
  deagle: "手枪", deserteagle: "手枪", revolver: "手枪",
  glock: "手枪", usp_silencer: "手枪", usp: "手枪",
  hkp2000: "手枪", p2000: "手枪", p250: "手枪",
  fiveseven: "手枪", tec9: "手枪", cz75a: "手枪", cz75: "手枪",
  elite: "手枪",
  // 冲锋枪
  mp9: "冲锋枪", mp7: "冲锋枪", mp5sd: "冲锋枪",
  ump45: "冲锋枪", p90: "冲锋枪", bizon: "冲锋枪", mac10: "冲锋枪",
  // 霰弹/机枪
  nova: "霰弹机枪", xm1014: "霰弹机枪", mag7: "霰弹机枪",
  sawedoff: "霰弹机枪", m249: "霰弹机枪", negev: "霰弹机枪"
};

export function weaponCat(name: string): FilterWeaponCategory | "其他" {
  return WEAPON_CATS[name.toLowerCase()] ?? "其他";
}

export function filteredDuelRows(rows: DuelFinderRow[], filter: DuelPageState["evidenceFilter"], weapon: DuelPageState["weaponCategory"]): DuelFinderRow[] {
  let filtered = rows;
  if (filter === "low_hp") filtered = filtered.filter(r => r.hpBucket === "low_hp");
  else if (filter === "third_party") filtered = filtered.filter(r => r.thirdParty);
  else if (filter !== "all") filtered = filtered.filter(r => r.classification === filter);
  if (weapon !== "全部") filtered = filtered.filter(r => weaponCat(r.weapon) === weapon);
  return [...filtered].sort((a, b) => {
    const orderA = a.ttkMs != null ? 0 : a.hpBucket === "low_hp" ? 1 : 2;
    const orderB = b.ttkMs != null ? 0 : b.hpBucket === "low_hp" ? 1 : 2;
    return orderA - orderB || a.roundNumber - b.roundNumber || a.tick - b.tick;
  });
}

export function groupDuelMechanics(rows: PlayerMechanicsRow[], duelRows: DuelFinderRow[]) {
    const byPlayer = new Map<string, { name: string; teamName: string; rows: PlayerMechanicsRow[]; duels: DuelFinderRow[] }>();
    for (const row of rows) {
      const current = byPlayer.get(row.steamId64) ?? { name: row.playerName, teamName: row.teamName, rows: [], duels: [] };
      current.rows.push(row);
      byPlayer.set(row.steamId64, current);
    }
    for (const duel of duelRows) {
      const current = byPlayer.get(duel.killerSteamId64);
      if (current) current.duels.push(duel);
    }
    return [...byPlayer.entries()]
      .map(([steamId64, data]) => ({
        steamId64,
        ...data,
        rows: [...data.rows].sort((a, b) => b.killCount - a.killCount || b.shotCount - a.shotCount)
      }))
      .sort((a, b) => b.duels.length - a.duels.length || a.name.localeCompare(b.name));
}
