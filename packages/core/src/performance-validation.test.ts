import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import type { DemoPackage, PackageKill } from "@cs2dak/contract";
import { loadDemoPackageFromZip } from "./loader.js";
import { aggregatePlayerRoundPerformanceFacts, buildPlayerRoundPerformanceFacts } from "./performance-facts.js";
import { assertPlayerRoundPerformanceFacts } from "./performance-validation.js";
import { deriveOpeningDuels } from "./duels.js";

let pkg: DemoPackage;
beforeAll(async () => {
  pkg = await loadDemoPackageFromZip(await readFile("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip"));
});
function scenario(events: Array<[number | null, number, number]>, roundNumber = 1, swapped = false): DemoPackage {
  const original = pkg.rounds[0]!;
  const round = { ...original, roundNumber, teamASide: swapped ? "ct" as const : "t" as const, teamBSide: swapped ? "t" as const : "ct" as const, winnerSide: swapped ? "ct" as const : "t" as const, winnerTeamKey: "teamA" as const };
  return { ...pkg, rounds: [round], kills: events.map(([killerIndex, victimIndex, tick]) => ({ ...pkg.kills[0]!, roundNumber, tick: original.freezeEndTick + tick, killerIndex, victimIndex, assisterIndex: null, flashAssisterIndex: null, flashAssist: false, tradeKill: false, tradeDeath: false, headshot: false } as PackageKill)), damages: [], blinds: [], grenades: [], bombs: [], clutches: [], playerEconomies: [], replay: undefined, shots: undefined, duels: undefined };
}
function indices() {
  const teamA = pkg.players.flatMap((player, index) => player.teamKey === "teamA" ? [index] : []);
  const teamB = pkg.players.flatMap((player, index) => player.teamKey === "teamB" ? [index] : []);
  return [teamA[0]!, teamA[1]!, teamB[0]!, teamB[1]!] as const;
}

describe("enemy opening definition and source invariants", () => {
  it.each(["teamkill", "suicide", "world"])("%s before an enemy kill does not receive opening credit", kind => {
    const [a, b, c] = indices();
    const source = scenario([[kind === "world" ? null : a, kind === "teamkill" ? b : a, 10], [c, kind === "teamkill" ? a : b, 20]]);
    const facts = buildPlayerRoundPerformanceFacts(source);
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).not.toThrow();
    const winner = facts.playerRounds.find(row => row.openingDuel === "won")!;
    const loser = facts.playerRounds.find(row => row.openingDuel === "lost")!;
    expect(winner.steamId64).toBe(pkg.players[c]!.steamId64);
    expect(loser.steamId64).toBe(pkg.players[kind === "teamkill" ? a : b]!.steamId64);
    expect(facts.playerRounds.filter(row => row.openingDuel !== "none")).toHaveLength(2);
    expect(deriveOpeningDuels(source).map(duel => [duel.killerSteamId64, duel.victimSteamId64])).toEqual([[winner.steamId64, loser.steamId64]]);
  });
  it("only nonenemy deaths leave every FK/FD at zero", () => {
    const [a, b] = indices();
    const source = scenario([[a, b, 10], [a, a, 20]]);
    const facts = buildPlayerRoundPerformanceFacts(source);
    expect([...aggregatePlayerRoundPerformanceFacts(facts).values()].every(row => row.firstKills === 0 && row.firstDeaths === 0)).toBe(true);
    expect(deriveOpeningDuels(source)).toEqual([]);
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).not.toThrow();
  });
  it.each([false, true])("equal ticks use stable event order (reversed=%s)", reversed => {
    const [a, b, c, d] = indices();
    const events: Array<[number, number, number]> = [[a, c, 10], [b, d, 10]];
    if (reversed) events.reverse();
    const source = scenario(events);
    const facts = buildPlayerRoundPerformanceFacts(source);
    expect(facts.playerRounds.find(row => row.openingDuel === "won")!.steamId64).toBe(pkg.players[events[0]![0]]!.steamId64);
    expect(deriveOpeningDuels(source)[0]!.killerIndex).toBe(events[0]![0]);
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).not.toThrow();
  });
  it.each([13, 25])("side swap/overtime round %s keeps team identity and the paired opening", roundNumber => {
    const [a, , c] = indices();
    const source = scenario([[a, c, 10]], roundNumber, true);
    const facts = buildPlayerRoundPerformanceFacts(source);
    expect(facts.playerRounds.find(row => row.openingDuel === "won")).toMatchObject({ steamId64: pkg.players[a]!.steamId64, teamKey: "teamA", side: "ct" });
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).not.toThrow();
  });
  it("accepts old serialized facts metadata without mutating its historical warnings", () => {
    const [a, , c] = indices();
    const source = scenario([[a, c, 10]]);
    const historical = { ...buildPlayerRoundPerformanceFacts(source), openingParity: { nonComparableRounds: [1] }, qa: { issues: [{ code: "performance.parity_not_comparable", severity: "warning", message: "Historical exporter opening comparison" }] } };
    const snapshot = JSON.stringify(historical);
    expect(() => assertPlayerRoundPerformanceFacts(source, historical)).not.toThrow();
    expect(JSON.stringify(historical)).toBe(snapshot);
    expect(buildPlayerRoundPerformanceFacts(source)).not.toHaveProperty("openingParity");
  });
  it("unknown player identities fail explicitly rather than guessing an enemy", () => {
    const [, , c] = indices();
    expect(() => buildPlayerRoundPerformanceFacts(scenario([[99, c, 10]]))).toThrow("unknown playerIndex=99");
  });
  it.each(["missing", "duplicate", "identity", "damage", "utility", "weapon", "weapon annotation", "opening", "manState"])("rejects corrupted supplied %s facts", corruption => {
    const [a, , c] = indices();
    const source = scenario([[a, c, 10]]), facts = structuredClone(buildPlayerRoundPerformanceFacts(source));
    const row = facts.playerRounds.find(row => row.openingDuel === "won")!;
    if (corruption === "missing") facts.playerRounds.pop();
    if (corruption === "duplicate") facts.playerRounds.push({ ...row });
    if (corruption === "identity") row.steamId64 = "unknown";
    if (corruption === "damage") row.damage++;
    if (corruption === "utility") row.utility.enemyBlindSeconds++;
    if (corruption === "weapon") row.weapons[0]!.kills++;
    if (corruption === "weapon annotation") row.weapons[0]!.wallbangKills++;
    if (corruption === "opening") row.openingDuel = "none";
    if (corruption === "manState") facts.manState[0]!.advantageAlive--;
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).toThrow("source invariant");
  });
});
