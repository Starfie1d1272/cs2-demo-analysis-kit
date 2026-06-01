import JSZip from "jszip";
import {
  analysisBundleSchema,
  demoPackageSchema,
  type AnalysisBundle,
  type AccountSignalsV2,
  type DemoPackage,
  type EconomyPoint,
  type HeatmapPoint,
  type PlayerIndicatorRow,
  type PlayerRoundFact,
  type PlayerScoreboardRow,
  type QaIssue,
  type QaReport,
  type RRResultV2,
  type RRIndicators,
  type TeamKey,
  type TimelineEvent,
  type ValueAccountsWeights
} from "@cs2dak/contract";
import {
  computePrism,
  computeRR,
  computeValueAccountsRR,
  prismWeightsV1,
  rrValueAccountsV2Lite,
  rrToPercentile,
  rrWeightsV1,
  type PrismComputeInput,
  type PrismResult,
  type RRResult,
  type RRWeights,
  type PrismWeights
} from "@rivalhub/rival-rating";

export async function loadDemoPackageFromZip(bytes: ArrayBuffer | Uint8Array): Promise<DemoPackage> {
  const zip = await JSZip.loadAsync(bytes);
  const readJson = async <T>(name: string): Promise<T> => {
    const file = zip.file(name);
    if (!file) {
      throw new Error(`Missing ${name} in demo package`);
    }
    return parsePackageJson(await file.async("string")) as T;
  };

  const manifest = await readJson<unknown>("manifest.json");
  const match = await readJson<unknown>("match.json");
  const players = await readJson<unknown>("players.json");
  const rounds = await readJson<unknown>("rounds.json");
  const playerEconomies = await readJson<unknown>("player-economies.json").catch(() => []);
  const playerStats = await readJson<unknown>("player-stats.json").catch(() => []);
  const kills = await readJson<unknown>("kills.json").catch(() => []);
  const damages = await readJson<unknown>("damages.json").catch(() => []);
  const blinds = await readJson<unknown>("blinds.json").catch(() => []);
  const grenades = await readJson<unknown>("grenades.json").catch(() => []);
  const clutches = await readJson<unknown>("clutches.json").catch(() => []);

  return normalizeDemoPackage({
    manifest,
    match,
    players,
    rounds,
    playerEconomies,
    playerStats,
    kills,
    damages,
    blinds,
    grenades,
    clutches
  });
}

export function analyzeDemoPackage(input: unknown): AnalysisBundle {
  const pkg = normalizeDemoPackage(input);
  const qa = buildQaReport(pkg);
  const playerRoundFacts = buildPlayerRoundFacts(pkg);
  const playerIndicators = buildPlayerIndicators(pkg, playerRoundFacts);
  const accountRatings = computeAccountRatingsV2(pkg);
  const scoreboard = buildScoreboard(playerIndicators, accountRatings);
  const timeline = buildTimeline(pkg);
  const economy = buildEconomy(pkg);
  const heatmap = buildHeatmap(pkg);

  return analysisBundleSchema.parse({
    version: "cs2-demo-analysis-kit/0.2",
    sourceSchemaVersion: pkg.manifest.schemaVersion,
    mapName: pkg.match.mapName,
    tickrate: pkg.match.tickrate,
    teams: {
      teamA: { name: pkg.match.teamA.name ?? "Team A", score: pkg.match.teamA.score },
      teamB: { name: pkg.match.teamB.name ?? "Team B", score: pkg.match.teamB.score }
    },
    scoreboard,
    playerIndicators,
    playerRoundFacts,
    timeline,
    economy,
    heatmap,
    qa
  });
}

export function buildDemoViewModel(bundle: AnalysisBundle) {
  return {
    title: `${bundle.teams.teamA.name} vs ${bundle.teams.teamB.name}`,
    subtitle: `${bundle.mapName} · ${bundle.scoreboard.length} 名选手 · ${bundle.economy.length} 回合`,
    map: {
      name: bundle.mapName,
      radarImageUrl: radarImageUrlForMap(bundle.mapName),
      calibrated: bundle.heatmap.length > 0
    },
    scoreline: `${bundle.teams.teamA.score}:${bundle.teams.teamB.score}`,
    teams: bundle.teams,
    scoreboard: bundle.scoreboard,
    playerIndicators: bundle.playerIndicators,
    playerRoundFacts: bundle.playerRoundFacts,
    timeline: bundle.timeline,
    economy: bundle.economy,
    heatmap: bundle.heatmap,
    qa: bundle.qa
  };
}

export function normalizeDemoPackage(input: unknown): DemoPackage {
  const raw = input as Record<string, unknown>;
  const manifest = raw.manifest as Record<string, unknown> | undefined;

  if (manifest?.schemaVersion === "cs2-demo-format/1.0") {
    return demoPackageSchema.parse(normalizeV1Package(raw));
  }

  return demoPackageSchema.parse(input);
}

