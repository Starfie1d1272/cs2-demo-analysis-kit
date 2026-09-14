import type {
  RateCount,
  TournamentAnalytics,
  TournamentEconomyType,
  TournamentEntityLabels,
  TournamentManAdvantage,
  TournamentMapFacts,
  TournamentTeamConversionCount,
  TournamentTeamMapCount,
  TournamentTeamSlot,
  WinLossCount,
} from "./types.js";

const TEAM_SLOTS = ["teamA", "teamB"] as const satisfies readonly TournamentTeamSlot[];
const MAN_ADVANTAGE_KEYS = ["5v4", "4v5", "5v3", "3v5"] as const satisfies readonly TournamentManAdvantage[];
const ECONOMY_ORDER = ["pistol", "eco", "semi", "force", "full"] as const satisfies readonly TournamentEconomyType[];

type MutableCount = { opportunities: number; wins: number };

function invalid(mapKey: string, path: string, message: string): never {
  throw new Error(`Invalid TournamentMapFacts ${mapKey}.${path}: ${message}`);
}

function assertNonEmptyString(value: string, mapKey: string, path: string): void {
  if (typeof value !== "string" || value.length === 0) invalid(mapKey, path, "must be a non-empty string");
}

function assertCount(value: number, mapKey: string, path: string): void {
  if (!Number.isInteger(value) || value < 0) invalid(mapKey, path, "must be a non-negative integer");
}

function assertWinLoss(value: WinLossCount, mapKey: string, path: string): void {
  if (value == null || typeof value !== "object") invalid(mapKey, path, "must be a win/loss count");
  assertCount(value.opportunities, mapKey, `${path}.opportunities`);
  assertCount(value.wins, mapKey, `${path}.wins`);
  if (value.wins > value.opportunities) invalid(mapKey, path, "wins must not exceed opportunities");
}

function assertTeamMapCount(value: TournamentTeamMapCount, mapKey: string, path: string): void {
  assertCount(value.rounds, mapKey, `${path}.rounds`);
  assertCount(value.roundWins, mapKey, `${path}.roundWins`);
  assertCount(value.tRounds, mapKey, `${path}.tRounds`);
  assertCount(value.tWins, mapKey, `${path}.tWins`);
  assertCount(value.ctRounds, mapKey, `${path}.ctRounds`);
  assertCount(value.ctWins, mapKey, `${path}.ctWins`);
  if (value.tRounds + value.ctRounds !== value.rounds) invalid(mapKey, path, "tRounds + ctRounds must equal rounds");
  if (value.tWins > value.tRounds) invalid(mapKey, `${path}.tWins`, "must not exceed tRounds");
  if (value.ctWins > value.ctRounds) invalid(mapKey, `${path}.ctWins`, "must not exceed ctRounds");
  if (value.roundWins !== value.tWins + value.ctWins) invalid(mapKey, path, "roundWins must equal tWins + ctWins");
}

function assertTeamConversions(value: TournamentTeamConversionCount, mapKey: string, path: string): void {
  assertWinLoss(value.pistol, mapKey, `${path}.pistol`);
  assertWinLoss(value.round2.conversion, mapKey, `${path}.round2.conversion`);
  assertWinLoss(value.round2.break, mapKey, `${path}.round2.break`);
  assertWinLoss(value.ecoSemiUpset, mapKey, `${path}.ecoSemiUpset`);
  for (const key of MAN_ADVANTAGE_KEYS) assertWinLoss(value.manAdvantage[key], mapKey, `${path}.manAdvantage.${key}`);
}

