import { readFile } from "node:fs/promises";
import { beforeAll, expect, it } from "vitest";
import type { DemoPackage } from "@cs2dak/contract";
import { loadDemoPackageFromZip } from "./loader.js";
import { buildPlayerRoundPerformanceFacts, deriveKillTrades } from "./performance-facts.js";
import { deriveRRSignals } from "./signals.js";

let base: DemoPackage;
let a: number[];
let b: number[];
beforeAll(async () => {
  base = await loadDemoPackageFromZip(await readFile("fixtures/input/cologne-major-2026-stage3-smoke-de_nuke.zip"), { profile: "evidence" });
  a = base.players.flatMap((p, i) => p.teamKey === "teamA" ? [i] : []);
  b = base.players.flatMap((p, i) => p.teamKey === "teamB" ? [i] : []);
});
function kill(killerIndex: number | null, victimIndex: number, tick: number, roundNumber = 1): DemoPackage["kills"][number] {
  return { ...base.kills[0]!, killerIndex, victimIndex, tick, roundNumber, assisterIndex: null, flashAssisterIndex: null, flashAssist: false, tradeKill: true, tradeDeath: true };
}
function source(kills: DemoPackage["kills"]): DemoPackage {
  return { ...base, kills, damages: [], blinds: [], grenades: [], bombs: [], clutches: [] };
}

it("rebuilds only the most recent eligible death, ignoring stale flags and input order without mutation", () => {
  const first = kill(b[0]!, a[0]!, 100);
  const latest = kill(b[0]!, a[1]!, 150);
  const trade = kill(a[2]!, b[0]!, 200);
  const pkg = source([trade, first, latest]);
  const snapshot = structuredClone(pkg);
  const trades = deriveKillTrades(pkg);
  expect([...trades.tradeKills]).toEqual([trade]);
  expect([...trades.tradedDeaths]).toEqual([latest]);
  const facts = buildPlayerRoundPerformanceFacts(pkg);
  const traded = facts.playerRounds.find(r => r.roundNumber === 1 && r.steamId64 === base.players[a[1]!]!.steamId64)!;
  expect(traded).toMatchObject({ tradedDeaths: 1, kast: true });
  expect(traded.kastTags).toContain("trade");
  expect(facts.playerRounds.find(r => r.roundNumber === 1 && r.steamId64 === base.players[a[0]!]!.steamId64)?.tradedDeaths).toBe(0);
  const trader = facts.playerRounds.find(r => r.roundNumber === 1 && r.steamId64 === base.players[a[2]!]!.steamId64)!;
  expect(trader.tradeKills).toBe(1);
  expect(trader.weapons.reduce((n, w) => n + w.tradeKills, 0)).toBe(1);
  expect(deriveRRSignals(pkg, facts).find(r => r.steamId64 === trader.steamId64)?.trade.tradeKills).toBe(1);
  expect(pkg).toEqual(snapshot);
});

it("uses an inclusive six-second window at the package tickrate", () => {
  for (const tickrate of [64, 128]) {
    for (const extra of [0, 1]) {
      const death = kill(b[0]!, a[0]!, 100);
      const trade = kill(a[1]!, b[0]!, 100 + 6 * tickrate + extra);
      const pkg = source([death, trade]);
      pkg.match = { ...pkg.match, tickrate };
      expect(deriveKillTrades(pkg).tradeKills.has(trade)).toBe(extra === 0);
    }
  }
});

it("rejects cross-round, teamkill, suicide and world-death trade chains", () => {
  const cases = [
    [kill(b[0]!, a[0]!, 100, 1), kill(a[1]!, b[0]!, 101, 2)],
    [kill(b[0]!, b[1]!, 100), kill(a[0]!, b[0]!, 101)],
    [kill(b[0]!, a[0]!, 100), kill(b[1]!, b[0]!, 101)],
    [kill(b[0]!, b[0]!, 100), kill(a[0]!, b[0]!, 101)],
    [kill(null, a[0]!, 100), kill(b[0]!, a[1]!, 101)],
    [kill(b[0]!, a[0]!, 100), kill(null, b[0]!, 101)],
    // The original ZIP bug paired this late-round suicide with an earlier kill.
    [kill(b[0]!, b[0]!, 101299, 12), kill(a[0]!, b[0]!, 18017, 2)],
  ];
  for (const kills of cases) {
    const pkg = source(kills);
    expect(deriveKillTrades(pkg).tradeKills.size).toBe(0);
    expect(buildPlayerRoundPerformanceFacts(pkg).playerRounds.reduce((n, r) => n + r.tradedDeaths, 0)).toBe(0);
  }
});

it("preserves source order for equal ticks and does not impose a 19-event scan limit", () => {
  const death = kill(b[0]!, a[0]!, 100);
  const trade = kill(a[1]!, b[0]!, 100);
  expect(deriveKillTrades(source([death, trade])).tradeKills.has(trade)).toBe(true);
  expect(deriveKillTrades(source([trade, death])).tradeKills.has(trade)).toBe(false);
  const intervening = Array.from({ length: 20 }, (_, i) => kill(null, b[1]!, 101 + i));
  const later = kill(a[1]!, b[0]!, 130);
  expect(deriveKillTrades(source([death, ...intervening, later])).tradeKills.has(later)).toBe(true);
});