export function deriveAccountSignalsV2(input: unknown): AccountSignalsV2[] {
  const pkg = normalizeDemoPackage(input);
  const statsBySteamId = new Map(pkg.playerStats.map((row) => [row.steamId64, row]));
  const killsByBuyDelta = buildKillsByBuyDelta(pkg);
  const killsByManState = buildKillsByManState(pkg);
  const tradedOpeningDeaths = buildTradedOpeningDeaths(pkg);
  const objective = buildObjectiveSignals(pkg);
  const utility = buildUtilitySignals(pkg);

  return pkg.players.map((player) => {
    const stats = statsBySteamId.get(player.steamId64);
    const playerKills = pkg.kills.filter((kill) => kill.killerSteamId64 === player.steamId64);
    const playerDeaths = pkg.kills.filter((kill) => kill.victimSteamId64 === player.steamId64);
    const playerClutches = pkg.clutches.filter((row) => row.clutcherSteamId64 === player.steamId64);
    const rounds = Math.max(stats?.rounds ?? pkg.rounds.length, 0);

    return {
      steamId64: player.steamId64,
      rounds,
      sourceVersion: "cs2-demo-analysis-kit/0.3",
      combat: {
        kills: stats?.kills ?? playerKills.length,
        deaths: stats?.deaths ?? playerDeaths.length,
        assists: stats?.assists ?? 0,
        effectiveDamage: stats?.damageHealth ?? sumDamageForPlayer(pkg, player.steamId64),
        openingKills: stats?.firstKillCount ?? openingKillsForPlayer(pkg, player.steamId64),
        openingDeaths: stats?.firstDeathCount ?? openingDeathsForPlayer(pkg, player.steamId64),
        multiKills: {
          two: stats?.twoKillCount ?? multiKillRounds(playerKills, 2),
          three: stats?.threeKillCount ?? multiKillRounds(playerKills, 3),
          four: stats?.fourKillCount ?? multiKillRounds(playerKills, 4),
          five: stats?.fiveKillCount ?? multiKillRounds(playerKills, 5)
        },
        headshotKills: stats?.headshotCount ?? playerKills.filter((kill) => kill.headshot).length,
        wallbangKills: stats?.wallbangKillCount ?? playerKills.filter((kill) => kill.penetratedObjects > 0).length,
        killsByBuyDelta: killsByBuyDelta.get(player.steamId64) ?? zeroBuyDelta(),
        killsByManState: killsByManState.get(player.steamId64) ?? zeroManState()
      },
      trade: {
        tradeKills: stats?.tradeKillCount ?? playerKills.filter((kill) => kill.tradeKill).length,
        tradedDeaths: stats?.tradeDeathCount ?? playerDeaths.filter((kill) => kill.tradeDeath).length,
        deaths: stats?.deaths ?? playerDeaths.length,
        tradedOpeningDeaths: tradedOpeningDeaths.get(player.steamId64) ?? 0
      },
      clutch: {
        vsOne: clutchSplitV2(stats?.vsOneCount, stats?.vsOneWonCount, playerClutches, 1),
        vsTwo: clutchSplitV2(stats?.vsTwoCount, stats?.vsTwoWonCount, playerClutches, 2),
        vsThree: clutchSplitV2(stats?.vsThreeCount, stats?.vsThreeWonCount, playerClutches, 3),
        vsFour: clutchSplitV2(stats?.vsFourCount, stats?.vsFourWonCount, playerClutches, 4),
        vsFive: clutchSplitV2(stats?.vsFiveCount, stats?.vsFiveWonCount, playerClutches, 5)
      },
      objective: objective.get(player.steamId64) ?? { plants: 0, defuses: 0, plantsConverted: 0 },
      utility: utility.get(player.steamId64) ?? {
        flashAssists: stats?.flashAssistCount ?? 0,
        enemyFlashDurationSeconds: stats?.enemyFlashDurationSeconds ?? 0,
        teamFlashDurationSeconds: stats?.teamFlashDurationSeconds ?? 0,
        utilityDamage: stats?.utilityDamage ?? 0
      }
    } satisfies AccountSignalsV2;
  });
}

export function computeAccountRatingsV2(input: unknown): Array<{ signals: AccountSignalsV2; rr: RRResultV2 }> {
  const weights = rrValueAccountsV2Lite as unknown as ValueAccountsWeights;
  return deriveAccountSignalsV2(input).map((signals) => ({
    signals,
    rr: computeValueAccountsRR(signals, weights)
  }));
}

type BuyDeltaBuckets = NonNullable<AccountSignalsV2["combat"]["killsByBuyDelta"]>;
type ManStateBuckets = NonNullable<AccountSignalsV2["combat"]["killsByManState"]>;
type ObjectiveBuckets = AccountSignalsV2["objective"];
type UtilityBuckets = AccountSignalsV2["utility"];

const BUY_DELTA_EVEN_THRESHOLD = 1000;

function buildKillsByBuyDelta(pkg: DemoPackage): Map<string, BuyDeltaBuckets> {
  const out = new Map<string, BuyDeltaBuckets>();
  const economyByPlayerRound = new Map(pkg.playerEconomies.map((row) => [`${row.roundNumber}:${row.steamId64}`, row]));

  for (const kill of pkg.kills) {
    if (!kill.killerSteamId64) continue;
    const killerEconomy = economyByPlayerRound.get(`${kill.roundNumber}:${kill.killerSteamId64}`);
    const victimEconomy = economyByPlayerRound.get(`${kill.roundNumber}:${kill.victimSteamId64}`);
    if (!killerEconomy || !victimEconomy) continue;

    const buckets = getOrInit(out, kill.killerSteamId64, zeroBuyDelta);
    const delta = killerEconomy.equipmentValue - victimEconomy.equipmentValue;
    if (delta <= -BUY_DELTA_EVEN_THRESHOLD) {
      buckets.disadvantage += 1;
    } else if (delta >= BUY_DELTA_EVEN_THRESHOLD) {
      buckets.advantage += 1;
    } else {
      buckets.even += 1;
    }
  }

  return out;
}

function buildKillsByManState(pkg: DemoPackage): Map<string, ManStateBuckets> {
  const out = new Map<string, ManStateBuckets>();
  const playersByTeam = {
    teamA: pkg.players.filter((player) => player.teamKey === "teamA").map((player) => player.steamId64),
    teamB: pkg.players.filter((player) => player.teamKey === "teamB").map((player) => player.steamId64)
  };

  for (const roundRow of pkg.rounds) {
    const alive = {
      teamA: new Set(playersByTeam.teamA),
      teamB: new Set(playersByTeam.teamB)
    };
    const roundKills = pkg.kills
      .filter((kill) => kill.roundNumber === roundRow.roundNumber)
      .sort((a, b) => a.tick - b.tick);

    for (const kill of roundKills) {
      if (kill.killerSteamId64 && kill.killerTeamKey && kill.killerTeamKey !== kill.victimTeamKey) {
        const buckets = getOrInit(out, kill.killerSteamId64, zeroManState);
        const killerAlive = alive[kill.killerTeamKey].size;
        const victimAlive = alive[kill.victimTeamKey].size;
        const diff = killerAlive - victimAlive;
        if (diff < 0) {
          buckets.manDown += 1;
        } else if (diff > 0) {
          buckets.manUp += 1;
        } else {
          buckets.even += 1;
        }
      }
      alive[kill.victimTeamKey].delete(kill.victimSteamId64);
    }
  }

  return out;
}