function assertMapFacts(facts: TournamentMapFacts): void {
  const mapKey = facts.mapKey;
  assertNonEmptyString(facts.semanticProfile, mapKey, "semanticProfile");
  assertNonEmptyString(facts.analysisVersion, mapKey, "analysisVersion");
  assertNonEmptyString(facts.mapKey, mapKey, "mapKey");
  assertNonEmptyString(facts.matchKey, mapKey, "matchKey");
  assertNonEmptyString(facts.mapName, mapKey, "mapName");
  for (const slot of TEAM_SLOTS) assertNonEmptyString(facts.teamEntityKeys[slot], mapKey, `teamEntityKeys.${slot}`);
  if (facts.teamEntityKeys.teamA === facts.teamEntityKeys.teamB) invalid(mapKey, "teamEntityKeys", "teamA and teamB must differ");

  for (const slot of TEAM_SLOTS) {
    assertTeamMapCount(facts.teamMaps[slot], mapKey, `teamMaps.${slot}`);
    assertTeamConversions(facts.teamConversions[slot], mapKey, `teamConversions.${slot}`);
  }

  const teamA = facts.teamMaps.teamA;
  const teamB = facts.teamMaps.teamB;
  if (teamA.rounds !== teamB.rounds) invalid(mapKey, "teamMaps", "teamA.rounds must equal teamB.rounds");
  if (teamA.roundWins + teamB.roundWins !== teamA.rounds) invalid(mapKey, "teamMaps", "team round wins must equal rounds");
  if (teamA.tRounds + teamB.tRounds !== teamA.rounds) invalid(mapKey, "teamMaps", "T rounds across teams must equal map rounds");
  if (teamA.ctRounds + teamB.ctRounds !== teamA.rounds) invalid(mapKey, "teamMaps", "CT rounds across teams must equal map rounds");

  assertWinLoss(facts.pistolSides.t, mapKey, "pistolSides.t");
  assertWinLoss(facts.pistolSides.ct, mapKey, "pistolSides.ct");
  if (facts.pistolSides.t.opportunities !== facts.pistolSides.ct.opportunities) {
    invalid(mapKey, "pistolSides", "T and CT pistol opportunities must match");
  }
  if (facts.pistolSides.t.wins + facts.pistolSides.ct.wins !== facts.pistolSides.t.opportunities) {
    invalid(mapKey, "pistolSides", "T and CT pistol wins must equal pistol opportunities");
  }

  const conversionOpportunities = TEAM_SLOTS.reduce((sum, slot) => sum + facts.teamConversions[slot].round2.conversion.opportunities, 0);
  const breakOpportunities = TEAM_SLOTS.reduce((sum, slot) => sum + facts.teamConversions[slot].round2.break.opportunities, 0);
  const conversionWins = TEAM_SLOTS.reduce((sum, slot) => sum + facts.teamConversions[slot].round2.conversion.wins, 0);
  const breakWins = TEAM_SLOTS.reduce((sum, slot) => sum + facts.teamConversions[slot].round2.break.wins, 0);
  if (conversionOpportunities !== breakOpportunities) invalid(mapKey, "teamConversions.round2", "conversion and break opportunities must match");
  if (conversionWins + breakWins !== conversionOpportunities) invalid(mapKey, "teamConversions.round2", "conversion and break wins must equal opportunities");

  for (const [advantage, disadvantage] of [["5v4", "4v5"], ["5v3", "3v5"]] as const) {
    const advantageOpportunities = TEAM_SLOTS.reduce((sum, slot) => sum + facts.teamConversions[slot].manAdvantage[advantage].opportunities, 0);
    const disadvantageOpportunities = TEAM_SLOTS.reduce((sum, slot) => sum + facts.teamConversions[slot].manAdvantage[disadvantage].opportunities, 0);
    const advantageWins = TEAM_SLOTS.reduce((sum, slot) => sum + facts.teamConversions[slot].manAdvantage[advantage].wins, 0);
    const disadvantageWins = TEAM_SLOTS.reduce((sum, slot) => sum + facts.teamConversions[slot].manAdvantage[disadvantage].wins, 0);
    if (advantageOpportunities !== disadvantageOpportunities) {
      invalid(mapKey, `teamConversions.manAdvantage.${advantage}/${disadvantage}`, "paired opportunities must match");
    }
    if (advantageWins + disadvantageWins !== advantageOpportunities) {
      invalid(mapKey, `teamConversions.manAdvantage.${advantage}/${disadvantage}`, "paired wins must equal opportunities");
    }
  }

  facts.economyMatrix.forEach((cell, index) => {
    if (!ECONOMY_ORDER.includes(cell.lowEconomy)) invalid(mapKey, `economyMatrix[${index}].lowEconomy`, "unknown economy type");
    if (!ECONOMY_ORDER.includes(cell.highEconomy)) invalid(mapKey, `economyMatrix[${index}].highEconomy`, "unknown economy type");
    assertCount(cell.rounds, mapKey, `economyMatrix[${index}].rounds`);
    assertCount(cell.lowEconomyWins, mapKey, `economyMatrix[${index}].lowEconomyWins`);
    if (cell.lowEconomyWins > cell.rounds) invalid(mapKey, `economyMatrix[${index}].lowEconomyWins`, "must not exceed rounds");
  });

  facts.playerWeapons.forEach((row, index) => {
    assertNonEmptyString(row.playerEntityKey, mapKey, `playerWeapons[${index}].playerEntityKey`);
    assertNonEmptyString(row.teamEntityKey, mapKey, `playerWeapons[${index}].teamEntityKey`);
    assertNonEmptyString(row.weapon, mapKey, `playerWeapons[${index}].weapon`);
    assertCount(row.kills, mapKey, `playerWeapons[${index}].kills`);
    assertCount(row.headshotKills, mapKey, `playerWeapons[${index}].headshotKills`);
    if (row.headshotKills > row.kills) invalid(mapKey, `playerWeapons[${index}].headshotKills`, "must not exceed kills");
    if (!TEAM_SLOTS.some((slot) => facts.teamEntityKeys[slot] === row.teamEntityKey)) {
      invalid(mapKey, `playerWeapons[${index}].teamEntityKey`, "must belong to this map");
    }
  });
}

