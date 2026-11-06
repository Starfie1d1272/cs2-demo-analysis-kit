export function normalizeWeapon(weapon: string): string {
  return weapon
    .trim()
    .toLowerCase()
    .replace(/^weapon_/, '');
}

export function isNamedWeapon(value: string): boolean {
  const normalized = normalizeWeapon(value);
  return (
    normalized.length > 0 &&
    !/^\d+$/.test(normalized) &&
    !['nan', 'none', 'null'].includes(normalized)
  );
}