function buildTradedOpeningDeaths(pkg: DemoPackage): Map<string, number> {
  const out = new Map<string, number>();
  for (const kill of firstKillMap(pkg).values()) {
    if (kill.tradeDeath) {
      out.set(kill.victimSteamId64, (out.get(kill.victimSteamId64) ?? 0) + 1);
    }
  }
  return out;
}

function buildObjectiveSignals(pkg: DemoPackage): Map<string, ObjectiveBuckets> {
  const out = new Map<string, ObjectiveBuckets>();
  const roundWinner = new Map(pkg.rounds.map((round) => [round.roundNumber, round.winnerTeamKey]));

  for (const bomb of pkg.bombs) {
    if (!bomb.actorSteamId64) continue;
    const buckets = getOrInit(out, bomb.actorSteamId64, () => ({ plants: 0, defuses: 0, plantsConverted: 0 }));
    if (bomb.type === "planted") {
      buckets.plants += 1;
      if (bomb.actorTeamKey && roundWinner.get(bomb.roundNumber) === bomb.actorTeamKey) {
        buckets.plantsConverted = (buckets.plantsConverted ?? 0) + 1;
      }
    } else if (bomb.type === "defused") {
      buckets.defuses += 1;
    }
  }

  return out;
}

function buildUtilitySignals(pkg: DemoPackage): Map<string, UtilityBuckets> {
  const out = new Map<string, UtilityBuckets>();
  const statsBySteamId = new Map(pkg.playerStats.map((row) => [row.steamId64, row]));

  for (const player of pkg.players) {
    const stats = statsBySteamId.get(player.steamId64);
    out.set(player.steamId64, {
      flashAssists: stats?.flashAssistCount ?? pkg.kills.filter((kill) => kill.flashAssisterSteamId64 === player.steamId64).length,
      enemyFlashDurationSeconds: stats?.enemyFlashDurationSeconds ?? 0,
      teamFlashDurationSeconds: stats?.teamFlashDurationSeconds ?? 0,
      utilityDamage: stats?.utilityDamage ?? 0
    });
  }

  for (const blind of pkg.blinds) {
    const buckets = getOrInit(out, blind.flasherSteamId64, () => ({
      flashAssists: 0,
      enemyFlashDurationSeconds: 0,
      teamFlashDurationSeconds: 0,
      utilityDamage: 0
    }));
    if (blind.flasherTeamKey !== blind.flashedTeamKey) {
      buckets.enemyFlashDurationSeconds = round(buckets.enemyFlashDurationSeconds + blind.durationSeconds, 3);
    } else if (blind.flashedSteamId64 !== blind.flasherSteamId64) {
      buckets.teamFlashDurationSeconds = round((buckets.teamFlashDurationSeconds ?? 0) + blind.durationSeconds, 3);
    }
  }

  return out;
}

function sumDamageForPlayer(pkg: DemoPackage, steamId64: string): number {
  return pkg.damages
    .filter((damage) => damage.attackerSteamId64 === steamId64 && damage.attackerTeamKey !== damage.victimTeamKey)
    .reduce((sum, damage) => sum + damage.healthDamage, 0);
}

function openingKillsForPlayer(pkg: DemoPackage, steamId64: string): number {
  return [...firstKillMap(pkg).values()].filter((kill) => kill.killerSteamId64 === steamId64).length;
}

function openingDeathsForPlayer(pkg: DemoPackage, steamId64: string): number {
  return [...firstKillMap(pkg).values()].filter((kill) => kill.victimSteamId64 === steamId64).length;
}

function multiKillRounds(kills: DemoPackage["kills"], target: number): number {
  const counts = new Map<number, number>();
  for (const kill of kills) {
    counts.set(kill.roundNumber, (counts.get(kill.roundNumber) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => (target === 5 ? count >= 5 : count === target)).length;
}

function clutchSplitV2(
  count: number | undefined,
  won: number | undefined,
  rows: DemoPackage["clutches"],
  opponentCount: number
) {
  const filtered = rows.filter((row) => row.opponentCount === opponentCount);
  return {
    count: count ?? filtered.length,
    won: won ?? filtered.filter((row) => row.won).length
  };
}

function zeroBuyDelta(): BuyDeltaBuckets {
  return { disadvantage: 0, even: 0, advantage: 0 };
}

function zeroManState(): ManStateBuckets {
  return { manDown: 0, even: 0, manUp: 0 };
}

function getOrInit<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing) return existing;
  const next = create();
  map.set(key, next);
  return next;
}

