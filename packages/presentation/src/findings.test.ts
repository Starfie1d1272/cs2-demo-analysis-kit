import { describe, expect, it } from "vitest";
import type { DuelFinderRow } from "@cs2dak/contract";
import type { TacticalCluster } from "@cs2dak/cohort";
import {
  buildMistakeFindings,
  findingFromDuel,
  findingFromTacticalCluster,
  findingFromUtilityDamage,
} from "./findings.js";

const evidence = { matchId: "m1", roundNumber: 12, tick: 128, reason: "长枪局首死", role: "example" as const };

describe("AnalysisFinding adapters", () => {
  it("only turns evidence-backed mistake rules into system findings", () => {
    const findings = buildMistakeFindings({
      lowBuyFirstDeaths: { count: 0, attempts: 3, evidence: [] },
      fullBuyFirstDeaths: { count: 3, attempts: 9, evidence: [{ ...evidence, detail: "长枪局首死" }] },
      antiEcoFirstDeaths: { count: 1, attempts: 2, evidence: [] },
      deathTiming: { early: 0, mid: 0, late: 0, total: 0 },
      clutchLosses: { count: 0, evidence: [] },
    }, { id: "self", label: "FalleN" });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      key: "mistake:full-buy-first-death:self",
      origin: "system",
      sample: { numerator: 3, denominator: 9 },
      evidence: [evidence],
    });
    expect(findings[0]?.limitations[0]).toContain("不");
  });

  it("preserves concrete duel and utility evidence with a reason", () => {
    const duel = {
      id: "m1:k1", matchId: "m1", mapName: "de_inferno", roundNumber: 12, tick: 128,
      killerSteamId64: "a", victimSteamId64: "b", killerName: "FalleN", victimName: "ropz", weapon: "ak47",
      classification: "contested_duel", hpBucket: "full_hp", thirdParty: false, fullHealth: true,
      victimHealthBefore: 100, killerHealthBefore: 100, ttkMs: 320, oneShotKill: false,
      evidenceTicks: { engagementStartTick: 64, engagementEndTick: 128, killerFirstShotTick: 100, victimResponseTick: 110, killTick: 128 },
      killerPosition: null, victimPosition: null, roundTimeLabel: "1:20", evidence,
    } satisfies DuelFinderRow;
    const utility = { ...evidence, kind: "he" as const, playerName: "FalleN", victimCount: 2, damage: 86 };

    expect(findingFromDuel(duel).evidence).toEqual([evidence]);
    expect(findingFromUtilityDamage(utility).evidence).toEqual([utility]);
  });

  it("keeps tactical clusters within their observed opening-pattern boundary", () => {
    const cluster = {
      id: "cluster-1", mapName: "de_nuke", side: "t", economyEntry: "gun", teamIdentity: "furia", teamName: "FURIA",
      opponentNames: ["Spirit"], opponentIdentities: ["spirit"], openingIntent: { regionCounts: { a: 2, mid: 1, b: 2, unknown: 0 }, spread: "split" },
      positionGroupCounts: {}, primaryCategory: "均衡控图", openingSignature: "test",
      entryEvidence: { coveredRounds: 3, totalRounds: 4, coveragePercent: 75, routes: [] }, roundCount: 4,
      winRatePercent: 50, plantRatePercent: 50,
      rounds: [{ matchId: "m1", roundNumber: 5, teamKey: "teamA", won: true, economy: "full", planted: true }],
    } satisfies TacticalCluster;
    const finding = findingFromTacticalCluster(cluster);

    expect(finding?.evidence[0]).toMatchObject({ matchId: "m1", roundNumber: 5, role: "example" });
    expect(finding?.limitations[0]).toContain("不识别完整中期战术");
  });
});
