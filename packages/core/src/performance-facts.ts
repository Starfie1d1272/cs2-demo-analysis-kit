import type {
  DemoPackage,
  EconomyType,
  PlayerRoundFact,
  Side,
  TeamKey,
} from "@cs2dak/contract";
import { isUtilityWeapon, normalizeWeapon } from "./utils.js";

export type PlayerRoundPerformanceKastTag = "kill" | "assist" | "survive" | "trade";

export interface PlayerRoundPerformanceUtilityFact {
  flashesThrown: number;
  enemyBlindSeconds: number;
  teamBlindSeconds: number;
  enemyBlindVictims: number;
  flashAssists: number;
  heThrows: number;
  heDamage: number;
  fireThrows: number;
  fireDamage: number;
  smokesThrown: number;
  grenadesThrown: number;
  utilityKills: number;
  utilityDamage: number;
}

export interface PlayerRoundPerformanceWeaponFact {
  weapon: string;
  kills: number;
  headshotKills: number;
  tradeKills: number;
  noScopeKills: number;
  throughSmokeKills: number;
  wallbangKills: number;
  penetratedObjects: number;
}

export interface PlayerRoundPerformanceObjectiveFact {
  plants: number;
  defuses: number;
}

export interface PlayerRoundPerformanceClutchFact {
  opponentCount: 1 | 2 | 3 | 4 | 5;
  won: boolean;
  survived: boolean;
  killCount: number;
  tick: number;
}

export interface PlayerRoundPerformanceFact {
  roundNumber: number;
  steamId64: string;
  name: string;
  teamKey: TeamKey;
  side: Side;
  teamWonRound: boolean;

  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  headshots: number;
  survived: boolean;
  openingDuel: "none" | "won" | "lost";
  openingTick: number | null;
  kast: boolean;
  kastTags: PlayerRoundPerformanceKastTag[];
  tradeKills: number;
  tradedDeaths: number;
  combatDeaths: number;
  bombDeaths: number;

  clutch: PlayerRoundPerformanceClutchFact | null;
  utility: PlayerRoundPerformanceUtilityFact;
  objective: PlayerRoundPerformanceObjectiveFact;
  weapons: PlayerRoundPerformanceWeaponFact[];

  equipmentValue: number | null;
  economyType: EconomyType | null;
}

/** A canonical state transition consumed by RR and legacy tournament views. */
export interface PlayerRoundManStateFact {
  roundNumber: number;
  tick: number;
  killerSteamId64: string;
  killerTeamKey: TeamKey;
  /** State after this kill; used by conversion projections. */
  advantageTeamKey: TeamKey | null;
  advantageAlive: number;
  disadvantageAlive: number;
  /** State immediately before this kill; used by RR kill-context buckets. */
  preAdvantageTeamKey: TeamKey | null;
  preAdvantageAlive: number;
  preDisadvantageAlive: number;
}

/**
 * One build gives every performance consumer the same source facts. The
 * package-level manState rows are included because they preserve the ordered
 * transitions needed by the legacy team-conversion projection.
 */
export interface PlayerRoundPerformanceFacts {
  playerRounds: PlayerRoundPerformanceFact[];
  manState: PlayerRoundManStateFact[];
}

export interface PlayerPerformanceWeaponAggregate extends PlayerRoundPerformanceWeaponFact {}

export interface PlayerPerformanceClutchAggregate {
  attempts: number;
  wins: number;
  byOpponentCount: Record<"1" | "2" | "3" | "4" | "5", { attempts: number; wins: number }>;
}

export interface PlayerPerformanceAggregate {
  steamId64: string;
  name: string;
  teamKey: TeamKey;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  headshots: number;
  firstKills: number;
  firstDeaths: number;
  kastRounds: number;
  survivalRounds: number;
  tradeKills: number;
  tradedDeaths: number;
  combatDeaths: number;
  bombDeaths: number;
  oneKillRounds: number;
  twoKillRounds: number;
  threeKillRounds: number;
  fourKillRounds: number;
  fiveKillRounds: number;
  utility: PlayerRoundPerformanceUtilityFact;
  objective: PlayerRoundPerformanceObjectiveFact;
  clutch: PlayerPerformanceClutchAggregate;
  weapons: PlayerPerformanceWeaponAggregate[];
}