function normalizeV1Package(raw: Record<string, unknown>): Record<string, unknown> {
  const match = raw.match as Record<string, unknown>;
  const rounds = asRecords(raw.rounds).filter((round) => numberValue(round.roundNumber) > 0);
  const roundByNumber = new Map(rounds.map((round) => [numberValue(round.roundNumber), round]));

  return {
    manifest: {
      ...(raw.manifest as Record<string, unknown>),
      schemaVersion: "cs2-demo-format/2.0"
    },
    match: {
      ...match,
      durationSeconds: numberValue(match.durationSeconds) > 0 ? match.durationSeconds : undefined
    },
    players: raw.players,
    rounds: rounds.map((round) => normalizeV1Round(round)),
    playerEconomies: asRecords(raw.playerEconomies)
      .filter((row) => numberValue(row.roundNumber) > 0)
      .map((row) => ({ ...row, type: normalizeEconomyType(row.type) })),
    playerStats: raw.playerStats ?? [],
    kills: asRecords(raw.kills)
      .filter((kill) => numberValue(kill.roundNumber) > 0)
      .map((kill) => normalizeV1Kill(kill, roundByNumber)),
    damages: asRecords(raw.damages)
      .filter((row) => numberValue(row.roundNumber) > 0)
      .map((row) => normalizeV1Damage(row, roundByNumber)),
    blinds: asRecords(raw.blinds).filter((row) => numberValue(row.roundNumber) > 0),
    grenades: asRecords(raw.grenades)
      .filter((row) => numberValue(row.roundNumber) > 0)
      .map((row) => normalizeV1Grenade(row, roundByNumber)),
    clutches: asRecords(raw.clutches).filter((row) => numberValue(row.roundNumber) > 0)
  };
}

