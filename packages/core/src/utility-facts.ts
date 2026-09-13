import type { DemoPackage } from "@cs2dak/contract";
import { activeDamages, isUtilityWeapon, normalizeWeapon } from "./utils.js";

/**
 * 每位选手、每回合的低维道具 sufficient facts。
 *
 * 这是所有 DAK consumer（包括 Studio 与产品 adapter）对 flash / HE / fire /
 * smoke / utility kill 的唯一事件归因口径；只读取已验证的 v3 DemoPackage，
 * 不包含空间或逐事件流。
 */
export type PlayerRoundUtilityFact = {
  roundNumber: number;
  steamId64: string;
  flashesThrown: number;
  enemyBlindSeconds: number;
  teamBlindSeconds: number;
  /** Enemy blind person-events, matching playerStats/presentation semantics. */
  enemyBlindVictims: number;
  /** Flash-assist credits assigned to the flash assister, not the killer. */
  flashAssists: number;
  heThrows: number;
  heDamage: number;
  fireThrows: number;
  fireDamage: number;
  smokesThrown: number;
  utilityKills: number;
  utilityDamage: number;
};

type MutableUtilityFact = Omit<PlayerRoundUtilityFact, "roundNumber" | "steamId64">;

function isFireWeapon(weapon: string): boolean {
  return ["inferno", "molotov", "incgrenade", "incendiary"].includes(normalizeWeapon(weapon));
}

function emptyFact(): MutableUtilityFact {
  return {
    flashesThrown: 0,
    enemyBlindSeconds: 0,
    teamBlindSeconds: 0,
    enemyBlindVictims: 0,
    flashAssists: 0,
    heThrows: 0,
    heDamage: 0,
    fireThrows: 0,
    fireDamage: 0,
    smokesThrown: 0,
    utilityKills: 0,
    utilityDamage: 0,
  };
}

/** Returns one row for every known player and round, including real zeroes. */
export function buildPlayerRoundUtilityFacts(pkg: DemoPackage): PlayerRoundUtilityFact[] {
  const rows = new Map<string, MutableUtilityFact>();
  const damages = activeDamages(pkg);
  const keyFor = (roundNumber: number, playerIndex: number) => `${roundNumber}:${playerIndex}`;
  const factFor = (roundNumber: number, playerIndex: number): MutableUtilityFact | null => {
    if (!pkg.players[playerIndex]) return null;
    const key = keyFor(roundNumber, playerIndex);
    const existing = rows.get(key);
    if (existing) return existing;
    const created = emptyFact();
    rows.set(key, created);
    return created;
  };

  for (const round of pkg.rounds) {
    for (let playerIndex = 0; playerIndex < pkg.players.length; playerIndex += 1) factFor(round.roundNumber, playerIndex);
  }

  for (const grenade of pkg.grenades) {
    const fact = factFor(grenade.roundNumber, grenade.throwerIndex);
    if (!fact) continue;
    if (grenade.grenade === "flashbang") fact.flashesThrown += 1;
    else if (grenade.grenade === "hegrenade") fact.heThrows += 1;
    else if (grenade.grenade === "molotov" || grenade.grenade === "incendiary") fact.fireThrows += 1;
    else if (grenade.grenade === "smoke") fact.smokesThrown += 1;
  }

  for (const blind of pkg.blinds) {
    const flasher = pkg.players[blind.flasherIndex];
    const flashed = pkg.players[blind.flashedIndex];
    const fact = factFor(blind.roundNumber, blind.flasherIndex);
    if (!flasher || !flashed || !fact) continue;
    if (flasher.teamKey !== flashed.teamKey) {
      fact.enemyBlindSeconds += blind.durationSeconds;
      // This is the existing DAK presentation meaning: blinded enemy
      // person-events, not a de-duplicated flash/victim identity.
      fact.enemyBlindVictims += 1;
    } else {
      fact.teamBlindSeconds += blind.durationSeconds;
    }
  }

  for (const damage of damages) {
    if (damage.attackerIndex === null) continue;
    const attacker = pkg.players[damage.attackerIndex];
    const victim = pkg.players[damage.victimIndex];
    const fact = factFor(damage.roundNumber, damage.attackerIndex);
    if (!attacker || !victim || !fact || attacker.teamKey === victim.teamKey) continue;
    if (normalizeWeapon(damage.weapon) === "hegrenade") fact.heDamage += damage.healthDamage;
    if (isFireWeapon(damage.weapon)) fact.fireDamage += damage.healthDamage;
    if (isUtilityWeapon(damage.weapon)) fact.utilityDamage += damage.healthDamage;
  }

  for (const kill of pkg.kills) {
    if (kill.killerIndex !== null) {
      const killerFact = factFor(kill.roundNumber, kill.killerIndex);
      if (killerFact && isUtilityWeapon(kill.weapon)) killerFact.utilityKills += 1;
    }
    if (kill.flashAssist && kill.flashAssisterIndex !== null) {
      const assisterFact = factFor(kill.roundNumber, kill.flashAssisterIndex);
      if (assisterFact) assisterFact.flashAssists += 1;
    }
  }

  return pkg.rounds.flatMap((round) => pkg.players.map((player, playerIndex) => {
    const fact = rows.get(keyFor(round.roundNumber, playerIndex)) ?? emptyFact();
    return {
      roundNumber: round.roundNumber,
      steamId64: player.steamId64,
      flashesThrown: fact.flashesThrown,
      enemyBlindSeconds: fact.enemyBlindSeconds,
      teamBlindSeconds: fact.teamBlindSeconds,
      enemyBlindVictims: fact.enemyBlindVictims,
      flashAssists: fact.flashAssists,
      heThrows: fact.heThrows,
      heDamage: fact.heDamage,
      fireThrows: fact.fireThrows,
      fireDamage: fact.fireDamage,
      smokesThrown: fact.smokesThrown,
      utilityKills: fact.utilityKills,
      utilityDamage: fact.utilityDamage,
    };
  }));
}