type MutablePlayerRound = Omit<PlayerRoundPerformanceFact, "weapons" | "kastTags"> & {
  weapons: Map<string, PlayerRoundPerformanceWeaponFact>;
  kastTags: Set<PlayerRoundPerformanceKastTag>;
};

type MutableAggregate = Omit<PlayerPerformanceAggregate, "weapons" | "clutch"> & {
  roundsSeen: Set<number>;
  weapons: Map<string, PlayerPerformanceWeaponAggregate>;
  clutch: PlayerPerformanceClutchAggregate;
};

const KAST_TAGS: readonly PlayerRoundPerformanceKastTag[] = ["kill", "assist", "survive", "trade"];
const CLUTCH_COUNTS = [1, 2, 3, 4, 5] as const;

function keyFor(roundNumber: number, playerIndex: number): string {
  return `${roundNumber}\u0000${playerIndex}`;
}

function playerAt(pkg: DemoPackage, playerIndex: number, context: string): DemoPackage["players"][number] {
  const player = pkg.players[playerIndex];
  if (!player) throw new Error(`Core performance fact ${context} references unknown playerIndex=${playerIndex}`);
  return player;
}

function roundAt(pkg: DemoPackage, roundNumber: number, context: string): DemoPackage["rounds"][number] {
  const round = pkg.rounds.find((row) => row.roundNumber === roundNumber);
  if (!round) throw new Error(`Core performance fact ${context} references unknown roundNumber=${roundNumber}`);
  return round;
}

function emptyUtility(): PlayerRoundPerformanceUtilityFact {
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
    grenadesThrown: 0,
    utilityKills: 0,
    utilityDamage: 0,
  };
}

function emptyObjective(): PlayerRoundPerformanceObjectiveFact {
  return { plants: 0, defuses: 0 };
}

function emptyRoundFact(
  pkg: DemoPackage,
  round: DemoPackage["rounds"][number],
  player: DemoPackage["players"][number],
  playerIndex: number,
): MutablePlayerRound {
  const economy = (pkg.playerEconomies ?? []).find((row) => row.roundNumber === round.roundNumber && row.playerIndex === playerIndex);
  const side = player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
  return {
    roundNumber: round.roundNumber,
    steamId64: player.steamId64,
    name: player.name,
    teamKey: player.teamKey,
    side,
    teamWonRound: round.winnerTeamKey === player.teamKey,
    kills: 0,
    deaths: 0,
    assists: 0,
    damage: 0,
    headshots: 0,
    survived: true,
    openingDuel: "none",
    openingTick: null,
    kast: false,
    kastTags: new Set(),
    tradeKills: 0,
    tradedDeaths: 0,
    combatDeaths: 0,
    bombDeaths: 0,
    clutch: null,
    utility: emptyUtility(),
    objective: emptyObjective(),
    weapons: new Map(),
    equipmentValue: economy?.equipmentValue ?? null,
    economyType: economy?.type ?? null,
  };
}

function weaponFor(row: Map<string, PlayerRoundPerformanceWeaponFact>, weapon: string): PlayerRoundPerformanceWeaponFact {
  const existing = row.get(weapon);
  if (existing) return existing;
  const created = {
    weapon,
    kills: 0,
    headshotKills: 0,
    tradeKills: 0,
    noScopeKills: 0,
    throughSmokeKills: 0,
    wallbangKills: 0,
    penetratedObjects: 0,
  };
  row.set(weapon, created);
  return created;
}

function fireWeapon(weapon: string): boolean {
  return ["inferno", "molotov", "incgrenade", "incendiary"].includes(normalizeWeapon(weapon));
}

function sortKills(pkg: DemoPackage): Array<{ kill: DemoPackage["kills"][number]; index: number }> {
  return (pkg.kills ?? [])
    .map((kill, index) => ({ kill, index }))
    .sort((left, right) => left.kill.roundNumber - right.kill.roundNumber || left.kill.tick - right.kill.tick || left.index - right.index);
}

function addKastTags(row: MutablePlayerRound): void {
  if (row.kills > 0) row.kastTags.add("kill");
  if (row.assists > 0) row.kastTags.add("assist");
  if (row.survived) row.kastTags.add("survive");
  if (row.tradedDeaths > 0) row.kastTags.add("trade");
  row.kast = row.kastTags.size > 0;
}

function clutchOpponentCount(value: number): 1 | 2 | 3 | 4 | 5 {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error(`Core performance fact has invalid clutch opponentCount=${value}`);
  return value as 1 | 2 | 3 | 4 | 5;
}