function buildQaReport(pkg: DemoPackage): QaReport {
  const issues: QaIssue[] = [];
  const roundNumbers = pkg.rounds.map((round) => round.roundNumber).sort((a, b) => a - b);
  const playerIds = new Set(pkg.players.map((player) => player.steamId64));

  for (let i = 0; i < roundNumbers.length; i += 1) {
    if (roundNumbers[i] !== i + 1) {
      issues.push({
        severity: "error",
        code: "rounds.not_contiguous",
        message: `Round numbers should be contiguous from 1; found ${roundNumbers[i]} at index ${i}.`,
        path: "rounds"
      });
      break;
    }
  }

  const expectedEconomyRows = pkg.players.length * pkg.rounds.length;
  if (pkg.playerEconomies.length < expectedEconomyRows) {
    issues.push({
      severity: "warning",
      code: "economy.coverage_incomplete",
      message: `Expected ${expectedEconomyRows} player economy rows, found ${pkg.playerEconomies.length}.`,
      path: "playerEconomies"
    });
  }

  for (const kill of pkg.kills) {
    if (kill.killerSteamId64 && !playerIds.has(kill.killerSteamId64)) {
      issues.push({
        severity: "warning",
        code: "kill.unknown_killer",
        message: `Killer ${kill.killerSteamId64} is not present in players.json.`,
        path: "kills"
      });
    }
    if (!playerIds.has(kill.victimSteamId64)) {
      issues.push({
        severity: "error",
        code: "kill.unknown_victim",
        message: `Victim ${kill.victimSteamId64} is not present in players.json.`,
        path: "kills"
      });
    }
  }

  const spatialRows = pkg.kills.filter((kill) => kill.victimPosition.x !== 0 || kill.victimPosition.y !== 0).length;
  if (pkg.kills.length > 0 && spatialRows === 0) {
    issues.push({
      severity: "warning",
      code: "spatial.no_real_kill_positions",
      message: "Kills exist, but no non-origin victim positions were found.",
      path: "kills"
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return {
    ok: errorCount === 0,
    summary: {
      issueCount: issues.length,
      errorCount,
      warningCount
    },
    issues
  };
}

function buildPlayerRoundFacts(pkg: DemoPackage): PlayerRoundFact[] {
  const firstKillByRound = firstKillMap(pkg);

  return pkg.rounds.flatMap((roundRow) =>
    pkg.players.map((player) => {
      const kills = pkg.kills.filter((kill) => kill.roundNumber === roundRow.roundNumber && kill.killerSteamId64 === player.steamId64);
      const deaths = pkg.kills.filter((kill) => kill.roundNumber === roundRow.roundNumber && kill.victimSteamId64 === player.steamId64);
      const assists = pkg.kills.filter((kill) => kill.roundNumber === roundRow.roundNumber && kill.assisterSteamId64 === player.steamId64);
      const flashAssists = pkg.kills.filter((kill) => kill.roundNumber === roundRow.roundNumber && kill.flashAssisterSteamId64 === player.steamId64);
      const damageRows = pkg.damages.filter((row) => row.roundNumber === roundRow.roundNumber && row.attackerSteamId64 === player.steamId64 && row.victimTeamKey !== player.teamKey);
      const economy = pkg.playerEconomies.find((row) => row.roundNumber === roundRow.roundNumber && row.steamId64 === player.steamId64);
      const side = player.teamKey === "teamA" ? roundRow.teamASide : roundRow.teamBSide;
      const firstKill = firstKillByRound.get(roundRow.roundNumber);
      const kastTags = new Set<PlayerRoundFact["kastTags"][number]>();

      if (kills.length > 0) kastTags.add("kill");
      if (assists.length > 0 || flashAssists.length > 0) kastTags.add("assist");
      if (deaths.length === 0) kastTags.add("survive");
      if (deaths.some((death) => death.tradeDeath)) kastTags.add("trade");

      return {
        roundNumber: roundRow.roundNumber,
        steamId64: player.steamId64,
        name: player.name,
        teamKey: player.teamKey,
        side,
        survived: deaths.length === 0,
        kills: kills.length,
        deaths: deaths.length,
        assists: assists.length + flashAssists.length,
        damage: damageRows.reduce((sum, row) => sum + row.healthDamage, 0),
        utilityDamage: damageRows.filter((row) => isUtilityWeapon(row.weapon)).reduce((sum, row) => sum + row.healthDamage, 0),
        flashAssists: flashAssists.length + kills.filter((kill) => kill.flashAssist).length,
        tradeKills: kills.filter((kill) => kill.tradeKill).length,
        tradedDeaths: deaths.filter((death) => death.tradeDeath).length,
        openingDuel: firstKill?.killerSteamId64 === player.steamId64 ? "won" : firstKill?.victimSteamId64 === player.steamId64 ? "lost" : "none",
        kastTags: [...kastTags],
        equipmentValue: economy?.equipmentValue ?? null,
        economyType: economy?.type ?? null
      };
    })
  );
}

function buildPlayerIndicators(pkg: DemoPackage, facts: PlayerRoundFact[]): PlayerIndicatorRow[] {
  const indicators = pkg.players.map((player) => {
    const stats = pkg.playerStats.find((row) => row.steamId64 === player.steamId64);
    const playerFacts = facts.filter((fact) => fact.steamId64 === player.steamId64);
    const playerKills = pkg.kills.filter((kill) => kill.killerSteamId64 === player.steamId64);
    const playerDeaths = pkg.kills.filter((kill) => kill.victimSteamId64 === player.steamId64);
    const playerEconomies = pkg.playerEconomies.filter((row) => row.steamId64 === player.steamId64);
    const playerClutches = pkg.clutches.filter((row) => row.clutcherSteamId64 === player.steamId64);
    const playerBlinds = pkg.blinds.filter((row) => row.flasherSteamId64 === player.steamId64);
    const totalRounds = Math.max(playerFacts.length, 1);
    const killsByRound = new Map<number, number>();
    for (const kill of playerKills) {
      killsByRound.set(kill.roundNumber, (killsByRound.get(kill.roundNumber) ?? 0) + 1);
    }
    const multiKillRounds = [...killsByRound.values()];
    const firstKillCount = stats?.firstKillCount ?? playerFacts.filter((fact) => fact.openingDuel === "won").length;
    const firstDeathCount = stats?.firstDeathCount ?? playerFacts.filter((fact) => fact.openingDuel === "lost").length;
    const openingDuels = firstKillCount + firstDeathCount;
    const awpKills = playerKills.filter((kill) => normalizeWeapon(kill.weapon) === "awp").length;
    const sniperKills = playerKills.filter((kill) => ["awp", "ssg08", "scout"].includes(normalizeWeapon(kill.weapon))).length;
    const utilityDamage = stats?.utilityDamage ?? playerFacts.reduce((sum, fact) => sum + fact.utilityDamage, 0);
    const flashAssistCount = playerFacts.reduce((sum, fact) => sum + fact.flashAssists, 0);
    const enemyFlashDurationSeconds = playerBlinds
      .filter((blind) => blind.flashedTeamKey && blind.flashedTeamKey !== player.teamKey)
      .reduce((sum, blind) => sum + blind.durationSeconds, 0);
    const teamFlashDurationSeconds = playerBlinds
      .filter((blind) => blind.flashedTeamKey === player.teamKey && blind.flashedSteamId64 !== player.steamId64)
      .reduce((sum, blind) => sum + blind.durationSeconds, 0);
    const grenadeCount = pkg.grenades.filter((grenade) => grenade.throwerSteamId64 === player.steamId64).length;
    const deaths = stats?.deaths ?? playerDeaths.length;
    const kills = stats?.kills ?? playerKills.length;
    const assists = stats?.assists ?? playerFacts.reduce((sum, fact) => sum + fact.assists, 0);
    const damage = stats?.damageHealth ?? playerFacts.reduce((sum, fact) => sum + fact.damage, 0);
    const tradeKillCount = stats?.tradeKillCount ?? playerFacts.reduce((sum, fact) => sum + fact.tradeKills, 0);
    const tradeDeathCount = stats?.tradeDeathCount ?? playerFacts.reduce((sum, fact) => sum + fact.tradedDeaths, 0);
    const playedRounds = Math.max(stats?.rounds ?? totalRounds, 1);
    const clutchWins = playerClutches.filter((row) => row.won).length;
    const clutchScore = playerClutches.reduce((sum, row) => sum + (row.won ? row.opponentCount : 0), 0);

    return {
      steamId64: player.steamId64,
      totalRounds: playedRounds,
      kills,
      deaths,
      assists,
      kpr: round(kills / playedRounds, 4),
      dpr: round(deaths / playedRounds, 4),
      apr: round(assists / playedRounds, 4),
      adr: round(stats?.adr ?? damage / playedRounds, 2),
      hsPercent: kills > 0 ? round(((stats?.headshotCount ?? playerKills.filter((kill) => kill.headshot).length) / kills) * 100, 2) : 0,
      kast: round(stats?.kast ?? (playerFacts.filter((fact) => fact.kastTags.length > 0).length / playedRounds) * 100, 2),
      survivalRate: round(Math.max(0, playedRounds - deaths) / playedRounds, 4),
      twoKillRounds: stats?.twoKillCount ?? multiKillRounds.filter((count) => count === 2).length,
      threeKillRounds: stats?.threeKillCount ?? multiKillRounds.filter((count) => count === 3).length,
      fourKillRounds: stats?.fourKillCount ?? multiKillRounds.filter((count) => count === 4).length,
      fiveKillRounds: stats?.fiveKillCount ?? multiKillRounds.filter((count) => count >= 5).length,
      multiKillRate: round((stats ? stats.twoKillCount + stats.threeKillCount + stats.fourKillCount + stats.fiveKillCount : multiKillRounds.filter((count) => count >= 2).length) / playedRounds, 4),
      firstKillCount,
      firstDeathCount,
      firstKillRate: round(firstKillCount / playedRounds, 4),
      firstDeathRate: round(firstDeathCount / playedRounds, 4),
      openingDuelRate: round(openingDuels / playedRounds, 4),
      openingDuelWinRate: openingDuels > 0 ? round(firstKillCount / openingDuels, 4) : 0,
      tradeKillCount,
      tradeDeathCount,
      tradeKillRate: round(tradeKillCount / playedRounds, 4),
      tradeDeathRate: deaths > 0 ? round(tradeDeathCount / deaths, 4) : 0,
      clutchAttempts: playerClutches.length,
      clutchWins,
      clutchWinRate: playerClutches.length > 0 ? round(clutchWins / playerClutches.length, 4) : 0,
      clutchFrequency: round(playerClutches.length / playedRounds, 4),
      clutchScore,
      clutchScoreRate: round(clutchScore / playedRounds, 4),
      vsOne: clutchSplit(stats?.vsOneCount, stats?.vsOneWonCount, playerClutches, 1),
      vsTwo: clutchSplit(stats?.vsTwoCount, stats?.vsTwoWonCount, playerClutches, 2),
      vsThree: clutchSplit(stats?.vsThreeCount, stats?.vsThreeWonCount, playerClutches, 3),
      vsFour: clutchSplit(stats?.vsFourCount, stats?.vsFourWonCount, playerClutches, 4),
      vsFive: clutchSplit(stats?.vsFiveCount, stats?.vsFiveWonCount, playerClutches, 5),
      awpKills,
      awpKillsPerRound: round(awpKills / playedRounds, 4),
      awpKillRate: kills > 0 ? round(awpKills / kills, 4) : 0,
      sniperKills,
      sniperKillRate: kills > 0 ? round(sniperKills / kills, 4) : 0,
      awpMultiKillRate: null,
      awpDuelWinRate: null,
      utilityDamage,
      utilityDamagePerRound: round(stats?.averageUtilityDamagePerRound ?? utilityDamage / playedRounds, 2),
      flashAssistCount,
      flashAssistPerRound: round(flashAssistCount / playedRounds, 4),
      blindDurationTotal: round(enemyFlashDurationSeconds, 2),
      blindDurationPerRound: round(enemyFlashDurationSeconds / playedRounds, 2),
      enemyFlashDurationSeconds: round(enemyFlashDurationSeconds, 2),
      enemyFlashDurationPerRound: round(enemyFlashDurationSeconds / playedRounds, 2),
      teamFlashDurationSeconds: round(teamFlashDurationSeconds, 2),
      teamFlashDurationPerRound: round(teamFlashDurationSeconds / playedRounds, 2),
      grenadeCount,
      grenadeCountPerRound: round(grenadeCount / playedRounds, 4),
      ecoRoundCount: playerEconomies.filter((row) => row.type === "eco").length,
      forceRoundCount: playerEconomies.filter((row) => row.type === "force").length,
      fullBuyRoundCount: playerEconomies.filter((row) => row.type === "full").length,
      pistolRoundCount: playerEconomies.filter((row) => row.type === "pistol").length,
      avgEquipmentValue: playerEconomies.length > 0 ? round(playerEconomies.reduce((sum, row) => sum + row.equipmentValue, 0) / playerEconomies.length, 2) : 0,
      combatDeathCount: deaths,
      bombDeathCount: null,
      wallbangKillCount: playerKills.filter((kill) => (kill.penetratedObjects ?? 0) > 0).length,
      roundSwingTotal: null,
      roundSwingPerKill: null
    } satisfies RRIndicators;
  });

  const rrWeights = rrWeightsV1 as unknown as RRWeights;
  const prismWeights = prismWeightsV1 as unknown as PrismWeights;
  const rrResults = indicators.map((indicator) => computeRR(indicator, rrWeights));
  const rrScores = rrResults.map((result) => result.rr);
  const prismInputs: PrismComputeInput[] = indicators.map((indicator, index) => ({
    indicators: indicator,
    mapCount: 1,
    rrPercentile: round(rrToPercentile(rrScores, rrResults[index]?.rr ?? 1), 1)
  }));
  const prismResults = computePrism(prismInputs, prismWeights);

  return indicators.map((indicator, index) => {
    const player = pkg.players.find((row) => row.steamId64 === indicator.steamId64);
    return {
      steamId64: indicator.steamId64,
      name: player?.name ?? indicator.steamId64,
      teamKey: player?.teamKey ?? "teamA",
      indicators: indicator,
      rr: rrResults[index] ?? zeroRR(rrWeights.version),
      rrPercentile: prismInputs[index]?.rrPercentile ?? 50,
      prism: prismResults.find((result) => result.steamId64 === indicator.steamId64) ?? null
    };
  });
}

function buildScoreboard(
  rows: PlayerIndicatorRow[],
  accountRatings: Array<{ signals: AccountSignalsV2; rr: RRResultV2 }>
): PlayerScoreboardRow[] {
  const accountRatingBySteamId = new Map(accountRatings.map((row) => [row.signals.steamId64, row.rr]));
  return rows.map((row) => ({
    steamId64: row.steamId64,
    name: row.name,
    teamKey: row.teamKey,
    kills: row.indicators.kills,
    deaths: row.indicators.deaths,
    assists: row.indicators.assists,
    adr: round(row.indicators.adr, 1),
    kast: round(row.indicators.kast, 1),
    headshotPercent: round(row.indicators.hsPercent, 1),
    entryKills: row.indicators.firstKillCount,
    tradeKills: row.indicators.tradeKillCount,
    awpKills: row.indicators.awpKills,
    utilityDamage: row.indicators.utilityDamage,
    ratingSeed: round(row.rr.rrBase, 2),
    rr: round(row.rr.rr, 2),
    rrPercentile: round(row.rrPercentile, 1),
    accountRR: round(accountRatingBySteamId.get(row.steamId64)?.rr ?? 0, 3),
    accountRRRaw: round(accountRatingBySteamId.get(row.steamId64)?.rrRaw ?? 0, 3),
    accountCombatContextFactor: round(accountRatingBySteamId.get(row.steamId64)?.combatContextFactor ?? 1, 3)
  })).sort((a, b) => b.accountRR - a.accountRR || b.rr - a.rr || b.adr - a.adr);
}

function buildTimeline(pkg: DemoPackage): TimelineEvent[] {
  const killEvents = pkg.kills.map<TimelineEvent>((kill, index) => ({
    id: `kill-${index}`,
    roundNumber: kill.roundNumber,
    tick: kill.tick,
    timeSeconds: tickToRoundSeconds(pkg, kill.roundNumber, kill.tick),
    type: "kill",
    label: `${nameForSteamId(pkg, kill.killerSteamId64) ?? "环境"} 击杀 ${nameForSteamId(pkg, kill.victimSteamId64)}`,
    teamKey: kill.killerTeamKey
  }));

  const grenadeEvents = pkg.grenades.map<TimelineEvent>((grenade, index) => ({
    id: `grenade-${index}`,
    roundNumber: grenade.roundNumber,
    tick: grenade.effectTick,
    timeSeconds: tickToRoundSeconds(pkg, grenade.roundNumber, grenade.effectTick),
    type: "grenade",
    label: `${nameForSteamId(pkg, grenade.throwerSteamId64) ?? "未知选手"} 投掷${grenadeLabel(grenade.grenade)}`,
    teamKey: grenade.throwerTeamKey
  }));

  const roundEvents = pkg.rounds.map<TimelineEvent>((roundRow) => ({
    id: `round-end-${roundRow.roundNumber}`,
    roundNumber: roundRow.roundNumber,
    tick: roundRow.endTick,
    timeSeconds: tickToRoundSeconds(pkg, roundRow.roundNumber, roundRow.endTick),
    type: "round-end",
    label: `${sideLabel(roundRow.winnerSide)}获胜 · ${endReasonLabel(roundRow.endReason)}`,
    teamKey: roundRow.winnerTeamKey
  }));

  return [...killEvents, ...grenadeEvents, ...roundEvents].sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick);
}

function buildEconomy(pkg: DemoPackage): EconomyPoint[] {
  return pkg.rounds.map((roundRow) => {
    const rows = pkg.playerEconomies.filter((row) => row.roundNumber === roundRow.roundNumber);
    const sumForTeam = (teamKey: TeamKey) =>
      rows
        .filter((row) => row.teamKey === teamKey)
        .reduce((sum, row) => sum + row.equipmentValue, 0);
    const teamA = sumForTeam("teamA");
    const teamB = sumForTeam("teamB");

    return {
      roundNumber: roundRow.roundNumber,
      teamA,
      teamB,
      advantage: teamA - teamB,
      teamAEconomy: roundRow.teamAEconomy,
      teamBEconomy: roundRow.teamBEconomy,
      winnerTeamKey: roundRow.winnerTeamKey
    };
  });
}

function buildHeatmap(pkg: DemoPackage): HeatmapPoint[] {
  const kills = pkg.kills.flatMap<HeatmapPoint>((kill) => {
    const out: HeatmapPoint[] = [
      {
        x: kill.victimPosition.x,
        y: kill.victimPosition.y,
        z: kill.victimPosition.z,
        roundNumber: kill.roundNumber,
        teamKey: kill.victimTeamKey,
        steamId64: kill.victimSteamId64,
        kind: "death"
      }
    ];
    if (kill.killerPosition) {
      out.push({
        x: kill.killerPosition.x,
        y: kill.killerPosition.y,
        z: kill.killerPosition.z,
        roundNumber: kill.roundNumber,
        teamKey: kill.killerTeamKey,
        steamId64: kill.killerSteamId64,
        kind: "kill"
      });
    }
    return out;
  });

  const grenades = pkg.grenades
    .map<HeatmapPoint>((grenade) => ({
      x: grenade.effectPosition.x,
      y: grenade.effectPosition.y,
      z: grenade.effectPosition.z,
      roundNumber: grenade.roundNumber,
      teamKey: grenade.throwerTeamKey,
      steamId64: grenade.throwerSteamId64,
      kind: "grenade"
    }));

  return [...kills, ...grenades].filter((point) => point.x !== 0 || point.y !== 0);
}

function firstKillMap(pkg: DemoPackage) {
  const firstKillByRound = new Map<number, DemoPackage["kills"][number]>();
  for (const kill of [...pkg.kills].sort((a, b) => a.tick - b.tick)) {
    if (!firstKillByRound.has(kill.roundNumber)) {
      firstKillByRound.set(kill.roundNumber, kill);
    }
  }
  return firstKillByRound;
}

function tickToRoundSeconds(pkg: DemoPackage, roundNumber: number, tick: number): number {
  const roundRow = pkg.rounds.find((row) => row.roundNumber === roundNumber);
  if (!roundRow) {
    return 0;
  }
  return round(Math.max(0, tick - roundRow.freezeEndTick) / pkg.match.tickrate, 2);
}

function nameForSteamId(pkg: DemoPackage, steamId: string | null): string | null {
  if (!steamId) {
    return null;
  }
  return pkg.players.find((player) => player.steamId64 === steamId)?.name ?? steamId;
}

function isUtilityWeapon(weapon: string): boolean {
  return ["hegrenade", "inferno", "molotov", "incgrenade"].includes(normalizeWeapon(weapon));
}

function normalizeWeapon(weapon: string): string {
  return weapon.toLowerCase().replace(/^weapon_/, "");
}

function grenadeLabel(type: string): string {
  const labels: Record<string, string> = {
    smoke: "烟雾弹",
    smokegrenade: "烟雾弹",
    flashbang: "闪光弹",
    hegrenade: "手雷",
    molotov: "燃烧弹",
    incgrenade: "燃烧弹",
    decoy: "诱饵弹"
  };
  return labels[normalizeWeapon(type)] ?? type;
}

function sideLabel(side: "t" | "ct"): string {
  return side === "t" ? "进攻方" : "防守方";
}

function endReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    t_win: "歼灭",
    ct_win: "歼灭",
    target_bombed: "爆炸",
    bomb_defused: "拆包",
    target_saved: "时间耗尽"
  };
  return labels[reason] ?? reason;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row)) : [];
}

