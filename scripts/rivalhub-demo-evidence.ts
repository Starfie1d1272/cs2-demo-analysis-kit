import { readFile, writeFile } from "node:fs/promises";
import { analyzeDemoPackage, buildPlayerRoundFacts, buildPlayerRoundUtilityFacts, demoSourceAvailability, loadDemoPackageFromZip } from "../packages/core/src/index.ts";
import type { DemoPackage } from "../packages/contract/src/index.ts";
import { buildTournamentInsightsFromFacts, extractTournamentFacts } from "../packages/presentation/src/index.ts";

export type RivalHubEvidenceTarget = {
  seasonId: string; stageKey: string; stageRunId?: string; matchId: string; matchMapId: string;
  mapOrder: number; entryAId: string; entryBId: string; expectedMapName: string; evidenceRevision: string;
};

export type RivalHubMatchedParticipant = { steamId64: string; nameSnapshot: string; userId: string; eventRosterMemberId: string; entryId: string };

export function fixtureTarget(): RivalHubEvidenceTarget {
  return {
    seasonId: "10000000-0000-4000-8000-000000000001", stageKey: "fixture-stage",
    stageRunId: "10000000-0000-4000-8000-000000000002", matchId: "10000000-0000-4000-8000-000000000003",
    matchMapId: "10000000-0000-4000-8000-000000000004", mapOrder: 1,
    entryAId: "10000000-0000-4000-8000-000000000005", entryBId: "10000000-0000-4000-8000-000000000006",
    expectedMapName: "de_ancient", evidenceRevision: "fixture-revision-1",
  };
}

function fixtureIdentity(player: DemoPackage["players"][number], index: number, target: RivalHubEvidenceTarget): RivalHubMatchedParticipant {
  const suffix = String(index + 1).padStart(2, "0");
  return {
    steamId64: `765611980000000${suffix}`,
    nameSnapshot: `Fixture Player ${suffix}`,
    userId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    eventRosterMemberId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    entryId: player.teamKey === "teamA" ? target.entryAId : target.entryBId,
  };
}

function mappedSteam(pkg: DemoPackage, identities: Map<string, RivalHubMatchedParticipant>, playerIndex: number | null): string | null {
  if (playerIndex === null) return null;
  const player = pkg.players[playerIndex];
  return player ? identities.get(player.steamId64)?.steamId64 ?? null : null;
}

function teamConversions(pkg: DemoPackage) {
  const insights = buildTournamentInsightsFromFacts([extractTournamentFacts({ matchId: "fixture", pkg })]);
  const names = { teamA: pkg.match.teamA.name ?? "Team A", teamB: pkg.match.teamB.name ?? "Team B" };
  return { economyMatrix: insights.economyMatrix.map((row) => ({
    lowEconomy: row.lowEconomy,
    highEconomy: row.highEconomy,
    rounds: row.rounds,
    lowEconomyWins: row.lowEconomyWins,
  })), teams: (["teamA", "teamB"] as const).map((teamKey) => {
    const summary = insights.teamEconomySummaries.find((row) => row.teamName === names[teamKey])!;
    const states = new Map(summary.manAdvantage.states.map((row) => [`${row.advantageAlive}v${row.disadvantageAlive}`, row]));
    const state = (label: "5v4" | "5v3") => states.get(label);
    return {
      teamKey,
      pistol: { opportunities: summary.pistol.rounds, wins: summary.pistol.wins },
      round2: {
        conversion: { opportunities: summary.round2.conversionRounds, wins: summary.round2.conversionWins },
        break: { opportunities: summary.round2.breakRounds, wins: summary.round2.breakWins },
      },
      ecoSemiUpset: { opportunities: summary.smallBuyUpset.opportunities, wins: summary.smallBuyUpset.wins },
      manAdvantage: [
        { advantage: "5v4", opportunities: state("5v4")?.advantageOpportunities ?? 0, wins: state("5v4")?.advantageWins ?? 0 },
        { advantage: "4v5", opportunities: state("5v4")?.disadvantageOpportunities ?? 0, wins: state("5v4")?.disadvantageWins ?? 0 },
        { advantage: "5v3", opportunities: state("5v3")?.advantageOpportunities ?? 0, wins: state("5v3")?.advantageWins ?? 0 },
        { advantage: "3v5", opportunities: state("5v3")?.disadvantageOpportunities ?? 0, wins: state("5v3")?.disadvantageWins ?? 0 },
      ],
    };
  }) };
}