/**
 * The only DAK owner that turns v3 observed events into player-round
 * performance semantics. Downstream packages receive this result and only
 * aggregate, map identities, or shape product DTOs.
 */
export function buildPlayerRoundPerformanceFacts(pkg: DemoPackage): PlayerRoundPerformanceFacts {
  const rounds = pkg.rounds ?? [];
  const players = pkg.players ?? [];
  const roundsByNumber = new Map(rounds.map((round) => [round.roundNumber, round]));
  const rows = new Map<string, MutablePlayerRound>();
  if (rounds.length === 0) return { playerRounds: [], manState: [] };
  for (const round of rounds) {
    for (const [playerIndex, player] of players.entries()) {
      rows.set(keyFor(round.roundNumber, playerIndex), emptyRoundFact(pkg, round, player, playerIndex));
    }
  }

  const rowFor = (roundNumber: number, playerIndex: number, context: string): MutablePlayerRound => {
    playerAt(pkg, playerIndex, context);
    roundAt(pkg, roundNumber, context);
    const row = rows.get(keyFor(roundNumber, playerIndex));
    if (!row) throw new Error(`Core performance fact ${context} has no player-round row`);
    return row;
  };

  const sortedKills = sortKills(pkg);
  const openingByRound = new Map<number, DemoPackage["kills"][number]>();
  for (const { kill } of sortedKills) {
    const killer = kill.killerIndex === null ? null : playerAt(pkg, kill.killerIndex, "kills");
    const victim = playerAt(pkg, kill.victimIndex, "kills");
    // cs2df playerStats defines the opening event as the first kill with a
    // player killer. Keep teammate/world deaths out only when the killer is
    // absent; do not invent a cross-team-only opening rule here.
    if (killer && !openingByRound.has(kill.roundNumber)) {
      openingByRound.set(kill.roundNumber, kill);
    }

    if (killer) {
      const killerRow = rowFor(kill.roundNumber, kill.killerIndex!, "kills");
      killerRow.kills += 1;
      if (kill.headshot) killerRow.headshots += 1;
      if (kill.tradeKill) killerRow.tradeKills += 1;
      if (isUtilityWeapon(kill.weapon)) killerRow.utility.utilityKills += 1;
      const weapon = weaponFor(killerRow.weapons, normalizeWeapon(kill.weapon));
      weapon.kills += 1;
      if (kill.headshot) weapon.headshotKills += 1;
      if (kill.tradeKill) weapon.tradeKills += 1;
      if (kill.noScope) weapon.noScopeKills += 1;
      if (kill.throughSmoke) weapon.throughSmokeKills += 1;
      if ((kill.penetratedObjects ?? 0) > 0) weapon.wallbangKills += 1;
      weapon.penetratedObjects += kill.penetratedObjects ?? 0;
    }

    const victimRow = rowFor(kill.roundNumber, kill.victimIndex, "kills");
    victimRow.deaths += 1;
    if (kill.killerIndex === null) victimRow.bombDeaths += 1;
    else victimRow.combatDeaths += 1;
    if (kill.tradeDeath) victimRow.tradedDeaths += 1;

    if (kill.assisterIndex !== null) {
      const assisterRow = rowFor(kill.roundNumber, kill.assisterIndex, "kills.assisterIndex");
      assisterRow.assists += 1;
      if (kill.flashAssist) {
        if (kill.flashAssisterIndex !== kill.assisterIndex) {
          throw new Error(`Core performance fact flash assist mismatch at round=${kill.roundNumber}, tick=${kill.tick}`);
        }
        assisterRow.utility.flashAssists += 1;
      }
    } else if (kill.flashAssist || kill.flashAssisterIndex !== null) {
      throw new Error(`Core performance fact flash assist has no canonical assister at round=${kill.roundNumber}, tick=${kill.tick}`);
    }
  }

  for (const damage of pkg.damages ?? []) {
    if (damage.attackerIndex === null) continue;
    const attacker = playerAt(pkg, damage.attackerIndex, "damages.attackerIndex");
    const victim = playerAt(pkg, damage.victimIndex, "damages.victimIndex");
    if (attacker.teamKey === victim.teamKey) continue;
    const row = rowFor(damage.roundNumber, damage.attackerIndex, "damages");
    row.damage += damage.healthDamage;
    if (isUtilityWeapon(damage.weapon)) row.utility.utilityDamage += damage.healthDamage;
    if (normalizeWeapon(damage.weapon) === "hegrenade") row.utility.heDamage += damage.healthDamage;
    if (fireWeapon(damage.weapon)) row.utility.fireDamage += damage.healthDamage;
  }

  for (const grenade of pkg.grenades ?? []) {
    const row = rowFor(grenade.roundNumber, grenade.throwerIndex, "grenades.throwerIndex");
    row.utility.grenadesThrown += 1;
    if (grenade.grenade === "flashbang") row.utility.flashesThrown += 1;
    else if (grenade.grenade === "hegrenade") row.utility.heThrows += 1;
    else if (grenade.grenade === "molotov" || grenade.grenade === "incendiary") row.utility.fireThrows += 1;
    else if (grenade.grenade === "smoke") row.utility.smokesThrown += 1;
  }

  for (const blind of pkg.blinds ?? []) {
    const flasher = playerAt(pkg, blind.flasherIndex, "blinds.flasherIndex");
    const flashed = playerAt(pkg, blind.flashedIndex, "blinds.flashedIndex");
    const row = rowFor(blind.roundNumber, blind.flasherIndex, "blinds");
    if (flasher.teamKey === flashed.teamKey) row.utility.teamBlindSeconds += blind.durationSeconds;
    else {
      row.utility.enemyBlindSeconds += blind.durationSeconds;
      row.utility.enemyBlindVictims += 1;
    }
  }

  for (const clutch of pkg.clutches ?? []) {
    const row = rowFor(clutch.roundNumber, clutch.clutcherIndex, "clutches");
    if (row.clutch !== null) throw new Error(`Core performance fact duplicate clutch at round=${clutch.roundNumber}, playerIndex=${clutch.clutcherIndex}`);
    row.clutch = {
      opponentCount: clutchOpponentCount(clutch.opponentCount),
      won: clutch.won,
      survived: clutch.survived,
      killCount: clutch.killCount,
      tick: clutch.tick,
    };
  }

  for (const bomb of pkg.bombs ?? []) {
    if (bomb.type !== "planted" && bomb.type !== "defused") continue;
    if (bomb.actorIndex === null) continue;
    const row = rowFor(bomb.roundNumber, bomb.actorIndex, "bombs.actorIndex");
    if (bomb.type === "planted") row.objective.plants += 1;
    else row.objective.defuses += 1;
  }

  const aliveByRound = new Map<number, { teamA: Set<number>; teamB: Set<number> }>();
  for (const round of rounds) {
    aliveByRound.set(round.roundNumber, {
      teamA: new Set(players.flatMap((player, index) => player.teamKey === "teamA" ? [index] : [])),
      teamB: new Set(players.flatMap((player, index) => player.teamKey === "teamB" ? [index] : [])),
    });
  }
  const manState: PlayerRoundManStateFact[] = [];
  for (const { kill } of sortedKills) {
    if (kill.killerIndex === null) continue;
    const killer = playerAt(pkg, kill.killerIndex, "manState.killerIndex");
    const victim = playerAt(pkg, kill.victimIndex, "manState.victimIndex");
    if (killer.teamKey === victim.teamKey) continue;
    const alive = aliveByRound.get(kill.roundNumber);
    if (!alive) throw new Error(`Core performance fact manState has unknown round=${kill.roundNumber}`);
    const preTeamAAlive = alive.teamA.size;
    const preTeamBAlive = alive.teamB.size;
    const preAdvantageTeamKey: TeamKey | null = preTeamAAlive === preTeamBAlive
      ? null
      : preTeamAAlive > preTeamBAlive ? "teamA" : "teamB";
    const preAdvantageAlive = Math.max(preTeamAAlive, preTeamBAlive);
    const preDisadvantageAlive = Math.min(preTeamAAlive, preTeamBAlive);
    alive[victim.teamKey].delete(kill.victimIndex);
    const teamAAlive = alive.teamA.size;
    const teamBAlive = alive.teamB.size;
    const advantageTeamKey: TeamKey | null = teamAAlive === teamBAlive
      ? null
      : teamAAlive > teamBAlive ? "teamA" : "teamB";
    manState.push({
      roundNumber: kill.roundNumber,
      tick: kill.tick,
      killerSteamId64: killer.steamId64,
      killerTeamKey: killer.teamKey,
      advantageTeamKey,
      advantageAlive: Math.max(teamAAlive, teamBAlive),
      disadvantageAlive: Math.min(teamAAlive, teamBAlive),
      preAdvantageTeamKey,
      preAdvantageAlive,
      preDisadvantageAlive,
    });
  }

  for (const [roundNumber, kill] of openingByRound) {
    if (kill.killerIndex !== null) {
      const winner = rowFor(roundNumber, kill.killerIndex, "opening");
      winner.openingDuel = "won";
      winner.openingTick = kill.tick;
    }
    const loser = rowFor(roundNumber, kill.victimIndex, "opening");
    loser.openingDuel = "lost";
    loser.openingTick = kill.tick;
  }

  const playerRounds = rounds.flatMap((round) => players.map((player, playerIndex) => {
    const row = rows.get(keyFor(round.roundNumber, playerIndex));
    if (!row) throw new Error(`Core performance fact missing player-round row for round=${round.roundNumber}, playerIndex=${playerIndex}`);
    row.survived = row.deaths === 0;
    addKastTags(row);
    return {
      ...row,
      kastTags: KAST_TAGS.filter((tag) => row.kastTags.has(tag)),
      weapons: [...row.weapons.values()].sort((left, right) => left.weapon.localeCompare(right.weapon)),
    } satisfies PlayerRoundPerformanceFact;
  }));

  // Keep this assertion close to the producer: a round in the source must have
  // one side and one winner, otherwise every downstream side slice is unsafe.
  for (const round of roundsByNumber.values()) {
    if (round.teamASide === round.teamBSide) throw new Error(`Core performance fact round=${round.roundNumber} has identical sides`);
  }

  return { playerRounds, manState };
}