function normalizeV1Round(round: Record<string, unknown>): Record<string, unknown> {
  return {
    ...round,
    startTick: positiveInt(round.startTick),
    freezeEndTick: positiveInt(round.freezeEndTick),
    endTick: positiveInt(round.endTick),
    teamASide: normalizeSide(round.teamASide) ?? "t",
    teamBSide: normalizeSide(round.teamBSide) ?? "ct",
    teamAEconomy: normalizeEconomyType(round.teamAEconomy),
    teamBEconomy: normalizeEconomyType(round.teamBEconomy),
    winnerSide: normalizeSide(round.winnerSide) ?? sideForTeam(round.winnerTeamKey, round) ?? "t"
  };
}

function normalizeV1Kill(kill: Record<string, unknown>, rounds: Map<number, Record<string, unknown>>): Record<string, unknown> {
  const round = rounds.get(numberValue(kill.roundNumber));
  return {
    ...kill,
    tick: positiveInt(kill.tick),
    killerTeamKey: normalizeTeamKey(kill.killerTeamKey),
    victimTeamKey: normalizeTeamKey(kill.victimTeamKey) ?? "teamA",
    killerSide: normalizeSide(kill.killerSide) ?? sideForTeam(kill.killerTeamKey, round),
    victimSide: normalizeSide(kill.victimSide) ?? sideForTeam(kill.victimTeamKey, round) ?? "t",
    killerPosition: sanitizeNullablePosition(kill.killerPosition),
    victimPosition: sanitizePosition(kill.victimPosition)
  };
}

