import {
  computeRR,
  computePrism,
  hltv2BaselineWeightsV1,
  prismWeightsV1,
  rrToPercentile,
  type RRResult,
  type RRWeights,
  type PrismWeights,
  type PrismComputeInput
} from "@rivalhub/rival-rating";
import type {
  DemoPackage,
  PlayerIndicatorRow,
  PlayerRoundFact,
  PlayerScoreboardRow,
  RRIndicators
} from "@cs2dak/contract";
import type { RRSignals } from "@rivalhub/rival-rating";
import type { AccountRatingResult } from "./signals.js";
import { normalizeDemoPackage } from "./normalize.js";
import { round, firstKillMap, clutchSplit, isUtilityWeapon, killWeaponName } from "./utils.js";
import { fieldAvailability, fieldConfidence } from "./qa.js";

export function deriveRRIndicators(input: unknown): RRIndicators[] {
  const pkg = normalizeDemoPackage(input);
  return buildPlayerIndicators(pkg, buildPlayerRoundFacts(pkg)).map((row) => row.indicators);
}

export function buildPlayerRoundFacts(pkg: DemoPackage): PlayerRoundFact[] {
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

export function buildPlayerIndicators(pkg: DemoPackage, facts: PlayerRoundFact[]): PlayerIndicatorRow[] {
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
    const mkRounds = [...killsByRound.values()];
    const firstKillCount = stats?.firstKillCount ?? playerFacts.filter((fact) => fact.openingDuel === "won").length;
    const firstDeathCount = stats?.firstDeathCount ?? playerFacts.filter((fact) => fact.openingDuel === "lost").length;
    const openingDuels = firstKillCount + firstDeathCount;
    const awpKills = playerKills.filter((kill) => killWeaponName(kill) === "awp").length;
    const sniperKills = playerKills.filter((kill) => ["awp", "ssg08", "scout"].includes(killWeaponName(kill))).length;
    const utilityDamage = stats?.utilityDamage ?? playerFacts.reduce((sum, fact) => sum + fact.utilityDamage, 0);
    const flashAssistCount = stats?.flashAssistCount ?? playerFacts.reduce((sum, fact) => sum + fact.flashAssists, 0);
    const enemyFlashDurationSeconds = stats?.enemyFlashDurationSeconds ?? playerBlinds
      .filter((blind) => blind.flashedTeamKey && blind.flashedTeamKey !== player.teamKey)
      .reduce((sum, blind) => sum + blind.durationSeconds, 0);
    const teamFlashDurationSeconds = stats?.teamFlashDurationSeconds ?? playerBlinds
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
    const clutchWins = stats
      ? stats.vsOneWonCount + stats.vsTwoWonCount + stats.vsThreeWonCount + stats.vsFourWonCount + stats.vsFiveWonCount
      : playerClutches.filter((row) => row.won).length;
    const clutchScore = stats
      ? stats.vsOneWonCount + stats.vsTwoWonCount * 2 + stats.vsThreeWonCount * 3 + stats.vsFourWonCount * 4 + stats.vsFiveWonCount * 5
      : playerClutches.reduce((sum, row) => sum + (row.won ? row.opponentCount : 0), 0);

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
      twoKillRounds: stats?.twoKillCount ?? mkRounds.filter((count) => count === 2).length,
      threeKillRounds: stats?.threeKillCount ?? mkRounds.filter((count) => count === 3).length,
      fourKillRounds: stats?.fourKillCount ?? mkRounds.filter((count) => count === 4).length,
      fiveKillRounds: stats?.fiveKillCount ?? mkRounds.filter((count) => count >= 5).length,
      multiKillRate: round((stats ? stats.twoKillCount + stats.threeKillCount + stats.fourKillCount + stats.fiveKillCount : mkRounds.filter((count) => count >= 2).length) / playedRounds, 4),
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
      combatDeathCount: stats?.combatDeathCount ?? deaths,
      bombDeathCount: stats?.bombDeathCount ?? null,
      wallbangKillCount: stats?.wallbangKillCount ?? playerKills.filter((kill) => (kill.penetratedObjects ?? 0) > 0).length,
      roundSwingTotal: null,
      roundSwingPerKill: null
    } satisfies RRIndicators;
  });

  const rrWeights = hltv2BaselineWeightsV1 as unknown as RRWeights;
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

export function buildScoreboard(
  pkg: DemoPackage,
  rows: PlayerIndicatorRow[],
  accountRatings: Array<{ signals: RRSignals; rr: AccountRatingResult }>
): PlayerScoreboardRow[] {
  const accountBySteamId = new Map(accountRatings.map((row) => [row.signals.steamId64, row]));
  const statsBySteamId = new Map(pkg.playerStats.map((row) => [row.steamId64, row]));
  const availability = fieldAvailability(pkg);
  const confidence = fieldConfidence(availability);
  return rows.map((row) => {
    const account = accountBySteamId.get(row.steamId64);
    const accountRr = account?.rr;
    const combatSignals = account?.signals.combat;
    const stats = statsBySteamId.get(row.steamId64);
    const playerKills = pkg.kills.filter((kill) => kill.killerSteamId64 === row.steamId64);
    return {
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
      combatDeathCount: row.indicators.combatDeathCount,
      bombDeathCount: row.indicators.bombDeathCount,
      wallbangKillCount: row.indicators.wallbangKillCount,
      noScopeKillCount: stats?.noScopeKillCount ?? playerKills.filter((kill) => kill.noScope).length,
      throughSmokeKillCount: playerKills.filter((kill) => kill.throughSmoke).length,
      collateralKillCount: stats?.collateralKillCount ?? null,
      bombPlantCount: stats?.bombPlantCount ?? null,
      bombDefuseCount: stats?.bombDefuseCount ?? null,
      confidence,
      fieldAvailability: availability,
      ratingSeed: round(row.rr.rrBase, 2),
      rr: round(row.rr.rr, 2),
      rrPercentile: round(row.rrPercentile, 1),
      accountRR: round(accountRr?.rr ?? 0, 3),
      accountRRRaw: round(accountRr?.rrRaw ?? 0, 3),
      accountCombatContextFactor: round(accountRr?.combatContextFactor ?? 1, 3),
      accountBreakdown: {
        combat: round(accountRr?.accounts.combat ?? 0, 4),
        trade: round(accountRr?.accounts.trade ?? 0, 4),
        mapControl: round(accountRr?.accounts.mapControl ?? 0, 4),
        clutch: round(accountRr?.accounts.clutch ?? 0, 4),
        objective: round(accountRr?.accounts.objective ?? 0, 4),
        utility: round(accountRr?.accounts.utility ?? 0, 4)
      },
      accountContextStatus: {
        buyDelta: (combatSignals?.killsByBuyDelta == null ? "missing" : "available") as "available" | "missing",
        manState: (combatSignals?.killsByManState == null ? "missing" : "available") as "available" | "missing"
      }
    };
  }).sort((a, b) => b.accountRR - a.accountRR || b.rr - a.rr || b.adr - a.adr);
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
