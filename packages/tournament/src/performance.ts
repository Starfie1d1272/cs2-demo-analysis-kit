import type {
  TournamentClutchSplitKey,
  TournamentEntityLabels,
  TournamentPerformanceAnalytics,
  TournamentPerformanceClutchSummary,
  TournamentPerformanceCombatSummary,
  TournamentPerformanceGlobalWeaponSummary,
  TournamentPerformanceMapFacts,
  TournamentPerformanceMapSummary,
  TournamentPerformanceObjectiveFact,
  TournamentPerformanceObjectiveSummary,
  TournamentPerformanceOpeningSummary,
  TournamentPerformanceOpeningConversionSummary,
  TournamentPerformancePlayerRoundFact,
  TournamentPerformancePlayerSlice,
  TournamentPerformancePlayerSummary,
  TournamentPerformancePlayerWeaponSummary,
  TournamentPerformanceSample,
  TournamentPerformanceTeamSlice,
  TournamentPerformanceTeamSummary,
  TournamentPerformanceTradeSummary,
  TournamentPerformanceUtilityFact,
  TournamentPerformanceUtilitySummary,
  TournamentPerformanceWeaponSummary,
  TournamentRateSample,
  TournamentSide,
  TournamentTeamSlot,
  TournamentPerformancePlayerWeaponFact,
} from "./types.js";

const TEAM_SLOTS = ["teamA", "teamB"] as const satisfies readonly TournamentTeamSlot[];
const CLUTCH_KEYS = ["1", "2", "3", "4", "5"] as const satisfies readonly TournamentClutchSplitKey[];

type MutableRateSample = { successes: number; attempts: number };

interface MutableCombat {
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  headshots: number;
  twoKillRounds: number;
  threeKillRounds: number;
  fourKillRounds: number;
  fiveKillRounds: number;
}

interface MutableOpening {
  firstKills: number;
  firstDeaths: number;
  roundWinsAfterWinningOpeningDuel: number;
  roundWinsAfterLosingOpeningDuel: number;
}

interface MutableOpeningConversion {
  roundsWithOpening: Set<string>;
  openingWinnerTeamRoundWins: number;
  openingLoserTeamComebacks: number;
}

interface MutableTrade {
  tradeKills: number;
  tradedDeaths: number;
  tradedOpeningDeaths: number;
  deaths: number;
}

interface MutableClutch {
  attempts: number;
  wins: number;
  byOpponentCount: Record<TournamentClutchSplitKey, MutableRateSample>;
}

type MutableUtility = TournamentPerformanceUtilityFact;

interface MutableObjective {
  plants: number;
  defuses: number;
  plantsConverted: number;
  knownPlantOpportunities: number;
}

interface MutableSharedSlice {
  roundKeys: Set<string>;
  opening: MutableOpening;
  trade: MutableTrade;
  clutch: MutableClutch;
  utility: MutableUtility;
  objective: MutableObjective;
}

interface MutablePlayerSlice extends MutableSharedSlice {
  combat: MutableCombat;
  kastRounds: number;
  survivalRounds: number;
}

interface MutableWeapon {
  weapon: string;
  kills: number;
  headshotKills: number;
  players: Map<string, number>;
  teamEntityKeys: Set<string>;
}

interface MutablePlayer {
  mapKeys: Set<string>;
  matchKeys: Set<string>;
  teamEntityKeys: Set<string>;
  slices: Record<"overall" | "t" | "ct", MutablePlayerSlice>;
  weapons: Map<string, MutableWeapon>;
}

interface MutableTeam {
  mapKeys: Set<string>;
  matchKeys: Set<string>;
  slices: Record<"overall" | "t" | "ct", MutableSharedSlice>;
  weapons: Map<string, MutableWeapon>;
}

interface MutableMap {
  mapKeys: Set<string>;
  matchKeys: Set<string>;
  shared: MutableSharedSlice;
  opening: MutableOpeningConversion;
}

interface RoundValidation {
  teams: Map<string, { side: TournamentSide; teamWonRound: boolean }>;
  winnerTeamKey: string | null;
}

interface MapValidation {
  playerTeams: Map<string, string>;
  rounds: Map<number, RoundValidation>;
}