function normalizeV1Damage(row: Record<string, unknown>, rounds: Map<number, Record<string, unknown>>): Record<string, unknown> {
  const round = rounds.get(numberValue(row.roundNumber));
  return {
    ...row,
    tick: positiveInt(row.tick),
    weapon: typeof row.weapon === "string" && row.weapon.length > 0 ? row.weapon : "unknown",
    attackerTeamKey: normalizeTeamKey(row.attackerTeamKey),
    victimTeamKey: normalizeTeamKey(row.victimTeamKey) ?? "teamA",
    attackerSide: normalizeSide(row.attackerSide) ?? sideForTeam(row.attackerTeamKey, round),
    victimSide: normalizeSide(row.victimSide) ?? sideForTeam(row.victimTeamKey, round) ?? "t",
    attackerPosition: sanitizeNullablePosition(row.attackerPosition),
    victimPosition: sanitizeNullablePosition(row.victimPosition) ?? undefined
  };
}

function normalizeV1Grenade(row: Record<string, unknown>, rounds: Map<number, Record<string, unknown>>): Record<string, unknown> {
  const round = rounds.get(numberValue(row.roundNumber));
  const teamKey = normalizeTeamKey(row.throwerTeamKey ?? row.teamKey);
  return {
    roundNumber: row.roundNumber,
    tick: positiveInt(row.effectTick ?? row.throwTick ?? row.tick),
    steamId64: row.throwerSteamId64 ?? row.steamId64 ?? null,
    teamKey,
    side: normalizeSide(row.throwerSide ?? row.side) ?? sideForTeam(teamKey, round),
    grenadeType: typeof row.grenade === "string" && row.grenade.length > 0 ? row.grenade : row.grenadeType ?? "unknown",
    eventType: row.eventType ?? "effect",
    position: sanitizeNullablePosition(row.effectPosition ?? row.throwPosition ?? row.position)
  };
}