/** Backwards-compatible 1.0 projection; it contains no independent rules. */
export function toPlayerRoundFacts(facts: PlayerRoundPerformanceFacts): PlayerRoundFact[] {
  return facts.playerRounds.map((row) => ({
    roundNumber: row.roundNumber,
    steamId64: row.steamId64,
    name: row.name,
    teamKey: row.teamKey,
    side: row.side,
    survived: row.survived,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    damage: row.damage,
    utilityDamage: row.utility.utilityDamage,
    flashAssists: row.utility.flashAssists,
    tradeKills: row.tradeKills,
    tradedDeaths: row.tradedDeaths,
    openingDuel: row.openingDuel,
    kastTags: row.kastTags,
    equipmentValue: row.equipmentValue,
    economyType: row.economyType,
  }));
}

function emptyClutchAggregate(): PlayerPerformanceClutchAggregate {
  return {
    attempts: 0,
    wins: 0,
    byOpponentCount: {
      "1": { attempts: 0, wins: 0 },
      "2": { attempts: 0, wins: 0 },
      "3": { attempts: 0, wins: 0 },
      "4": { attempts: 0, wins: 0 },
      "5": { attempts: 0, wins: 0 },
    },
  };
}

type PerformanceIdentity = Pick<DemoPackage["players"][number], "steamId64" | "name" | "teamKey">;

