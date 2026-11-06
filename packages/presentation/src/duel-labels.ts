export type MechanicsMetricKey =
  | 'firstShotHit'
  | 'sprayHit'
  | 'counterStrafe'
  | 'oneTap'
  | 'ttk'
  | 'reaction'
  | 'preaim'
  | 'headshot'
  | 'killsPerMatch';
type MetricKey = MechanicsMetricKey;
export type WeaponCategory =
  'rifle' | 'sniper' | 'pistol' | 'submachine_gun' | 'shotgun_lmg' | 'other';

const RIFLES = new Set([
  'ak47',
  'm4a1',
  'm4a4',
  'm4a1_silencer',
  'aug',
  'sg556',
  'sg553',
  'famas',
  'galilar',
  'galil',
]);
const SNIPERS = new Set(['awp', 'ssg08', 'scar20', 'g3sg1']);
const PISTOLS = new Set([
  'deagle',
  'revolver',
  'glock',
  'usp_silencer',
  'usp',
  'hkp2000',
  'p2000',
  'p250',
  'fiveseven',
  'tec9',
  'cz75a',
  'cz75',
  'elite',
]);
const SUBMACHINE_GUNS = new Set(['mp9', 'mp7', 'mp5sd', 'ump45', 'p90', 'bizon', 'mac10']);
const SHOTGUNS_LMG = new Set(['nova', 'xm1014', 'mag7', 'sawedoff', 'm249', 'negev']);
const ONE_TAP_CAPABLE = new Set([
  'ak47',
  'sg556',
  'sg553',
  'deagle',
  'revolver',
  'awp',
  'ssg08',
  'scar20',
  'g3sg1',
]);

export function weaponCategory(weapon: string): WeaponCategory {
  const w = weapon.toLowerCase();
  if (RIFLES.has(w)) return 'rifle';
  if (SNIPERS.has(w)) return 'sniper';
  if (PISTOLS.has(w)) return 'pistol';
  if (SUBMACHINE_GUNS.has(w)) return 'submachine_gun';
  if (SHOTGUNS_LMG.has(w)) return 'shotgun_lmg';
  return 'other';
}

// 狙击：去击杀耗时(≈0)/扫射/one tap(恒满)/预瞄(多为架枪)；手枪：去扫射；冲锋枪：弱化预瞄。
export const CATEGORY_METRICS: Record<WeaponCategory, MetricKey[]> = {
  rifle: [
    'firstShotHit',
    'sprayHit',
    'counterStrafe',
    'ttk',
    'oneTap',
    'reaction',
    'preaim',
    'headshot',
    'killsPerMatch',
  ],
  sniper: ['firstShotHit', 'counterStrafe', 'reaction', 'headshot', 'killsPerMatch'],
  pistol: [
    'firstShotHit',
    'counterStrafe',
    'ttk',
    'oneTap',
    'reaction',
    'headshot',
    'killsPerMatch',
  ],
  submachine_gun: [
    'firstShotHit',
    'sprayHit',
    'counterStrafe',
    'ttk',
    'reaction',
    'headshot',
    'killsPerMatch',
  ],
  shotgun_lmg: ['firstShotHit', 'counterStrafe', 'ttk', 'reaction', 'headshot', 'killsPerMatch'],
  other: ['firstShotHit', 'counterStrafe', 'reaction', 'headshot', 'killsPerMatch'],
};

export function mechanicsMetricsForWeapon(weapon: string): MetricKey[] {
  const category = weaponCategory(weapon);
  const keys = CATEGORY_METRICS[category];
  if (ONE_TAP_CAPABLE.has(weapon.toLowerCase())) return keys;
  return keys.filter((key) => key !== 'oneTap');
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  contested_duel: '正面对枪击杀',
  suppressed_kill: '先手压制击杀',
  caught_off_guard: '无有效视野击杀',
};

export function duelClassificationLabel(classification: string): string {
  return CLASSIFICATION_LABEL[classification] ?? classification;
}