export function buildRivalHubDemoEvidenceV1(pkg: DemoPackage, target: RivalHubEvidenceTarget, identities: Map<string, RivalHubMatchedParticipant>) {
  const analysis = analyzeDemoPackage(pkg);
  const facts = buildPlayerRoundFacts(pkg);
  const utilityFacts = new Map(buildPlayerRoundUtilityFacts(pkg).map((fact) => [`${fact.roundNumber}:${fact.steamId64}`, fact]));
  const playerIndex = new Map(pkg.players.map((player, index) => [player.steamId64, index]));
  const roundSeq = new Map(pkg.rounds.map((round, index) => [round.roundNumber, index + 1]));
  const playerRounds = facts.map((fact) => {
    const index = playerIndex.get(fact.steamId64)!;
    const clutch = pkg.clutches.find((row) => row.roundNumber === fact.roundNumber && row.clutcherIndex === index);
    const utility = utilityFacts.get(`${fact.roundNumber}:${fact.steamId64}`)!;
    return {
      roundSeq: roundSeq.get(fact.roundNumber)!, steamId64: identities.get(fact.steamId64)!.steamId64, teamKey: fact.teamKey, side: fact.side,
      survived: fact.survived, kills: fact.kills, deaths: fact.deaths, assists: fact.assists, damage: fact.damage,
      headshots: pkg.kills.filter((row) => row.roundNumber === fact.roundNumber && row.killerIndex === index && row.headshot).length,
      tradeKills: fact.tradeKills, tradedDeaths: fact.tradedDeaths, openingDuel: fact.openingDuel, kast: fact.kastTags.length > 0,
      economyType: fact.economyType, equipmentValue: fact.equipmentValue,
      clutch: clutch ? { opponentCount: clutch.opponentCount, won: clutch.won } : null,
      utility: {
        flashesThrown: utility.flashesThrown,
        enemyBlindSeconds: utility.enemyBlindSeconds,
        teamBlindSeconds: utility.teamBlindSeconds,
        enemyBlindVictims: utility.enemyBlindVictims,
        flashAssists: utility.flashAssists,
        heThrows: utility.heThrows,
        heDamage: utility.heDamage,
        fireThrows: utility.fireThrows,
        fireDamage: utility.fireDamage,
        smokesThrown: utility.smokesThrown,
        utilityKills: utility.utilityKills,
      },
    };
  });
  const playerMaps = pkg.players.map((player) => {
    const steamId64 = identities.get(player.steamId64)!.steamId64;
    const rows = playerRounds.filter((row) => row.steamId64 === steamId64);
    const byCount = (key: "kills" | "deaths" | "assists" | "damage" | "headshots" | "tradeKills") => rows.reduce((sum, row) => sum + row[key], 0);
    const multi = (count: number) => rows.filter((row) => row.kills === count).length;
    const clutches = rows.filter((row) => row.clutch !== null);
    return { steamId64, teamKey: player.teamKey, rounds: rows.length, kills: byCount("kills"), deaths: byCount("deaths"), assists: byCount("assists"), damage: byCount("damage"), kastRounds: rows.filter((row) => row.kast).length, headshots: byCount("headshots"), firstKills: rows.filter((row) => row.openingDuel === "won").length, firstDeaths: rows.filter((row) => row.openingDuel === "lost").length, tradeKills: byCount("tradeKills"), twoKillRounds: multi(2), threeKillRounds: multi(3), fourKillRounds: multi(4), fiveKillRounds: rows.filter((row) => row.kills >= 5).length, clutchAttempts: clutches.length, clutchWins: clutches.filter((row) => row.clutch?.won).length };
  });
  const weapons = new Map<string, { steamId64: string; weapon: string; kills: number; headshotKills: number }>();
  for (const kill of pkg.kills) {
    const steamId64 = mappedSteam(pkg, identities, kill.killerIndex); if (!steamId64) continue;
    const key = `${steamId64}:${kill.weapon}`; const row = weapons.get(key) ?? { steamId64, weapon: kill.weapon, kills: 0, headshotKills: 0 };
    row.kills += 1; if (kill.headshot) row.headshotKills += 1; weapons.set(key, row);
  }
  const conversions = teamConversions(pkg);
  return {
    contract: { contractVersion: "rivalhub-demo-evidence/1", semanticProfile: "dak-stable/1", analysisVersion: analysis.provenance.analysisVersion },
    target,
    source: { demoSha256: pkg.manifest.demo?.hash ?? "0".repeat(64), mapName: pkg.match.mapName, tickRateHz: pkg.match.tickrate, sourceSchemaVersion: pkg.manifest.schemaVersion, exporterVersion: `${pkg.manifest.exporter.name}/${pkg.manifest.exporter.version}`, parserVersion: `${pkg.manifest.parser.name}/${pkg.manifest.parser.version}`, assistantVersion: "rivalhub-demo-assistant/0.1.0-fixture", generatedAt: new Date(pkg.manifest.exportedAt).toISOString() },
    quality: { qa: { ok: analysis.qa.ok, ...analysis.qa.summary }, capabilities: demoSourceAvailability(pkg) },
    participants: pkg.players.map((player) => { const identity = identities.get(player.steamId64)!; return { steamId64: identity.steamId64, nameSnapshot: identity.nameSnapshot, observedTeamKey: player.teamKey, resolution: { status: "matched", userId: identity.userId, eventRosterMemberId: identity.eventRosterMemberId, entryId: identity.entryId } }; }),
    sourceFacts: {
      rounds: pkg.rounds.map((row, index) => ({ roundSeq: index + 1, sourceRoundNumber: row.roundNumber, phase: row.roundNumber <= 24 ? "regulation" : "overtime", startTick: row.startTick, freezeEndTick: row.freezeEndTick, endTick: row.endTick, teamASide: row.teamASide, teamBSide: row.teamBSide, teamAScoreBefore: row.teamAScoreBefore, teamBScoreBefore: row.teamBScoreBefore, teamAEconomy: row.teamAEconomy, teamBEconomy: row.teamBEconomy, winnerTeamKey: row.winnerTeamKey, winnerSide: row.winnerSide, endReason: row.endReason })),
      kills: pkg.kills.map((row) => ({ roundSeq: roundSeq.get(row.roundNumber)!, tick: row.tick, killerSteamId64: mappedSteam(pkg, identities, row.killerIndex), victimSteamId64: mappedSteam(pkg, identities, row.victimIndex)!, weapon: row.weapon, headshot: row.headshot })),
      objectives: pkg.bombs.map((row) => ({ roundSeq: roundSeq.get(row.roundNumber)!, tick: row.tick, type: row.type, site: row.site, actorSteamId64: mappedSteam(pkg, identities, row.actorIndex) })),
    },
    semanticFacts: { playerRounds, economyMatrix: conversions.economyMatrix, teamConversions: conversions.teams },
    summaries: {
      playerMaps, playerWeapons: [...weapons.values()],
      teamMaps: (["teamA", "teamB"] as const).map((teamKey) => { const rounds = pkg.rounds.filter((row) => true); const side = (row: typeof pkg.rounds[number]) => teamKey === "teamA" ? row.teamASide : row.teamBSide; return { teamKey, rounds: rounds.length, roundWins: rounds.filter((row) => row.winnerTeamKey === teamKey).length, tRounds: rounds.filter((row) => side(row) === "t").length, tWins: rounds.filter((row) => side(row) === "t" && row.winnerTeamKey === teamKey).length, ctRounds: rounds.filter((row) => side(row) === "ct").length, ctWins: rounds.filter((row) => side(row) === "ct" && row.winnerTeamKey === teamKey).length }; }),
    },
    extensions: {},
  };
}

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("Usage: tsx scripts/rivalhub-demo-evidence.ts <demo-package.zip> <output.json>");
  const pkg = await loadDemoPackageFromZip(await readFile(input));
  const target = fixtureTarget();
  const identities = new Map(pkg.players.map((player, index) => [player.steamId64, fixtureIdentity(player, index, target)]));
  await writeFile(output, `${JSON.stringify(buildRivalHubDemoEvidenceV1(pkg, target, identities), null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
