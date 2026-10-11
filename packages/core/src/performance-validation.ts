import { isUtilityWeapon, normalizeWeapon } from "./utils.js";
import type { DemoPackage } from "@cs2dak/contract";
import { emptyPerformanceUtility, orderedPerformanceKills, type PlayerRoundPerformanceFacts } from "./performance-facts.js";

const countFields = ["kills", "deaths", "assists", "headshots", "tradeKills", "tradedDeaths", "combatDeaths", "bombDeaths"] as const;
const key = (round: number, steam: string) => `${round}\u0000${steam}`;
function invalid(path: string): never { throw new Error(`Core performance facts violate source invariant: ${path}`); }
function nonnegative(value: number, path: string, integer = true): void {
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) invalid(path);
}

/** Validate event-derived identities, coverage, conservation and opening pairs; never read playerStats. */
export function assertPlayerRoundPerformanceFacts(pkg: DemoPackage, facts: PlayerRoundPerformanceFacts): void {
  const players = new Map(pkg.players.map(player => [player.steamId64, player]));
  const rounds = new Map(pkg.rounds.map(round => [round.roundNumber, round]));
  if (players.size !== pkg.players.length || rounds.size !== pkg.rounds.length) invalid("duplicate source identity");
  const expected = new Map<string, Record<(typeof countFields)[number] | "damage", number>>();
  for (const round of pkg.rounds) for (const player of pkg.players) {
    expected.set(key(round.roundNumber, player.steamId64), { kills: 0, deaths: 0, assists: 0, damage: 0, headshots: 0, tradeKills: 0, tradedDeaths: 0, combatDeaths: 0, bombDeaths: 0 });
  }
  const expectedRow = (round: number, index: number) => {
    const player = pkg.players[index];
    const row = player && expected.get(key(round, player.steamId64));
    if (!row) invalid(`unknown source player/round ${index}/${round}`);
    return row;
  };
  const utilities = new Map([...expected.keys()].map(id => [id, emptyPerformanceUtility()]));
  const objectives = new Map([...expected.keys()].map(id => [id, { plants: 0, defuses: 0 }]));
  const clutches = new Map<string, PlayerRoundPerformanceFacts["playerRounds"][number]["clutch"]>();
  const sourceId = (round: number, index: number) => {
    expectedRow(round, index);
    return key(round, pkg.players[index]!.steamId64);
  };
  const utilityFor = (round: number, index: number) => utilities.get(sourceId(round, index))!;
  const alive = new Map(pkg.rounds.map(round => [round.roundNumber, new Set(pkg.players.map((_, index) => index))]));
  const weaponCounts = new Map<string, Map<string, Record<string, number>>>();
  const expectedStates: PlayerRoundPerformanceFacts["manState"] = [];
  const openings = new Map<number, { winner: string; loser: string; tick: number }>();
  const kills = orderedPerformanceKills(pkg);
  for (const { kill, killer, victim, playerKill, enemyKill } of kills) {
    const dead = expectedRow(kill.roundNumber, kill.victimIndex);
    dead.deaths++;
    if (!killer || kill.killerIndex === kill.victimIndex) dead.bombDeaths++; else dead.combatDeaths++;
    if (kill.tradeDeath) dead.tradedDeaths++;
    if (playerKill && kill.assisterIndex !== null) {
      expectedRow(kill.roundNumber, kill.assisterIndex).assists++;
      if (kill.flashAssist) utilityFor(kill.roundNumber, kill.assisterIndex).flashAssists++;
    }
    const live = alive.get(kill.roundNumber)!;
    const countA = () => [...live].filter(index => pkg.players[index]!.teamKey === "teamA").length;
    const preA = countA(), preB = live.size - preA;
    live.delete(kill.victimIndex);
    const postA = countA(), postB = live.size - postA;
    if (enemyKill) expectedStates.push({ roundNumber: kill.roundNumber, tick: kill.tick, killerSteamId64: killer!.steamId64, killerTeamKey: killer!.teamKey, victimSteamId64: victim.steamId64, victimTeamKey: victim.teamKey, advantageTeamKey: postA === postB ? null : postA > postB ? "teamA" : "teamB", advantageAlive: Math.max(postA, postB), disadvantageAlive: Math.min(postA, postB), preAdvantageTeamKey: preA === preB ? null : preA > preB ? "teamA" : "teamB", preAdvantageAlive: Math.max(preA, preB), preDisadvantageAlive: Math.min(preA, preB) });
    if (enemyKill) {
      const credited = expectedRow(kill.roundNumber, kill.killerIndex!);
      credited.kills++;
      const id = sourceId(kill.roundNumber, kill.killerIndex!);
      const weapons = weaponCounts.get(id) ?? new Map<string, Record<string, number>>();
      const name = normalizeWeapon(kill.weapon);
      const weapon = weapons.get(name) ?? { kills: 0, headshotKills: 0, tradeKills: 0, noScopeKills: 0, throughSmokeKills: 0, wallbangKills: 0, penetratedObjects: 0 };
      weapon.kills++;
      if (kill.headshot) weapon.headshotKills++;
      if (kill.tradeKill) weapon.tradeKills++;
      if (kill.noScope) weapon.noScopeKills++;
      if (kill.throughSmoke) weapon.throughSmokeKills++;
      if ((kill.penetratedObjects ?? 0) > 0) weapon.wallbangKills++;
      weapon.penetratedObjects += kill.penetratedObjects ?? 0;
      weapons.set(name, weapon); weaponCounts.set(id, weapons);
      if (isUtilityWeapon(kill.weapon)) utilityFor(kill.roundNumber, kill.killerIndex!).utilityKills++;
      if (kill.headshot) credited.headshots++;
      if (kill.tradeKill) credited.tradeKills++;
      if (!openings.has(kill.roundNumber)) openings.set(kill.roundNumber, { winner: killer!.steamId64, loser: victim.steamId64, tick: kill.tick });
    }
  }
  for (const damage of pkg.damages) {
    if (damage.attackerIndex === null) continue;
    const attacker = pkg.players[damage.attackerIndex], victim = pkg.players[damage.victimIndex];
    if (!attacker || !victim) invalid("damage player identity");
    if (attacker.teamKey !== victim.teamKey) {
      expectedRow(damage.roundNumber, damage.attackerIndex).damage += damage.healthDamage;
      const utility = utilityFor(damage.roundNumber, damage.attackerIndex);
      if (isUtilityWeapon(damage.weapon)) utility.utilityDamage += damage.healthDamage;
      if (normalizeWeapon(damage.weapon) === "hegrenade") utility.heDamage += damage.healthDamage;
      if (["inferno", "molotov", "incgrenade", "incendiary"].includes(normalizeWeapon(damage.weapon))) utility.fireDamage += damage.healthDamage;
    }
  }
  for (const grenade of pkg.grenades) {
    const utility = utilityFor(grenade.roundNumber, grenade.throwerIndex);
    utility.grenadesThrown++;
    if (grenade.grenade === "flashbang") utility.flashesThrown++;
    else if (grenade.grenade === "hegrenade") utility.heThrows++;
    else if (grenade.grenade === "molotov" || grenade.grenade === "incendiary") utility.fireThrows++;
    else if (grenade.grenade === "smoke") utility.smokesThrown++;
  }
  for (const blind of pkg.blinds) {
    const flasher = pkg.players[blind.flasherIndex], flashed = pkg.players[blind.flashedIndex];
    if (!flasher || !flashed) invalid("blind player identity");
    const utility = utilityFor(blind.roundNumber, blind.flasherIndex);
    if (flasher.teamKey === flashed.teamKey) utility.teamBlindSeconds += blind.durationSeconds;
    else { utility.enemyBlindSeconds += blind.durationSeconds; utility.enemyBlindVictims++; }
  }
  for (const bomb of pkg.bombs) {
    if (bomb.actorIndex === null || (bomb.type !== "planted" && bomb.type !== "defused")) continue;
    objectives.get(sourceId(bomb.roundNumber, bomb.actorIndex))![bomb.type === "planted" ? "plants" : "defuses"]++;
  }
  for (const clutch of pkg.clutches) {
    const id = sourceId(clutch.roundNumber, clutch.clutcherIndex);
    if (clutches.has(id)) invalid("duplicate source clutch");
    clutches.set(id, { opponentCount: clutch.opponentCount as 1 | 2 | 3 | 4 | 5, won: clutch.won, survived: clutch.survived, killCount: clutch.killCount, tick: clutch.tick });
  }
  const seen = new Set<string>();
  for (const row of facts.playerRounds) {
    const id = key(row.roundNumber, row.steamId64), source = expected.get(id);
    const player = players.get(row.steamId64), round = rounds.get(row.roundNumber);
    const path = `round=${row.roundNumber},playerIndex=${pkg.players.findIndex(candidate => candidate.steamId64 === row.steamId64)}`;
    if (!source || !player || !round || seen.has(id)) invalid(`unknown or duplicate player-round ${path}`);
    seen.add(id);
    if (row.teamKey !== player.teamKey || row.side !== (player.teamKey === "teamA" ? round.teamASide : round.teamBSide) || row.teamWonRound !== (round.winnerTeamKey === player.teamKey)) invalid(`identity/side/winner ${path}`);
    for (const field of countFields) { nonnegative(row[field], `${path}.${field}`); if (row[field] !== source[field]) invalid(`${path}.${field}`); }
    nonnegative(row.damage, `${path}.damage`, false);
    if (Math.abs(row.damage - source.damage) > 1e-6) invalid(`${path}.damage`);
    if (row.survived !== (row.deaths === 0)) invalid(`${path}.survived`);
    const opening = openings.get(row.roundNumber);
    const duel = opening?.winner === row.steamId64 ? "won" : opening?.loser === row.steamId64 ? "lost" : "none";
    if (row.openingDuel !== duel || row.openingTick !== (duel === "none" ? null : opening!.tick)) invalid(`${path}.openingDuel`);
    const expectedUtility = utilities.get(id)!;
    for (const [field, value] of Object.entries(expectedUtility)) {
      const actual = row.utility[field as keyof typeof row.utility];
      nonnegative(actual, `${path}.utility.${field}`, !field.endsWith("Seconds"));
      if (Math.abs(actual - value) > 1e-6) invalid(`${path}.utility.${field}`);
    }
    for (const field of ["plants", "defuses"] as const) {
      nonnegative(row.objective[field], `${path}.objective.${field}`);
      if (row.objective[field] !== objectives.get(id)![field]) invalid(`${path}.objective.${field}`);
    }
    const clutch = clutches.get(id) ?? null;
    if ((row.clutch === null) !== (clutch === null)) invalid(`${path}.clutch`);
    if (clutch && row.clutch) for (const field of ["opponentCount", "won", "survived", "killCount", "tick"] as const) if (row.clutch[field] !== clutch[field]) invalid(`${path}.clutch.${field}`);
    const weapons = new Set<string>();
    for (const weapon of row.weapons) {
      if (weapons.has(weapon.weapon)) invalid(`${path}.duplicate weapon`);
      weapons.add(weapon.weapon);
      const expectedWeapon = weaponCounts.get(id)?.get(weapon.weapon);
      if (!expectedWeapon) invalid(`${path}.weapon identity`);
      for (const [field, value] of Object.entries(expectedWeapon)) if (weapon[field as keyof typeof weapon] !== value) invalid(`${path}.weapon.${field}`);
      for (const [field, value] of Object.entries(weapon)) if (field !== "weapon") nonnegative(value as number, `${path}.weapon.${field}`);
      if (weapon.headshotKills > weapon.kills || weapon.tradeKills > weapon.kills) invalid(`${path}.weapon credit`);
    }
    if (row.weapons.reduce((sum, w) => sum + w.kills, 0) !== row.kills || row.weapons.reduce((sum, w) => sum + w.headshotKills, 0) !== row.headshots) invalid(`${path}.weapon totals`);
    const tags = [row.kills > 0 && "kill", row.assists > 0 && "assist", row.survived && "survive", row.tradedDeaths > 0 && "trade"].filter(Boolean);
    if (row.kast !== (tags.length > 0) || new Set(row.kastTags).size !== row.kastTags.length || tags.length !== row.kastTags.length || !tags.every(tag => row.kastTags.includes(tag as typeof row.kastTags[number]))) invalid(`${path}.kast`);
  }
  if (seen.size !== expected.size) invalid("player-round coverage");
  if (facts.manState.length !== expectedStates.length) invalid("manState coverage");
  facts.manState.forEach((state, index) => {
    const expectedState = expectedStates[index]!;
    for (const field of Object.keys(expectedState) as Array<keyof typeof expectedState>) if (state[field] !== expectedState[field]) invalid(`manState.${index}.${field}`);
  });
}
