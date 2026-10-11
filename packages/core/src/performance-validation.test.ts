import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import type { DemoPackage, PackageKill } from "@cs2dak/contract";
import { loadDemoPackageFromZip } from "./loader.js";
import { aggregatePlayerRoundPerformanceFacts, buildPlayerRoundPerformanceFacts } from "./performance-facts.js";
import { assertPlayerRoundPerformanceFacts } from "./performance-facts.js";
import { deriveOpeningDuels } from "./duels.js";

let pkg: DemoPackage;
beforeAll(async () => {
  pkg = await loadDemoPackageFromZip(await readFile("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip"));
});
function scenario(events: Array<[number | null, number, number]>, roundNumber = 1, swapped = false): DemoPackage {
  const original = pkg.rounds[0]!;
  const round = { ...original, roundNumber, teamASide: swapped ? "ct" as const : "t" as const, teamBSide: swapped ? "t" as const : "ct" as const, winnerSide: swapped ? "ct" as const : "t" as const, winnerTeamKey: "teamA" as const };
  return { ...pkg, players: pkg.players.map(player => ({ ...player })), rounds: [round], kills: events.map(([killerIndex, victimIndex, tick]) => ({ ...pkg.kills[0]!, roundNumber, tick: original.freezeEndTick + tick, killerIndex, victimIndex, assisterIndex: null, flashAssisterIndex: null, flashAssist: false, tradeKill: false, tradeDeath: false, headshot: false } as PackageKill)), damages: [], blinds: [], grenades: [], bombs: [], clutches: [], playerEconomies: [], replay: undefined, shots: undefined, duels: undefined };
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
  it("detects in-place facts mutation after an earlier successful validation", () => {
    const [a, , c] = indices(), source = scenario([[a, c, 10]]);
    const facts = buildPlayerRoundPerformanceFacts(source);
    assertPlayerRoundPerformanceFacts(source, facts);
    facts.playerRounds[0]!.damage++;
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).toThrow(/damage/);
  });
  it("rebuilds through the owner when source events change, rejecting stale supplied facts", () => {
    const [a, b, c] = indices(), source = scenario([[a, c, 10]]);
    const facts = buildPlayerRoundPerformanceFacts(source);
    source.kills[0]!.killerIndex = b;
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).toThrow("source invariant");
    expect(() => assertPlayerRoundPerformanceFacts(source, buildPlayerRoundPerformanceFacts(source))).not.toThrow();
  });
  it("checks untrusted serialized facts and rejects cross-Demo reuse with different events", () => {
    const [a, b, c] = indices(), source = scenario([[a, c, 10]]);
    const serialized = JSON.parse(JSON.stringify(buildPlayerRoundPerformanceFacts(source)));
    const unregisteredSource = structuredClone(source);
    expect(() => assertPlayerRoundPerformanceFacts(unregisteredSource, serialized)).not.toThrow();
    expect(() => assertPlayerRoundPerformanceFacts(scenario([[b, c, 10]]), serialized)).toThrow("source invariant");
  });
  it("rejects duplicate source identities without a second event calculator", () => {
    const [a, , c] = indices(), source = scenario([[a, c, 10]]);
    source.players[1]!.steamId64 = source.players[0]!.steamId64;
    expect(() => buildPlayerRoundPerformanceFacts(source)).toThrow("duplicate player or round identity");
  });
  it("warm validations do not rebuild event facts, skip heavy streams, and still detect corruption", () => {
    const [a, , c] = indices(), source = scenario([[a, c, 10]]);
    let classifications = 0;
    source.kills = source.kills.map(kill => new Proxy(kill, { get(target, field, receiver) {
      if (field === "killerIndex") classifications++;
      return Reflect.get(target, field, receiver);
    } }));
    const facts = buildPlayerRoundPerformanceFacts(source);
    for (const field of ["replay", "shots", "duels"] as const) Object.defineProperty(source, field, { get() { throw new Error("heavy stream must not be read"); } });
    classifications = 0;
    assertPlayerRoundPerformanceFacts(source, facts);
    assertPlayerRoundPerformanceFacts(source, facts);
    // Two reads per signature (JSON value and original-value safety check), no producer rebuild.
    expect(classifications).toBe(source.kills.length * 4);
    facts.playerRounds[0]!.damage++;
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).toThrow(/damage/);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY])("rejects non-finite cached values instead of serializing them as null (%s)", value => {
    const [a, , c] = indices(), source = scenario([[a, c, 10]]);
    const facts = buildPlayerRoundPerformanceFacts(source);
    facts.playerRounds[0]!.equipmentValue = value;
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).toThrow("non-finite number");
  });
  it("rejects custom serialization that could hide malformed cached data", () => {
    const [a, , c] = indices(), source = scenario([[a, c, 10]]);
    const facts = buildPlayerRoundPerformanceFacts(source);
    facts.playerRounds[0]!.clutch = { toJSON: () => null } as unknown as typeof facts.playerRounds[0]["clutch"];
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).toThrow("custom serialization");
  });
  it("accepts reordered serialized rows and labels without changing stable identity", () => {
    const [a, , c] = indices(), source = scenario([[a, c, 10]]);
    const facts = structuredClone(buildPlayerRoundPerformanceFacts(source));
    facts.playerRounds.reverse();
    facts.playerRounds.forEach(row => { row.name = "Changed label"; });
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).not.toThrow();
  });
  it("checks label structure without using the label value as identity", () => {
    const [a, , c] = indices(), source = scenario([[a, c, 10]]);
    const facts = buildPlayerRoundPerformanceFacts(source);
    facts.playerRounds[0]!.name = [] as unknown as string;
    expect(() => assertPlayerRoundPerformanceFacts(source, facts)).toThrow("facts structure");
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