function emptyAggregateForIdentity(identity: PerformanceIdentity): MutableAggregate {
  return {
    steamId64: identity.steamId64,
    name: identity.name,
    teamKey: identity.teamKey,
    rounds: 0,
    roundsSeen: new Set(),
    kills: 0,
    deaths: 0,
    assists: 0,
    damage: 0,
    headshots: 0,
    firstKills: 0,
    firstDeaths: 0,
    kastRounds: 0,
    survivalRounds: 0,
    tradeKills: 0,
    tradedDeaths: 0,
    combatDeaths: 0,
    bombDeaths: 0,
    oneKillRounds: 0,
    twoKillRounds: 0,
    threeKillRounds: 0,
    fourKillRounds: 0,
    fiveKillRounds: 0,
    utility: emptyUtility(),
    objective: emptyObjective(),
    clutch: emptyClutchAggregate(),
    weapons: new Map(),
  };
}

function emptyAggregate(row: PlayerRoundPerformanceFact): MutableAggregate {
  return emptyAggregateForIdentity(row);
}

/** Zero-valued aggregate for a valid player in a package with no round facts. */
export function emptyPlayerPerformanceAggregate(player: PerformanceIdentity): PlayerPerformanceAggregate {
  const { roundsSeen: _roundsSeen, weapons: _weapons, ...summary } = emptyAggregateForIdentity(player);
  return { ...summary, weapons: [] };
}