function zeroCount(): MutableCount {
  return { opportunities: 0, wins: 0 };
}

function zeroManAdvantage(): Record<TournamentManAdvantage, MutableCount> {
  return Object.fromEntries(MAN_ADVANTAGE_KEYS.map((key) => [key, zeroCount()])) as Record<TournamentManAdvantage, MutableCount>;
}

function zeroTeamConversions(): { pistol: MutableCount; round2: { conversion: MutableCount; break: MutableCount }; ecoSemiUpset: MutableCount; manAdvantage: Record<TournamentManAdvantage, MutableCount> } {
  return { pistol: zeroCount(), round2: { conversion: zeroCount(), break: zeroCount() }, ecoSemiUpset: zeroCount(), manAdvantage: zeroManAdvantage() };
}

function zeroRate(): RateCount {
  return { opportunities: 0, wins: 0, rate: null };
}

function rate(count: MutableCount): RateCount {
  return { opportunities: count.opportunities, wins: count.wins, rate: count.opportunities > 0 ? count.wins / count.opportunities : null };
}

function addCount(target: MutableCount, source: WinLossCount): void {
  target.opportunities += source.opportunities;
  target.wins += source.wins;
}

function entityRef(entityKey: string, labels: TournamentEntityLabels | undefined, kind: "teams" | "players"): { entityKey: string; displayName: string } {
  return { entityKey, displayName: labels?.[kind]?.[entityKey] ?? entityKey };
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function economyIndex(economy: TournamentEconomyType): number {
  return ECONOMY_ORDER.indexOf(economy);
}

function zeroModel(): TournamentAnalytics {
  return {
    provenance: { semanticProfile: null, analysisVersions: [] },
    totals: {
      matchCount: 0,
      mapCount: 0,
      roundCount: 0,
      t: zeroRate(),
      ct: zeroRate(),
      pistolT: zeroRate(),
      pistolCt: zeroRate(),
      round2Conversion: zeroRate(),
      round2Break: zeroRate(),
      ecoSemiUpset: zeroRate(),
      manAdvantage: Object.fromEntries(MAN_ADVANTAGE_KEYS.map((key) => [key, zeroRate()])) as Record<TournamentManAdvantage, RateCount>,
    },
    maps: [],
    teams: [],
    economyMatrix: [],
    weapons: [],
  };
}

export function buildTournamentAnalytics(
  facts: readonly TournamentMapFacts[],
  options: { labels?: TournamentEntityLabels } = {},
): TournamentAnalytics {
  if (facts.length === 0) return zeroModel();

  const mapKeys = new Set<string>();
  const matchKeys = new Set<string>();
  let semanticProfile: string | null = null;
  const analysisVersions = new Set<string>();
  const mapRows = new Map<string, { mapCount: number; roundCount: number; t: MutableCount; ct: MutableCount; pistolT: MutableCount; pistolCt: MutableCount }>();
  const teamRows = new Map<string, {
    mapCount: number;
    maps: TournamentTeamMapCount;
    conversions: ReturnType<typeof zeroTeamConversions>;
  }>();
  const economyRows = new Map<string, { lowEconomy: TournamentEconomyType; highEconomy: TournamentEconomyType; rounds: number; lowEconomyWins: number }>();
  const weaponRows = new Map<string, { kills: number; headshotKills: number; players: Map<string, number> }>();
  const totals = {
    t: zeroCount(),
    ct: zeroCount(),
    pistolT: zeroCount(),
    pistolCt: zeroCount(),
    round2Conversion: zeroCount(),
    round2Break: zeroCount(),
    ecoSemiUpset: zeroCount(),
    manAdvantage: zeroManAdvantage(),
  };
  let roundCount = 0;

  for (const mapFacts of facts) {
    assertMapFacts(mapFacts);
    if (mapKeys.has(mapFacts.mapKey)) invalid(mapFacts.mapKey, "mapKey", "duplicate mapKey");
    mapKeys.add(mapFacts.mapKey);
    matchKeys.add(mapFacts.matchKey);
    if (semanticProfile == null) semanticProfile = mapFacts.semanticProfile;
    else if (semanticProfile !== mapFacts.semanticProfile) invalid(mapFacts.mapKey, "semanticProfile", `mixed profile; expected ${semanticProfile}`);
    analysisVersions.add(mapFacts.analysisVersion);

    const mapA = mapFacts.teamMaps.teamA;
    const mapB = mapFacts.teamMaps.teamB;
    const mapT = { opportunities: mapA.tRounds + mapB.tRounds, wins: mapA.tWins + mapB.tWins };
    const mapCt = { opportunities: mapA.ctRounds + mapB.ctRounds, wins: mapA.ctWins + mapB.ctWins };
    const mapPistolT = { ...mapFacts.pistolSides.t };
    const mapPistolCt = { ...mapFacts.pistolSides.ct };
    const mapRow = mapRows.get(mapFacts.mapName) ?? { mapCount: 0, roundCount: 0, t: zeroCount(), ct: zeroCount(), pistolT: zeroCount(), pistolCt: zeroCount() };
    mapRow.mapCount += 1;
    mapRow.roundCount += mapA.rounds;
    addCount(mapRow.t, mapT);
    addCount(mapRow.ct, mapCt);
    addCount(mapRow.pistolT, mapPistolT);
    addCount(mapRow.pistolCt, mapPistolCt);
    mapRows.set(mapFacts.mapName, mapRow);
    roundCount += mapA.rounds;
    addCount(totals.t, mapT);
    addCount(totals.ct, mapCt);
    addCount(totals.pistolT, mapPistolT);
    addCount(totals.pistolCt, mapPistolCt);

    for (const slot of TEAM_SLOTS) {
      const entityKey = mapFacts.teamEntityKeys[slot];
      const row = teamRows.get(entityKey) ?? { mapCount: 0, maps: { rounds: 0, roundWins: 0, tRounds: 0, tWins: 0, ctRounds: 0, ctWins: 0 }, conversions: zeroTeamConversions() };
      row.mapCount += 1;
      const mapTeam = mapFacts.teamMaps[slot];
      row.maps.rounds += mapTeam.rounds;
      row.maps.roundWins += mapTeam.roundWins;
      row.maps.tRounds += mapTeam.tRounds;
      row.maps.tWins += mapTeam.tWins;
      row.maps.ctRounds += mapTeam.ctRounds;
      row.maps.ctWins += mapTeam.ctWins;
      const mapConversions = mapFacts.teamConversions[slot];
      addCount(row.conversions.pistol, mapConversions.pistol);
      addCount(row.conversions.round2.conversion, mapConversions.round2.conversion);
      addCount(row.conversions.round2.break, mapConversions.round2.break);
      addCount(row.conversions.ecoSemiUpset, mapConversions.ecoSemiUpset);
      for (const key of MAN_ADVANTAGE_KEYS) addCount(row.conversions.manAdvantage[key], mapConversions.manAdvantage[key]);
      teamRows.set(entityKey, row);

      const teamConversion = mapConversions;
      addCount(totals.round2Conversion, teamConversion.round2.conversion);
      addCount(totals.round2Break, teamConversion.round2.break);
      addCount(totals.ecoSemiUpset, teamConversion.ecoSemiUpset);
      for (const key of MAN_ADVANTAGE_KEYS) addCount(totals.manAdvantage[key], teamConversion.manAdvantage[key]);
    }

    for (const cell of mapFacts.economyMatrix) {
      const key = `${cell.lowEconomy}:${cell.highEconomy}`;
      const row = economyRows.get(key) ?? { lowEconomy: cell.lowEconomy, highEconomy: cell.highEconomy, rounds: 0, lowEconomyWins: 0 };
      row.rounds += cell.rounds;
      row.lowEconomyWins += cell.lowEconomyWins;
      economyRows.set(key, row);
    }

    for (const row of mapFacts.playerWeapons) {
      const weapon = weaponRows.get(row.weapon) ?? { kills: 0, headshotKills: 0, players: new Map<string, number>() };
      weapon.kills += row.kills;
      weapon.headshotKills += row.headshotKills;
      weapon.players.set(row.playerEntityKey, (weapon.players.get(row.playerEntityKey) ?? 0) + row.kills);
      weaponRows.set(row.weapon, weapon);
    }
  }

  const teams = [...teamRows.entries()]
    .sort(([a], [b]) => lexicalCompare(a, b))
    .map(([entityKey, row]) => ({
      team: entityRef(entityKey, options.labels, "teams"),
      mapCount: row.mapCount,
      rounds: row.maps.rounds,
      roundWins: row.maps.roundWins,
      roundWinRate: row.maps.rounds > 0 ? row.maps.roundWins / row.maps.rounds : null,
      t: rate({ opportunities: row.maps.tRounds, wins: row.maps.tWins }),
      ct: rate({ opportunities: row.maps.ctRounds, wins: row.maps.ctWins }),
      pistol: rate(row.conversions.pistol),
      round2: {
        conversion: rate(row.conversions.round2.conversion),
        break: rate(row.conversions.round2.break),
      },
      ecoSemiUpset: rate(row.conversions.ecoSemiUpset),
      manAdvantage: Object.fromEntries(MAN_ADVANTAGE_KEYS.map((key) => [key, rate(row.conversions.manAdvantage[key])])) as Record<TournamentManAdvantage, RateCount>,
    }));

  const maps = [...mapRows.entries()]
    .sort(([a], [b]) => lexicalCompare(a, b))
    .map(([mapName, row]) => ({
      mapName,
      mapCount: row.mapCount,
      roundCount: row.roundCount,
      t: rate(row.t),
      ct: rate(row.ct),
      pistolT: rate(row.pistolT),
      pistolCt: rate(row.pistolCt),
    }));

  const economyMatrix = [...economyRows.values()]
    .sort((a, b) => economyIndex(a.lowEconomy) - economyIndex(b.lowEconomy) || economyIndex(a.highEconomy) - economyIndex(b.highEconomy))
    .map((row) => ({
      ...row,
      lowWinRate: row.lowEconomy === row.highEconomy || row.rounds === 0 ? null : row.lowEconomyWins / row.rounds,
    }));

  const weapons = [...weaponRows.entries()]
    .sort(([a, left], [b, right]) => right.kills - left.kills || lexicalCompare(a, b))
    .map(([weapon, row]) => {
      const top = [...row.players.entries()].sort(([a, left], [b, right]) => right - left || lexicalCompare(a, b))[0];
      return {
        weapon,
        kills: row.kills,
        headshotKills: row.headshotKills,
        headshotRate: row.kills > 0 ? row.headshotKills / row.kills : null,
        topPlayer: top ? { ...entityRef(top[0], options.labels, "players"), kills: top[1] } : null,
      };
    });

  return {
    provenance: { semanticProfile, analysisVersions: [...analysisVersions].sort(lexicalCompare) },
    totals: {
      matchCount: matchKeys.size,
      mapCount: mapKeys.size,
      roundCount,
      t: rate(totals.t),
      ct: rate(totals.ct),
      pistolT: rate(totals.pistolT),
      pistolCt: rate(totals.pistolCt),
      round2Conversion: rate(totals.round2Conversion),
      round2Break: rate(totals.round2Break),
      ecoSemiUpset: rate(totals.ecoSemiUpset),
      manAdvantage: Object.fromEntries(MAN_ADVANTAGE_KEYS.map((key) => [key, rate(totals.manAdvantage[key])])) as Record<TournamentManAdvantage, RateCount>,
    },
    maps,
    teams,
    economyMatrix,
    weapons,
  };
}