function invalid(mapKey: string, path: string, message: string): never {
  throw new Error(`Invalid TournamentPerformanceMapFacts ${mapKey}.${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, mapKey: string, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) invalid(mapKey, path, "must be a non-empty string");
}

function assertBoolean(value: unknown, mapKey: string, path: string): asserts value is boolean {
  if (typeof value !== "boolean") invalid(mapKey, path, "must be a boolean");
}

function assertCount(value: unknown, mapKey: string, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    invalid(mapKey, path, "must be a non-negative integer");
  }
}

function assertPositiveInteger(value: unknown, mapKey: string, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    invalid(mapKey, path, "must be a positive integer");
  }
}

function assertFiniteNonNegative(value: unknown, mapKey: string, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid(mapKey, path, "must be a finite non-negative number");
  }
}

function assertSide(value: unknown, mapKey: string, path: string): asserts value is TournamentSide {
  if (value !== "t" && value !== "ct") invalid(mapKey, path, "must be t or ct");
}

function assertUtility(value: unknown, mapKey: string, path: string): asserts value is TournamentPerformanceUtilityFact {
  if (!isRecord(value)) invalid(mapKey, path, "must be a utility fact");
  for (const field of ["flashesThrown", "enemyBlindVictims", "flashAssists", "heThrows", "fireThrows", "smokesThrown", "utilityKills"] as const) {
    assertCount(value[field], mapKey, `${path}.${field}`);
  }
  for (const field of ["enemyBlindSeconds", "teamBlindSeconds", "heDamage", "fireDamage", "utilityDamage"] as const) {
    assertFiniteNonNegative(value[field], mapKey, `${path}.${field}`);
  }
}

function assertClutch(value: unknown, mapKey: string, path: string): asserts value is NonNullable<TournamentPerformancePlayerRoundFact["clutch"]> {
  if (!isRecord(value)) invalid(mapKey, path, "must be a clutch fact or null");
  assertCount(value.opponentCount, mapKey, `${path}.opponentCount`);
  if (value.opponentCount < 1 || value.opponentCount > 5) invalid(mapKey, `${path}.opponentCount`, "must be between 1 and 5");
  assertBoolean(value.won, mapKey, `${path}.won`);
}

function assertPlayerRoundFact(value: unknown, mapKey: string, path: string): asserts value is TournamentPerformancePlayerRoundFact {
  if (!isRecord(value)) invalid(mapKey, path, "must be a player-round fact");
  const row = value as unknown as TournamentPerformancePlayerRoundFact;
  assertPositiveInteger(row.roundSeq, mapKey, `${path}.roundSeq`);
  assertNonEmptyString(row.playerEntityKey, mapKey, `${path}.playerEntityKey`);
  assertNonEmptyString(row.teamEntityKey, mapKey, `${path}.teamEntityKey`);
  assertSide(row.side, mapKey, `${path}.side`);
  assertBoolean(row.teamWonRound, mapKey, `${path}.teamWonRound`);
  for (const field of ["kills", "deaths", "assists", "headshots", "tradeKills", "tradedDeaths"] as const) {
    assertCount(row[field], mapKey, `${path}.${field}`);
  }
  assertFiniteNonNegative(row.damage, mapKey, `${path}.damage`);
  assertBoolean(row.survived, mapKey, `${path}.survived`);
  assertBoolean(row.kast, mapKey, `${path}.kast`);
  if (row.headshots > row.kills) invalid(mapKey, `${path}.headshots`, "must not exceed kills");
  if (row.tradeKills > row.kills) invalid(mapKey, `${path}.tradeKills`, "must not exceed kills");
  if (row.tradedDeaths > row.deaths) invalid(mapKey, `${path}.tradedDeaths`, "must not exceed deaths");
  if (row.survived !== (row.deaths === 0)) invalid(mapKey, `${path}.survived`, "must match deaths === 0");
  if (row.openingDuel !== "none" && row.openingDuel !== "won" && row.openingDuel !== "lost") {
    invalid(mapKey, `${path}.openingDuel`, "must be none, won, or lost");
  }
  if (row.clutch !== null) {
    assertClutch(row.clutch, mapKey, `${path}.clutch`);
    if (row.clutch.won !== row.teamWonRound) invalid(mapKey, `${path}.clutch.won`, "must match teamWonRound");
    if (row.clutch.won && !row.survived) invalid(mapKey, `${path}.clutch`, "a won clutch must be survived");
  }
  assertUtility(row.utility, mapKey, `${path}.utility`);
}

function assertObjectiveFact(value: unknown, mapKey: string, path: string): asserts value is TournamentPerformanceObjectiveFact {
  if (!isRecord(value)) invalid(mapKey, path, "must be an objective fact");
  const row = value as unknown as TournamentPerformanceObjectiveFact;
  assertPositiveInteger(row.roundSeq, mapKey, `${path}.roundSeq`);
  if (row.type !== "planted" && row.type !== "defused") invalid(mapKey, `${path}.type`, "must be planted or defused");
  if (row.playerEntityKey !== null) assertNonEmptyString(row.playerEntityKey, mapKey, `${path}.playerEntityKey`);
  if (row.teamEntityKey !== null) assertNonEmptyString(row.teamEntityKey, mapKey, `${path}.teamEntityKey`);
  if (row.side !== null) assertSide(row.side, mapKey, `${path}.side`);
  if (row.teamWonRound !== null) assertBoolean(row.teamWonRound, mapKey, `${path}.teamWonRound`);
  if (row.teamEntityKey === null) {
    if (row.playerEntityKey !== null) invalid(mapKey, `${path}.teamEntityKey`, "is required when playerEntityKey is present");
    if (row.side !== null) invalid(mapKey, `${path}.side`, "must be null when teamEntityKey is null");
    if (row.teamWonRound !== null) invalid(mapKey, `${path}.teamWonRound`, "must be null when teamEntityKey is null");
  } else {
    if (row.side === null) invalid(mapKey, `${path}.side`, "is required when teamEntityKey is present");
    if (row.teamWonRound === null) invalid(mapKey, `${path}.teamWonRound`, "is required when teamEntityKey is present");
  }
}

function assertPlayerWeaponFact(value: unknown, mapKey: string, path: string): asserts value is TournamentPerformancePlayerWeaponFact {
  if (!isRecord(value)) invalid(mapKey, path, "must be a player-weapon fact");
  const row = value as unknown as TournamentPerformancePlayerWeaponFact;
  assertNonEmptyString(row.playerEntityKey, mapKey, `${path}.playerEntityKey`);
  assertNonEmptyString(row.teamEntityKey, mapKey, `${path}.teamEntityKey`);
  assertNonEmptyString(row.weapon, mapKey, `${path}.weapon`);
  assertCount(row.kills, mapKey, `${path}.kills`);
  assertCount(row.headshotKills, mapKey, `${path}.headshotKills`);
  if (row.headshotKills > row.kills) invalid(mapKey, `${path}.headshotKills`, "must not exceed kills");
}

function otherTeam(teamEntityKey: string, teamEntityKeys: Record<TournamentTeamSlot, string>): string {
  return teamEntityKey === teamEntityKeys.teamA ? teamEntityKeys.teamB : teamEntityKeys.teamA;
}

function validateMapFacts(facts: TournamentPerformanceMapFacts): MapValidation {
  if (!isRecord(facts)) invalid("<invalid-map>", "facts", "must be an object");
  const rawMapKey = facts.mapKey;
  const mapKey = typeof rawMapKey === "string" ? rawMapKey : "<invalid-map>";
  assertNonEmptyString(facts.semanticProfile, mapKey, "semanticProfile");
  assertNonEmptyString(facts.analysisVersion, mapKey, "analysisVersion");
  assertNonEmptyString(facts.mapKey, mapKey, "mapKey");
  assertNonEmptyString(facts.matchKey, mapKey, "matchKey");
  assertNonEmptyString(facts.mapName, mapKey, "mapName");
  if (!isRecord(facts.teamEntityKeys)) invalid(mapKey, "teamEntityKeys", "must be an object");
  for (const slot of TEAM_SLOTS) assertNonEmptyString(facts.teamEntityKeys[slot], mapKey, `teamEntityKeys.${slot}`);
  if (facts.teamEntityKeys.teamA === facts.teamEntityKeys.teamB) invalid(mapKey, "teamEntityKeys", "teamA and teamB must differ");
  if (!Array.isArray(facts.playerRounds)) invalid(mapKey, "playerRounds", "must be an array");
  if (!Array.isArray(facts.objectives)) invalid(mapKey, "objectives", "must be an array");
  if (!Array.isArray(facts.playerWeapons)) invalid(mapKey, "playerWeapons", "must be an array");

  const playerTeams = new Map<string, string>();
  const duplicateRoundPlayers = new Set<string>();
  const rounds = new Map<number, RoundValidation>();
  const roundFor = (roundSeq: number): RoundValidation => {
    const existing = rounds.get(roundSeq);
    if (existing) return existing;
    const created: RoundValidation = { teams: new Map(), winnerTeamKey: null };
    rounds.set(roundSeq, created);
    return created;
  };

  facts.playerRounds.forEach((row, index) => {
    const path = `playerRounds[${index}]`;
    assertPlayerRoundFact(row, mapKey, path);
    if (!TEAM_SLOTS.some((slot) => facts.teamEntityKeys[slot] === row.teamEntityKey)) {
      invalid(mapKey, `${path}.teamEntityKey`, "must belong to this map");
    }
    const duplicateKey = `${row.roundSeq}\u0000${row.playerEntityKey}`;
    if (duplicateRoundPlayers.has(duplicateKey)) {
      invalid(mapKey, path, `duplicate (roundSeq=${row.roundSeq}, playerEntityKey=${row.playerEntityKey})`);
    }
    duplicateRoundPlayers.add(duplicateKey);
    const priorTeam = playerTeams.get(row.playerEntityKey);
    if (priorTeam && priorTeam !== row.teamEntityKey) {
      invalid(mapKey, `${path}.teamEntityKey`, `playerEntityKey ${row.playerEntityKey} changes team within one map`);
    }
    playerTeams.set(row.playerEntityKey, row.teamEntityKey);

    const round = roundFor(row.roundSeq);
    const priorTeamRound = round.teams.get(row.teamEntityKey);
    if (priorTeamRound && priorTeamRound.side !== row.side) invalid(mapKey, `${path}.side`, "team side changes within one round");
    if (priorTeamRound && priorTeamRound.teamWonRound !== row.teamWonRound) invalid(mapKey, `${path}.teamWonRound`, "team winner flag changes within one round");
    round.teams.set(row.teamEntityKey, { side: row.side, teamWonRound: row.teamWonRound });
    const winnerTeamKey = row.teamWonRound ? row.teamEntityKey : otherTeam(row.teamEntityKey, facts.teamEntityKeys);
    if (round.winnerTeamKey && round.winnerTeamKey !== winnerTeamKey) {
      invalid(mapKey, `${path}.teamWonRound`, "round winner is inconsistent across teams");
    }
    round.winnerTeamKey = winnerTeamKey;
  });

  facts.objectives.forEach((row, index) => {
    const path = `objectives[${index}]`;
    assertObjectiveFact(row, mapKey, path);
    const round = roundFor(row.roundSeq);
    if (row.teamEntityKey !== null) {
      if (!TEAM_SLOTS.some((slot) => facts.teamEntityKeys[slot] === row.teamEntityKey)) {
        invalid(mapKey, `${path}.teamEntityKey`, "must belong to this map");
      }
      if (row.playerEntityKey !== null) {
        const playerTeam = playerTeams.get(row.playerEntityKey);
        if (!playerTeam) invalid(mapKey, `${path}.playerEntityKey`, "does not reference a known player");
        if (playerTeam !== row.teamEntityKey) invalid(mapKey, `${path}.teamEntityKey`, "must match the referenced player's team");
      }
      const priorTeamRound = round.teams.get(row.teamEntityKey);
      if (priorTeamRound && priorTeamRound.side !== row.side) invalid(mapKey, `${path}.side`, "team side conflicts with player-round facts");
      if (priorTeamRound && priorTeamRound.teamWonRound !== row.teamWonRound) invalid(mapKey, `${path}.teamWonRound`, "conflicts with player-round facts");
      round.teams.set(row.teamEntityKey, { side: row.side!, teamWonRound: row.teamWonRound! });
      const winnerTeamKey = row.teamWonRound ? row.teamEntityKey : otherTeam(row.teamEntityKey, facts.teamEntityKeys);
      if (round.winnerTeamKey && round.winnerTeamKey !== winnerTeamKey) invalid(mapKey, `${path}.teamWonRound`, "round winner is inconsistent across facts");
      round.winnerTeamKey = winnerTeamKey;
    }
  });

  for (const [roundSeq, round] of rounds) {
    const teamA = round.teams.get(facts.teamEntityKeys.teamA);
    const teamB = round.teams.get(facts.teamEntityKeys.teamB);
    if (teamA && teamB) {
      if (teamA.side === teamB.side) invalid(mapKey, `playerRounds.roundSeq=${roundSeq}.side`, "teams must have opposite sides");
      if (teamA.teamWonRound === teamB.teamWonRound) invalid(mapKey, `playerRounds.roundSeq=${roundSeq}.teamWonRound`, "exactly one team must win the round");
    }
  }

  const openingByRound = new Map<number, { won: TournamentPerformancePlayerRoundFact[]; lost: TournamentPerformancePlayerRoundFact[] }>();
  facts.playerRounds.forEach((row) => {
    if (row.openingDuel === "none") return;
    const entry = openingByRound.get(row.roundSeq) ?? { won: [], lost: [] };
    entry[row.openingDuel].push(row);
    openingByRound.set(row.roundSeq, entry);
  });
  for (const [roundSeq, opening] of openingByRound) {
    if (opening.won.length !== 1 || opening.lost.length !== 1) {
      invalid(mapKey, `playerRounds.roundSeq=${roundSeq}.openingDuel`, "an opening duel must contain exactly one won and one lost player");
    }
    if (opening.won[0]!.teamEntityKey === opening.lost[0]!.teamEntityKey) {
      invalid(mapKey, `playerRounds.roundSeq=${roundSeq}.openingDuel`, "opening duel players must be on opposite teams");
    }
  }

  facts.playerWeapons.forEach((row, index) => {
    const path = `playerWeapons[${index}]`;
    assertPlayerWeaponFact(row, mapKey, path);
    const playerTeam = playerTeams.get(row.playerEntityKey);
    if (!playerTeam) invalid(mapKey, `${path}.playerEntityKey`, "does not reference a known player");
    if (playerTeam !== row.teamEntityKey) invalid(mapKey, `${path}.teamEntityKey`, "must match the player's team");
    if (!TEAM_SLOTS.some((slot) => facts.teamEntityKeys[slot] === row.teamEntityKey)) {
      invalid(mapKey, `${path}.teamEntityKey`, "must belong to this map");
    }
  });

  return { playerTeams, rounds };
}

function emptyCombat(): MutableCombat {
  return { kills: 0, deaths: 0, assists: 0, damage: 0, headshots: 0, twoKillRounds: 0, threeKillRounds: 0, fourKillRounds: 0, fiveKillRounds: 0 };
}

function emptyOpening(): MutableOpening {
  return { firstKills: 0, firstDeaths: 0, roundWinsAfterWinningOpeningDuel: 0, roundWinsAfterLosingOpeningDuel: 0 };
}

function emptyOpeningConversion(): MutableOpeningConversion {
  return { roundsWithOpening: new Set(), openingWinnerTeamRoundWins: 0, openingLoserTeamComebacks: 0 };
}

function emptyTrade(): MutableTrade {
  return { tradeKills: 0, tradedDeaths: 0, tradedOpeningDeaths: 0, deaths: 0 };
}

function emptyClutch(): MutableClutch {
  return {
    attempts: 0,
    wins: 0,
    byOpponentCount: Object.fromEntries(CLUTCH_KEYS.map((key) => [key, { successes: 0, attempts: 0 }])) as Record<TournamentClutchSplitKey, MutableRateSample>,
  };
}

function emptyUtility(): MutableUtility {
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

function emptyObjective(): MutableObjective {
  return { plants: 0, defuses: 0, plantsConverted: 0, knownPlantOpportunities: 0 };
}

function emptySharedSlice(): MutableSharedSlice {
  return { roundKeys: new Set(), opening: emptyOpening(), trade: emptyTrade(), clutch: emptyClutch(), utility: emptyUtility(), objective: emptyObjective() };
}

function emptyPlayerSlice(): MutablePlayerSlice {
  return { ...emptySharedSlice(), combat: emptyCombat(), kastRounds: 0, survivalRounds: 0 };
}

function emptyPlayer(): MutablePlayer {
  return { mapKeys: new Set(), matchKeys: new Set(), teamEntityKeys: new Set(), slices: { overall: emptyPlayerSlice(), t: emptyPlayerSlice(), ct: emptyPlayerSlice() }, weapons: new Map() };
}

function emptyTeam(): MutableTeam {
  return { mapKeys: new Set(), matchKeys: new Set(), slices: { overall: emptySharedSlice(), t: emptySharedSlice(), ct: emptySharedSlice() }, weapons: new Map() };
}

function emptyMap(): MutableMap {
  return { mapKeys: new Set(), matchKeys: new Set(), shared: emptySharedSlice(), opening: emptyOpeningConversion() };
}

function addUtility(target: MutableUtility, source: TournamentPerformanceUtilityFact): void {
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
  target.utilityKills += source.utilityKills;
  target.utilityDamage += source.utilityDamage;
}

function addSharedPlayerRound(target: MutableSharedSlice, row: TournamentPerformancePlayerRoundFact, roundKey: string, includeOpening = true): void {
  target.roundKeys.add(roundKey);
  if (includeOpening) {
    if (row.openingDuel === "won") target.opening.firstKills += 1;
    if (row.openingDuel === "lost") target.opening.firstDeaths += 1;
    if (row.openingDuel === "won" && row.teamWonRound) target.opening.roundWinsAfterWinningOpeningDuel += 1;
    if (row.openingDuel === "lost" && row.teamWonRound) target.opening.roundWinsAfterLosingOpeningDuel += 1;
  }
  target.trade.tradeKills += row.tradeKills;
  target.trade.tradedDeaths += row.tradedDeaths;
  target.trade.tradedOpeningDeaths += row.openingDuel === "lost" ? row.tradedDeaths : 0;
  target.trade.deaths += row.deaths;
  if (row.clutch) {
    target.clutch.attempts += 1;
    if (row.clutch.won) target.clutch.wins += 1;
    const split = target.clutch.byOpponentCount[String(row.clutch.opponentCount) as TournamentClutchSplitKey];
    split.attempts += 1;
    if (row.clutch.won) split.successes += 1;
  }
  addUtility(target.utility, row.utility);
}

function addOpeningConversion(target: MutableOpeningConversion, row: TournamentPerformancePlayerRoundFact, roundKey: string): void {
  if (row.openingDuel === "won") {
    target.roundsWithOpening.add(roundKey);
    if (row.teamWonRound) target.openingWinnerTeamRoundWins += 1;
  } else if (row.openingDuel === "lost") {
    target.roundsWithOpening.add(roundKey);
    if (row.teamWonRound) target.openingLoserTeamComebacks += 1;
  }
}

function addPlayerRound(target: MutablePlayerSlice, row: TournamentPerformancePlayerRoundFact, roundKey: string): void {
  addSharedPlayerRound(target, row, roundKey);
  target.combat.kills += row.kills;
  target.combat.deaths += row.deaths;
  target.combat.assists += row.assists;
  target.combat.damage += row.damage;
  target.combat.headshots += row.headshots;
  if (row.kills === 2) target.combat.twoKillRounds += 1;
  if (row.kills === 3) target.combat.threeKillRounds += 1;
  if (row.kills === 4) target.combat.fourKillRounds += 1;
  if (row.kills >= 5) target.combat.fiveKillRounds += 1;
  if (row.kast) target.kastRounds += 1;
  if (row.survived) target.survivalRounds += 1;
}

function addObjective(target: MutableSharedSlice, row: TournamentPerformanceObjectiveFact, roundKey: string): void {
  target.roundKeys.add(roundKey);
  if (row.type === "planted") {
    target.objective.plants += 1;
    if (row.teamWonRound !== null) {
      target.objective.knownPlantOpportunities += 1;
      if (row.teamWonRound) target.objective.plantsConverted += 1;
    }
  } else {
    target.objective.defuses += 1;
  }
}

function emptyWeapon(weapon: string): MutableWeapon {
  return { weapon, kills: 0, headshotKills: 0, players: new Map(), teamEntityKeys: new Set() };
}

function addWeapon(target: Map<string, MutableWeapon>, row: TournamentPerformancePlayerWeaponFact): void {
  const weapon = target.get(row.weapon) ?? emptyWeapon(row.weapon);
  weapon.kills += row.kills;
  weapon.headshotKills += row.headshotKills;
  weapon.players.set(row.playerEntityKey, (weapon.players.get(row.playerEntityKey) ?? 0) + row.kills);
  weapon.teamEntityKeys.add(row.teamEntityKey);
  target.set(row.weapon, weapon);
}

function rate(successes: number, attempts: number): TournamentRateSample {
  return { successes, attempts, rate: attempts > 0 ? successes / attempts : null };
}

function finalizeSample(rounds: number): TournamentPerformanceSample {
  return { rounds };
}

function finalizeOpening(value: MutableOpening, rounds: number): TournamentPerformanceOpeningSummary {
  const attempts = value.firstKills + value.firstDeaths;
  return {
    firstKills: value.firstKills,
    firstDeaths: value.firstDeaths,
    attempts,
    successRate: rate(value.firstKills, attempts),
    attemptRate: rate(attempts, rounds),
    firstKillsPerRound: rate(value.firstKills, rounds),
    firstDeathsPerRound: rate(value.firstDeaths, rounds),
    roundWinsAfterWinningOpeningDuel: value.roundWinsAfterWinningOpeningDuel,
    winRateAfterWinningOpeningDuel: rate(value.roundWinsAfterWinningOpeningDuel, value.firstKills),
    roundWinsAfterLosingOpeningDuel: value.roundWinsAfterLosingOpeningDuel,
    comebackRateAfterLosingOpeningDuel: rate(value.roundWinsAfterLosingOpeningDuel, value.firstDeaths),
  };
}

function finalizeOpeningConversion(value: MutableOpeningConversion, rounds: number): TournamentPerformanceOpeningConversionSummary {
  const roundsWithOpening = value.roundsWithOpening.size;
  return {
    openingRounds: rounds,
    roundsWithOpening,
    openingWinnerTeamRoundWins: value.openingWinnerTeamRoundWins,
    openingLoserTeamComebacks: value.openingLoserTeamComebacks,
    conversionRate: rate(value.openingWinnerTeamRoundWins, roundsWithOpening),
    comebackRate: rate(value.openingLoserTeamComebacks, roundsWithOpening),
  };
}

function finalizeTrade(value: MutableTrade, rounds: number): TournamentPerformanceTradeSummary {
  return {
    tradeKills: value.tradeKills,
    tradedDeaths: value.tradedDeaths,
    tradedOpeningDeaths: value.tradedOpeningDeaths,
    deaths: value.deaths,
    tradeKillsPerRound: rate(value.tradeKills, rounds),
    tradedDeathsPerDeath: rate(value.tradedDeaths, value.deaths),
  };
}

function finalizeClutch(value: MutableClutch, rounds: number): TournamentPerformanceClutchSummary {
  return {
    attempts: value.attempts,
    wins: value.wins,
    winRate: rate(value.wins, value.attempts),
    frequency: rate(value.attempts, rounds),
    byOpponentCount: Object.fromEntries(CLUTCH_KEYS.map((key) => {
      const split = value.byOpponentCount[key];
      return [key, rate(split.successes, split.attempts)];
    })) as TournamentPerformanceClutchSummary["byOpponentCount"],
  };
}

function finalizeUtility(value: MutableUtility, rounds: number): TournamentPerformanceUtilitySummary {
  const netBlindSeconds = value.enemyBlindSeconds - value.teamBlindSeconds;
  return {
    ...value,
    netBlindSeconds,
    enemyBlindSecondsPerFlash: rate(value.enemyBlindSeconds, value.flashesThrown),
    netBlindSecondsPerFlash: rate(netBlindSeconds, value.flashesThrown),
    enemyBlindSecondsPerRound: rate(value.enemyBlindSeconds, rounds),
    teamBlindSecondsPerRound: rate(value.teamBlindSeconds, rounds),
    flashAssistsPerRound: rate(value.flashAssists, rounds),
    heDamagePerThrow: rate(value.heDamage, value.heThrows),
    heDamagePerRound: rate(value.heDamage, rounds),
    fireDamagePerThrow: rate(value.fireDamage, value.fireThrows),
    fireDamagePerRound: rate(value.fireDamage, rounds),
    smokesPerRound: rate(value.smokesThrown, rounds),
    utilityKillsPerRound: rate(value.utilityKills, rounds),
    utilityDamagePerRound: rate(value.utilityDamage, rounds),
  };
}

function finalizeObjective(value: MutableObjective): TournamentPerformanceObjectiveSummary {
  return {
    plants: value.plants,
    defuses: value.defuses,
    plantsConverted: value.plantsConverted,
    plantConversions: rate(value.plantsConverted, value.knownPlantOpportunities),
  };
}

function finalizeCombat(value: MutableCombat, rounds: number): TournamentPerformanceCombatSummary {
  return {
    kills: value.kills,
    deaths: value.deaths,
    assists: value.assists,
    damage: value.damage,
    headshots: value.headshots,
    killsPerRound: rate(value.kills, rounds),
    deathsPerRound: rate(value.deaths, rounds),
    assistsPerRound: rate(value.assists, rounds),
    damagePerRound: rate(value.damage, rounds),
    headshotRate: rate(value.headshots, value.kills),
    twoKillRounds: value.twoKillRounds,
    threeKillRounds: value.threeKillRounds,
    fourKillRounds: value.fourKillRounds,
    fiveKillRounds: value.fiveKillRounds,
  };
}

function finalizePlayerSlice(value: MutablePlayerSlice): TournamentPerformancePlayerSlice {
  const rounds = value.roundKeys.size;
  return {
    sample: finalizeSample(rounds),
    combat: finalizeCombat(value.combat, rounds),
    kast: rate(value.kastRounds, rounds),
    survival: rate(value.survivalRounds, rounds),
    opening: finalizeOpening(value.opening, rounds),
    trade: finalizeTrade(value.trade, rounds),
    clutch: finalizeClutch(value.clutch, rounds),
    utility: finalizeUtility(value.utility, rounds),
    objective: finalizeObjective(value.objective),
  };
}

function finalizeTeamSlice(value: MutableSharedSlice): TournamentPerformanceTeamSlice {
  const rounds = value.roundKeys.size;
  return {
    sample: finalizeSample(rounds),
    opening: finalizeOpening(value.opening, rounds),
    trade: finalizeTrade(value.trade, rounds),
    clutch: finalizeClutch(value.clutch, rounds),
    utility: finalizeUtility(value.utility, rounds),
    objective: finalizeObjective(value.objective),
  };
}

function entityRef(entityKey: string, labels: TournamentEntityLabels | undefined, kind: "teams" | "players") {
  return { entityKey, displayName: labels?.[kind]?.[entityKey] ?? entityKey };
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function weaponSort(left: MutableWeapon, right: MutableWeapon): number {
  return right.kills - left.kills || lexicalCompare(left.weapon, right.weapon);
}

function finalizeWeapon(value: MutableWeapon, totalKills: number, rounds: number): TournamentPerformanceWeaponSummary {
  return {
    weapon: value.weapon,
    kills: value.kills,
    headshotKills: value.headshotKills,
    headshotRate: rate(value.headshotKills, value.kills),
    killShare: rate(value.kills, totalKills),
    killsPerRound: rate(value.kills, rounds),
  };
}

function roundIdentity(mapKey: string, roundSeq: number): string {
  return `${mapKey}\u0000${roundSeq}`;
}

function sortedPlayerRounds(rows: readonly TournamentPerformancePlayerRoundFact[]): TournamentPerformancePlayerRoundFact[] {
  return [...rows].sort((a, b) => a.roundSeq - b.roundSeq || lexicalCompare(a.playerEntityKey, b.playerEntityKey));
}

function sortedObjectives(rows: readonly TournamentPerformanceObjectiveFact[]): TournamentPerformanceObjectiveFact[] {
  return [...rows].sort((a, b) => a.roundSeq - b.roundSeq || lexicalCompare(a.type, b.type) || lexicalCompare(a.teamEntityKey ?? "", b.teamEntityKey ?? "") || lexicalCompare(a.playerEntityKey ?? "", b.playerEntityKey ?? ""));
}

function sortedWeapons(rows: readonly TournamentPerformancePlayerWeaponFact[]): TournamentPerformancePlayerWeaponFact[] {
  return [...rows].sort((a, b) => lexicalCompare(a.playerEntityKey, b.playerEntityKey) || lexicalCompare(a.weapon, b.weapon) || lexicalCompare(a.teamEntityKey, b.teamEntityKey) || a.kills - b.kills || a.headshotKills - b.headshotKills);
}

function zeroPerformanceModel(): TournamentPerformanceAnalytics {
  const shared = emptySharedSlice();
  const opening = emptyOpeningConversion();
  return {
    provenance: { semanticProfile: null, analysisVersions: [] },
    totals: {
      matchCount: 0,
      mapCount: 0,
      roundCount: 0,
      opening: finalizeOpeningConversion(opening, 0),
      utility: finalizeUtility(shared.utility, 0),
      objective: finalizeObjective(shared.objective),
    },
    players: [],
    teams: [],
    maps: [],
    weapons: [],
  };
}

/**
 * Merge frozen, identity-safe player-round sufficient facts across maps.
 * This function intentionally has no dependency on DemoPackage, core, Zod,
 * storage, or product code.
 */
export function buildTournamentPerformanceAnalytics(
  facts: readonly TournamentPerformanceMapFacts[],
  options: { labels?: TournamentEntityLabels } = {},
): TournamentPerformanceAnalytics {
  if (facts.length === 0) return zeroPerformanceModel();

  const mapKeys = new Set<string>();
  const matchKeys = new Set<string>();
  let semanticProfile: string | null = null;
  const analysisVersions = new Set<string>();
  const validated = facts.map((mapFacts) => {
    const validation = validateMapFacts(mapFacts);
    if (mapKeys.has(mapFacts.mapKey)) invalid(mapFacts.mapKey, "mapKey", "duplicate mapKey");
    mapKeys.add(mapFacts.mapKey);
    matchKeys.add(mapFacts.matchKey);
    if (semanticProfile === null) semanticProfile = mapFacts.semanticProfile;
    else if (semanticProfile !== mapFacts.semanticProfile) invalid(mapFacts.mapKey, "semanticProfile", `mixed profile; expected ${semanticProfile}`);
    analysisVersions.add(mapFacts.analysisVersion);
    return { mapFacts, validation };
  }).sort((a, b) => lexicalCompare(a.mapFacts.mapKey, b.mapFacts.mapKey));

  const global = emptySharedSlice();
  const globalOpening = emptyOpeningConversion();
  const players = new Map<string, MutablePlayer>();
  const teams = new Map<string, MutableTeam>();
  const maps = new Map<string, MutableMap>();
  const globalWeapons = new Map<string, MutableWeapon>();

  for (const { mapFacts, validation } of validated) {
    const mapRow = maps.get(mapFacts.mapName) ?? emptyMap();
    mapRow.mapKeys.add(mapFacts.mapKey);
    mapRow.matchKeys.add(mapFacts.matchKey);
    for (const roundSeq of validation.rounds.keys()) {
      const key = roundIdentity(mapFacts.mapKey, roundSeq);
      mapRow.shared.roundKeys.add(key);
      global.roundKeys.add(key);
    }
    maps.set(mapFacts.mapName, mapRow);

    for (const slot of TEAM_SLOTS) {
      const teamEntityKey = mapFacts.teamEntityKeys[slot];
      const team = teams.get(teamEntityKey) ?? emptyTeam();
      team.mapKeys.add(mapFacts.mapKey);
      team.matchKeys.add(mapFacts.matchKey);
      teams.set(teamEntityKey, team);
    }

    for (const row of sortedPlayerRounds(mapFacts.playerRounds)) {
      const key = roundIdentity(mapFacts.mapKey, row.roundSeq);
      addSharedPlayerRound(mapRow.shared, row, key, false);
      addOpeningConversion(mapRow.opening, row, key);
      addSharedPlayerRound(global, row, key, false);
      addOpeningConversion(globalOpening, row, key);

      const player = players.get(row.playerEntityKey) ?? emptyPlayer();
      player.mapKeys.add(mapFacts.mapKey);
      player.matchKeys.add(mapFacts.matchKey);
      player.teamEntityKeys.add(row.teamEntityKey);
      addPlayerRound(player.slices.overall, row, key);
      addPlayerRound(player.slices[row.side], row, key);
      players.set(row.playerEntityKey, player);

      const team = teams.get(row.teamEntityKey)!;
      addSharedPlayerRound(team.slices.overall, row, key);
      addSharedPlayerRound(team.slices[row.side], row, key);
    }

    for (const row of sortedObjectives(mapFacts.objectives)) {
      const key = roundIdentity(mapFacts.mapKey, row.roundSeq);
      addObjective(mapRow.shared, row, key);
      addObjective(global, row, key);
      if (row.playerEntityKey !== null) {
        const player = players.get(row.playerEntityKey)!;
        addObjective(player.slices.overall, row, key);
        if (row.side !== null) addObjective(player.slices[row.side], row, key);
      }
      if (row.teamEntityKey !== null) {
        const team = teams.get(row.teamEntityKey)!;
        addObjective(team.slices.overall, row, key);
        if (row.side !== null) addObjective(team.slices[row.side], row, key);
      }
    }

    for (const row of sortedWeapons(mapFacts.playerWeapons)) {
      addWeapon(globalWeapons, row);
      const player = players.get(row.playerEntityKey)!;
      addWeapon(player.weapons, row);
      const team = teams.get(row.teamEntityKey)!;
      addWeapon(team.weapons, row);
    }
  }

  const playerRows: TournamentPerformancePlayerSummary[] = [...players.entries()]
    .sort(([left], [right]) => lexicalCompare(left, right))
    .map(([playerEntityKey, value]) => {
      const totalKills = [...value.weapons.values()].reduce((sum, row) => sum + row.kills, 0);
      const weapons: TournamentPerformancePlayerWeaponSummary[] = [...value.weapons.values()]
        .sort(weaponSort)
        .map((row) => ({ ...finalizeWeapon(row, totalKills, value.slices.overall.roundKeys.size), teamEntityKeys: [...row.teamEntityKeys].sort(lexicalCompare) }));
      return {
        player: entityRef(playerEntityKey, options.labels, "players"),
        teamEntityKeys: [...value.teamEntityKeys].sort(lexicalCompare),
        matchCount: value.matchKeys.size,
        mapCount: value.mapKeys.size,
        slices: {
          overall: finalizePlayerSlice(value.slices.overall),
          t: finalizePlayerSlice(value.slices.t),
          ct: finalizePlayerSlice(value.slices.ct),
        },
        weapons,
      };
    });

  const teamRows: TournamentPerformanceTeamSummary[] = [...teams.entries()]
    .sort(([left], [right]) => lexicalCompare(left, right))
    .map(([teamEntityKey, value]) => {
      const rounds = value.slices.overall.roundKeys.size;
      const totalKills = [...value.weapons.values()].reduce((sum, row) => sum + row.kills, 0);
      return {
        team: entityRef(teamEntityKey, options.labels, "teams"),
        matchCount: value.matchKeys.size,
        mapCount: value.mapKeys.size,
        roundCount: rounds,
        slices: {
          overall: finalizeTeamSlice(value.slices.overall),
          t: finalizeTeamSlice(value.slices.t),
          ct: finalizeTeamSlice(value.slices.ct),
        },
        weapons: [...value.weapons.values()].sort(weaponSort).map((row) => finalizeWeapon(row, totalKills, rounds)),
      };
    });

  const mapRows: TournamentPerformanceMapSummary[] = [...maps.entries()]
    .sort(([left], [right]) => lexicalCompare(left, right))
    .map(([mapName, value]) => {
      const rounds = value.shared.roundKeys.size;
      return {
        mapName,
        matchCount: value.matchKeys.size,
        mapCount: value.mapKeys.size,
        roundCount: rounds,
        opening: finalizeOpeningConversion(value.opening, rounds),
        utility: finalizeUtility(value.shared.utility, rounds),
        objective: finalizeObjective(value.shared.objective),
      };
    });

  const globalWeaponRows: TournamentPerformanceGlobalWeaponSummary[] = [...globalWeapons.values()]
    .sort(weaponSort)
    .map((row) => {
      const topPlayer = [...row.players.entries()].sort(([left, leftKills], [right, rightKills]) => rightKills - leftKills || lexicalCompare(left, right))[0];
      return {
        ...finalizeWeapon(row, [...globalWeapons.values()].reduce((sum, weapon) => sum + weapon.kills, 0), global.roundKeys.size),
        topPlayer: topPlayer ? { ...entityRef(topPlayer[0], options.labels, "players"), kills: topPlayer[1] } : null,
      };
    });

  return {
    provenance: { semanticProfile, analysisVersions: [...analysisVersions].sort(lexicalCompare) },
    totals: {
      matchCount: matchKeys.size,
      mapCount: mapKeys.size,
      roundCount: global.roundKeys.size,
      opening: finalizeOpeningConversion(globalOpening, global.roundKeys.size),
      utility: finalizeUtility(global.utility, global.roundKeys.size),
      objective: finalizeObjective(global.objective),
    },
    players: playerRows,
    teams: teamRows,
    maps: mapRows,
    weapons: globalWeaponRows,
  };
}