function addUtility(target: PlayerRoundPerformanceUtilityFact, source: PlayerRoundPerformanceUtilityFact): void {
  target.flashesThrown += source.flashesThrown;
  target.enemyBlindSeconds += source.enemyBlindSeconds;
  target.teamBlindSeconds += source.teamBlindSeconds;
  target.enemyBlindVictims += source.enemyBlindVictims;
  target.flashAssists += source.flashAssists;
  target.heThrows += source.heThrows;
  target.heDamage += source.heDamage;
  target.fireThrows += source.fireThrows;
  target.fireDamage += source.fireDamage;
  target.smokesThrown += source.smokesThrown;
  target.grenadesThrown += source.grenadesThrown;
  target.utilityKills += source.utilityKills;
  target.utilityDamage += source.utilityDamage;
}

function addWeapon(target: Map<string, PlayerPerformanceWeaponAggregate>, source: PlayerRoundPerformanceWeaponFact): void {
  const row = target.get(source.weapon) ?? { ...source, kills: 0, headshotKills: 0, tradeKills: 0, noScopeKills: 0, throughSmokeKills: 0, wallbangKills: 0, penetratedObjects: 0 };
  row.kills += source.kills;
  row.headshotKills += source.headshotKills;
  row.tradeKills += source.tradeKills;
  row.noScopeKills += source.noScopeKills;
  row.throughSmokeKills += source.throughSmokeKills;
  row.wallbangKills += source.wallbangKills;
  row.penetratedObjects += source.penetratedObjects;
  target.set(source.weapon, row);
}

/** Pure aggregation of the canonical player-round facts for single-map consumers. */
export function aggregatePlayerRoundPerformanceFacts(
  facts: PlayerRoundPerformanceFacts,
): Map<string, PlayerPerformanceAggregate> {
  const aggregates = new Map<string, MutableAggregate>();
  for (const row of facts.playerRounds) {
    const aggregate = aggregates.get(row.steamId64) ?? emptyAggregate(row);
    aggregate.roundsSeen.add(row.roundNumber);
    aggregate.kills += row.kills;
    aggregate.deaths += row.deaths;
    aggregate.assists += row.assists;
    aggregate.damage += row.damage;
    aggregate.headshots += row.headshots;
    if (row.openingDuel === "won") aggregate.firstKills += 1;
    if (row.openingDuel === "lost") aggregate.firstDeaths += 1;
    if (row.kast) aggregate.kastRounds += 1;
    if (row.survived) aggregate.survivalRounds += 1;
    aggregate.tradeKills += row.tradeKills;
    aggregate.tradedDeaths += row.tradedDeaths;
    aggregate.combatDeaths += row.combatDeaths;
    aggregate.bombDeaths += row.bombDeaths;
    if (row.kills === 1) aggregate.oneKillRounds += 1;
    if (row.kills === 2) aggregate.twoKillRounds += 1;
    if (row.kills === 3) aggregate.threeKillRounds += 1;
    if (row.kills === 4) aggregate.fourKillRounds += 1;
    if (row.kills === 5) aggregate.fiveKillRounds += 1;
    addUtility(aggregate.utility, row.utility);
    aggregate.objective.plants += row.objective.plants;
    aggregate.objective.defuses += row.objective.defuses;
    if (row.clutch) {
      aggregate.clutch.attempts += 1;
      if (row.clutch.won) aggregate.clutch.wins += 1;
      const split = aggregate.clutch.byOpponentCount[String(row.clutch.opponentCount) as "1" | "2" | "3" | "4" | "5"];
      split.attempts += 1;
      if (row.clutch.won) split.wins += 1;
    }
    for (const weapon of row.weapons) addWeapon(aggregate.weapons, weapon);
    aggregate.rounds = aggregate.roundsSeen.size;
    aggregates.set(row.steamId64, aggregate);
  }

  return new Map([...aggregates.entries()].map(([steamId64, aggregate]) => {
    const { roundsSeen: _roundsSeen, weapons, ...summary } = aggregate;
    return [steamId64, {
      ...summary,
      weapons: [...weapons.values()].sort((left, right) => left.weapon.localeCompare(right.weapon)),
    } satisfies PlayerPerformanceAggregate];
  }));
}