function sideForTeam(teamKey: unknown, round: Record<string, unknown> | undefined): "t" | "ct" | null {
  const team = normalizeTeamKey(teamKey);
  if (!team || !round) {
    return null;
  }
  return normalizeSide(team === "teamA" ? round.teamASide : round.teamBSide);
}

function normalizeTeamKey(value: unknown): TeamKey | null {
  return value === "teamA" || value === "teamB" ? value : null;
}

function normalizeSide(value: unknown): "t" | "ct" | null {
  return value === "t" || value === "ct" ? value : null;
}

function normalizeEconomyType(value: unknown): "pistol" | "eco" | "semi" | "force" | "full" {
  return value === "pistol" || value === "eco" || value === "semi" || value === "force" || value === "full" ? value : "full";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function positiveInt(value: unknown): number {
  return Math.max(1, Math.trunc(numberValue(value)));
}

function parsePackageJson(text: string): unknown {
  return JSON.parse(text.replace(/\bNaN\b/g, "null"));
}

function sanitizeNullablePosition(value: unknown): { x: number; y: number; z: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const point = value as Record<string, unknown>;
  const x = numberValue(point.x);
  const y = numberValue(point.y);
  const z = numberValue(point.z);
  if (x === 0 && y === 0 && z === 0) {
    return null;
  }
  return { x, y, z };
}

function sanitizePosition(value: unknown): { x: number; y: number; z: number } {
  return sanitizeNullablePosition(value) ?? { x: 0, y: 0, z: 0 };
}

function radarImageUrlForMap(mapName: string): string | null {
  const knownMaps = new Set(["de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_overpass"]);
  return knownMaps.has(mapName) ? `/maps/radars/${mapName}.png` : null;
}

function clutchSplit(
  statsCount: number | undefined,
  statsWon: number | undefined,
  clutches: DemoPackage["clutches"],
  opponentCount: number
) {
  const rows = clutches.filter((row) => row.opponentCount === opponentCount);
  return {
    count: statsCount ?? rows.length,
    won: statsWon ?? rows.filter((row) => row.won).length
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function zeroRR(version: string): RRResult {
  return {
    rr: 1,
    rrBase: 1,
    rrSwing: 0,
    weightsVersion: version,
    breakdown: {
      kastTerm: 0,
      kprTerm: 0,
      dprTerm: 0,
      impactTerm: 0,
      adrTerm: 0,
      intercept: 0
    }
  };
}
