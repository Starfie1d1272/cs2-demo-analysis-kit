/**
 * 合同 schema 冒烟测试 — 验证每个文件的 z.parse 可通过，以及关键约束（enum、literal、nullable）生效。
 * 这是拆分后的第一道安全网；测试失败意味着上游 cs2-demo-format 合同或本包结构发生破坏性变更。
 */
import { describe, expect, it } from "vitest";
import {
  // qa
  qaIssueSchema,
  qaReportSchema,
  // scoring
  rrIndicatorsSchema,
  // upstream re-exports
  teamKeySchema,
  sideSchema,
  economyTypeSchema,
  // demo-package
  demoPackageSchema,
  // analysis
  playerRoundFactSchema,
  playerScoreboardRowSchema,
  timelineEventSchema,
  economyPointSchema,
  heatmapPointSchema,
  mapViewSchema,
  analysisProvenanceSchema,
  analysisBundleSchema,
  // cohort
  seasonCohortBundleSchema,
  // workspace
  workspaceTabSchema,
  matchWorkspaceModelSchema,
} from "./index.js";

// ─────────────────────────────────────────────────────────────────────────────
// 复用 fixtures
// ─────────────────────────────────────────────────────────────────────────────

const qaReport = {
  ok: true,
  summary: { issueCount: 0, errorCount: 0, warningCount: 0 },
  issues: [],
};

const minimalIndicators = {
  steamId64: "76561198000000001",
  totalRounds: 21,
  kills: 10, deaths: 8, assists: 2,
  kpr: 0.48, dpr: 0.38, apr: 0.10,
  adr: 72.5, hsPercent: 40, kast: 66.7,
  survivalRate: 0.62,
  twoKillRounds: 3, threeKillRounds: 1, fourKillRounds: 0, fiveKillRounds: 0,
  multiKillRate: 0.19,
  firstKillCount: 2, firstDeathCount: 1,
  firstKillRate: 0.095, firstDeathRate: 0.048,
  openingDuelRate: 0.14, openingDuelWinRate: 0.67,
  tradeKillCount: 1, tradeDeathCount: 2,
  tradeKillRate: 0.048, tradeDeathRate: 0.095,
  clutchAttempts: 3, clutchWins: 1, clutchWinRate: 0.33, clutchFrequency: 0.14,
  clutchScore: 1.2, clutchScoreRate: 0.057,
  vsOne: { count: 2, won: 1 }, vsTwo: { count: 1, won: 0 },
  vsThree: { count: 0, won: 0 }, vsFour: { count: 0, won: 0 }, vsFive: { count: 0, won: 0 },
  awpKills: 2, awpKillsPerRound: 0.095, awpKillRate: 0.2,
  sniperKills: 2, sniperKillRate: 0.2,
  awpMultiKillRate: null, awpDuelWinRate: null,
  utilityDamage: 150, utilityDamagePerRound: 7.1,
  flashAssistCount: 3, flashAssistPerRound: 0.14,
  blindDurationTotal: 8.5, blindDurationPerRound: 0.4,
  enemyFlashDurationSeconds: null, enemyFlashDurationPerRound: null,
  teamFlashDurationSeconds: null, teamFlashDurationPerRound: null,
  grenadeCount: 12, grenadeCountPerRound: 0.57,
  ecoRoundCount: 2, forceRoundCount: 3, fullBuyRoundCount: 14, pistolRoundCount: 2,
  avgEquipmentValue: 3800,
  combatDeathCount: null, bombDeathCount: null,
  wallbangKillCount: null,
  roundSwingTotal: null, roundSwingPerKill: null,
};

const minimalProvenance = {
  analysisVersion: "cs2-demo-analysis-kit/1.0",
  sourceSchemaVersion: "cs2-demo-format/3.0" as const,
  sourceDemoHash: null,
  exporter: { name: "cs2dak", version: "0.2.1" },
  parser: { name: "demoparser2", version: "0.1.0" },
  ratingVersions: { rr: "1.0.0", valueAccounts: "1.0.0" },
};

const minimalScoreboardRow = {
  steamId64: "76561198000000001",
  name: "Player A",
  teamKey: "teamA" as const,
  indicators: minimalIndicators,
  kills: 10, deaths: 8, assists: 2,
  adr: 72.5, kast: 66.7, headshotPercent: 40,
  entryKills: 2, tradeKills: 1, awpKills: 2, utilityDamage: 150,
  combatDeathCount: null, bombDeathCount: null,
  wallbangKillCount: null, noScopeKillCount: null,
  throughSmokeKillCount: null, collateralKillCount: null,
  bombPlantCount: null, bombDefuseCount: null,
  confidence: 0.85,
  fieldAvailability: {
    playerStats: "available" as const,
    economy: "available" as const,
    rounds: "available" as const,
    richKills: "partial" as const,
    damages: "available" as const,
    bombs: "missing" as const,
  },
  ratingSeed: 1.1,
  rr: 1.05, rrPercentile: 55,
  accountRR: 1.1, accountRRRaw: 1.08,
  accountCombatContextFactor: 1.0,
  accountBreakdown: { combat: 0.4, trade: 0.1, mapControl: 0, clutch: 0.05, objective: 0.05, utility: 0.1 },
  accountContextStatus: { buyDelta: "available" as const, manState: "available" as const },
};

const minimalBundle = {
  version: "cs2-demo-analysis-kit/1.0" as const,
  sourceSchemaVersion: "cs2-demo-format/3.0" as const,
  provenance: minimalProvenance,
  mapName: "de_ancient",
  tickrate: 64,
  teams: {
    teamA: { name: "Team A", score: 13 },
    teamB: { name: "Team B", score: 8 },
  },
  scoreboard: [],
  playerWeaponHighlights: [],
  playerIndicators: [],
  playerRoundFacts: [],
  timeline: [],
  economy: [],
  heatmap: [],
  qa: qaReport,
};

const minimalWorkspaceModel = {
  version: "cs2-demo-analysis-kit/workspace-0.1" as const,
  sourceSchemaVersion: "cs2-demo-format/3.0" as const,
  title: "Team A vs Team B",
  subtitle: "de_ancient · 10 名选手 · 21 回合",
  scoreline: "13:8",
  mapName: "de_ancient",
  teams: { teamA: { name: "Team A", score: 13 }, teamB: { name: "Team B", score: 8 } },
  tabs: [{ key: "overview" as const, label: "总览" }],
  overview: { kpis: [], story: [] },
  scoreboard: [],
  rounds: [],
  players: [],
  economy: [],
  weapons: [],
  duels: { players: [], matrix: [], openings: [] },
  map: {
    view: { name: "de_ancient", radarImageUrl: null, calibrated: false },
    modes: [],
    points: [],
    status: { hasRadar: false, hasPositionData: false, message: null },
  },
  replay: {
    available: false,
    sampleRate: null,
    tickrate: null,
    rounds: [],
    capabilities: { hasDefuseKit: false },
  },
  adminQa: qaReport,
};

// ─────────────────────────────────────────────────────────────────────────────
// qa.ts
// ─────────────────────────────────────────────────────────────────────────────

describe("qa schemas", () => {
  it("qaIssueSchema parses valid issue", () => {
    expect(() =>
      qaIssueSchema.parse({ severity: "warning", code: "MISSING_ECONOMY", message: "Economy data missing" })
    ).not.toThrow();
  });

  it("qaIssueSchema rejects invalid severity", () => {
    expect(qaIssueSchema.safeParse({ severity: "critical", code: "X", message: "Y" }).success).toBe(false);
  });

  it("qaIssueSchema rejects empty code or message", () => {
    expect(qaIssueSchema.safeParse({ severity: "error", code: "", message: "Y" }).success).toBe(false);
    expect(qaIssueSchema.safeParse({ severity: "error", code: "X", message: "" }).success).toBe(false);
  });

  it("qaReportSchema parses valid report", () => {
    expect(() => qaReportSchema.parse(qaReport)).not.toThrow();
  });

  it("qaReportSchema rejects negative counts", () => {
    expect(
      qaReportSchema.safeParse({ ok: true, summary: { issueCount: -1, errorCount: 0, warningCount: 0 }, issues: [] }).success
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// upstream.ts — re-exports from cs2-demo-format
// ─────────────────────────────────────────────────────────────────────────────

describe("upstream re-exports", () => {
  it("teamKeySchema accepts teamA / teamB only", () => {
    expect(teamKeySchema.parse("teamA")).toBe("teamA");
    expect(teamKeySchema.parse("teamB")).toBe("teamB");
    expect(teamKeySchema.safeParse("teamC").success).toBe(false);
    expect(teamKeySchema.safeParse("").success).toBe(false);
  });

  it("sideSchema accepts ct / t only", () => {
    expect(sideSchema.parse("ct")).toBe("ct");
    expect(sideSchema.parse("t")).toBe("t");
    expect(sideSchema.safeParse("CT").success).toBe(false);
  });

  it("economyTypeSchema accepts known economy types", () => {
    for (const val of ["pistol", "eco", "semi", "force", "full"]) {
      expect(() => economyTypeSchema.parse(val)).not.toThrow();
    }
    expect(economyTypeSchema.safeParse("full-buy").success).toBe(false);
    expect(economyTypeSchema.safeParse("rich").success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoring.ts — rrIndicatorsSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("rrIndicatorsSchema", () => {
  it("parses a complete valid indicators object", () => {
    expect(() => rrIndicatorsSchema.parse(minimalIndicators)).not.toThrow();
  });

  it("accepts null for nullable rate fields", () => {
    const result = rrIndicatorsSchema.parse(minimalIndicators);
    expect(result.awpMultiKillRate).toBeNull();
    expect(result.awpDuelWinRate).toBeNull();
    expect(result.enemyFlashDurationSeconds).toBeNull();
    expect(result.roundSwingTotal).toBeNull();
  });

  it("rejects negative nonnegative counts", () => {
    expect(rrIndicatorsSchema.safeParse({ ...minimalIndicators, kills: -1 }).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// demo-package.ts — demoPackageSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("demoPackageSchema", () => {
  it("applies defaults for optional array fields", () => {
    const pkg = demoPackageSchema.parse({
      manifest: {
        schemaVersion: "cs2-demo-format/3.0",
        exporter: { name: "cs2dak", version: "0.2.1" },
        parser: { name: "demoparser2", version: "0.1.0" },
        demo: { hash: null, sourceFileName: null },
        mapName: "de_ancient",
        tickrate: 64,
        exportedAt: "2024-01-01T00:00:00Z",
        files: {
          match: "match.json",
          players: "players.json",
          rounds: "rounds.json",
          playerStats: "player_stats.json",
          playerEconomies: "player_economies.json",
          kills: "kills.json",
          damages: "damages.json",
          blinds: "blinds.json",
          bombs: "bombs.json",
          grenades: "grenades.json",
          clutches: "clutches.json",
        },
      },
      match: {
        mapName: "de_ancient",
        tickrate: 64,
        durationSeconds: 1800,
        serverName: null,
        source: "valve",
        teamA: { teamKey: "teamA", name: "Team A", score: 13 },
        teamB: { teamKey: "teamB", name: "Team B", score: 8 },
      },
      players: [],
      rounds: [],
    });
    expect(pkg.playerEconomies).toEqual([]);
    expect(pkg.playerStats).toEqual([]);
    expect(pkg.kills).toEqual([]);
    expect(pkg.damages).toEqual([]);
    expect(pkg.blinds).toEqual([]);
    expect(pkg.bombs).toEqual([]);
    expect(pkg.grenades).toEqual([]);
    expect(pkg.clutches).toEqual([]);
    expect(pkg.shots).toBeUndefined();
    expect(pkg.replay).toBeUndefined();
    expect(pkg.duels).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// analysis.ts
// ─────────────────────────────────────────────────────────────────────────────

describe("playerRoundFactSchema", () => {
  const fact = {
    roundNumber: 1,
    steamId64: "76561198000000001",
    name: "Player A",
    teamKey: "teamA",
    side: "ct",
    survived: true,
    kills: 2, deaths: 0, assists: 1,
    damage: 180, utilityDamage: 20,
    flashAssists: 1, tradeKills: 0, tradedDeaths: 0,
    openingDuel: "won",
    kastTags: ["kill", "survive"],
    equipmentValue: 5400,
    economyType: "full",
  };

  it("parses valid round fact", () => {
    expect(() => playerRoundFactSchema.parse(fact)).not.toThrow();
  });

  it("accepts null for nullable fields", () => {
    const result = playerRoundFactSchema.parse({ ...fact, equipmentValue: null, economyType: null });
    expect(result.equipmentValue).toBeNull();
    expect(result.economyType).toBeNull();
  });

  it("rejects zero or negative roundNumber", () => {
    expect(playerRoundFactSchema.safeParse({ ...fact, roundNumber: 0 }).success).toBe(false);
  });

  it("rejects invalid openingDuel value", () => {
    expect(playerRoundFactSchema.safeParse({ ...fact, openingDuel: "draw" }).success).toBe(false);
  });

  it("rejects invalid kastTag", () => {
    expect(playerRoundFactSchema.safeParse({ ...fact, kastTags: ["kill", "bomb"] }).success).toBe(false);
  });
});

describe("timelineEventSchema", () => {
  const event = {
    id: "ev-1",
    roundNumber: 1,
    tick: 1000,
    timeSeconds: 15.5,
    clockPhase: "round",
    clockSeconds: 15.5,
    clockLabel: "0:45",
    type: "kill",
    label: "Player A killed Player B",
    teamKey: "teamA",
  };

  it("parses valid timeline event", () => {
    expect(() => timelineEventSchema.parse(event)).not.toThrow();
  });

  it("accepts null teamKey", () => {
    expect(timelineEventSchema.parse({ ...event, teamKey: null }).teamKey).toBeNull();
  });

  it("rejects invalid clockPhase", () => {
    expect(timelineEventSchema.safeParse({ ...event, clockPhase: "overtime" }).success).toBe(false);
  });

  it("rejects invalid event type", () => {
    expect(timelineEventSchema.safeParse({ ...event, type: "defuse" }).success).toBe(false);
  });
});

describe("economyPointSchema", () => {
  it("parses valid economy point", () => {
    expect(() =>
      economyPointSchema.parse({
        roundNumber: 5,
        teamA: 4200, teamB: 1800,
        advantage: 2400,
        teamAEconomy: "full",
        teamBEconomy: "eco",
        winnerTeamKey: "teamA",
      })
    ).not.toThrow();
  });
});

describe("heatmapPointSchema", () => {
  it("parses valid kill heatmap point", () => {
    expect(() =>
      heatmapPointSchema.parse({
        x: 100, y: 200, z: 50,
        roundNumber: 3,
        teamKey: "teamA",
        steamId64: "76561198000000001",
        side: "ct",
        kind: "kill",
        grenadeType: null,
      })
    ).not.toThrow();
  });

  it("accepts null for optional context fields", () => {
    const result = heatmapPointSchema.parse({
      x: 0, y: 0, z: 0,
      roundNumber: 1,
      teamKey: null, steamId64: null, side: null,
      kind: "grenade",
      grenadeType: "smoke",
    });
    expect(result.teamKey).toBeNull();
    expect(result.steamId64).toBeNull();
  });

  it("rejects invalid kind", () => {
    expect(
      heatmapPointSchema.safeParse({
        x: 0, y: 0, z: 0, roundNumber: 1,
        teamKey: null, steamId64: null, side: null,
        kind: "bomb", grenadeType: null,
      }).success
    ).toBe(false);
  });
});

describe("mapViewSchema", () => {
  it("parses with null radarImageUrl", () => {
    const result = mapViewSchema.parse({ name: "de_ancient", radarImageUrl: null, calibrated: false });
    expect(result.radarImageUrl).toBeNull();
  });
});

describe("analysisProvenanceSchema", () => {
  it("enforces sourceSchemaVersion literal", () => {
    expect(() => analysisProvenanceSchema.parse(minimalProvenance)).not.toThrow();
    expect(
      analysisProvenanceSchema.safeParse({ ...minimalProvenance, sourceSchemaVersion: "cs2-demo-format/1.0" }).success
    ).toBe(false);
  });
});

describe("analysisBundleSchema", () => {
  it("parses a minimal empty bundle", () => {
    expect(() => analysisBundleSchema.parse(minimalBundle)).not.toThrow();
  });

  it("enforces version literal", () => {
    expect(
      analysisBundleSchema.safeParse({ ...minimalBundle, version: "cs2-demo-analysis-kit/2.0" }).success
    ).toBe(false);
  });

  it("enforces sourceSchemaVersion literal", () => {
    expect(
      analysisBundleSchema.safeParse({ ...minimalBundle, sourceSchemaVersion: "cs2-demo-format/1.0" }).success
    ).toBe(false);
  });
});

describe("playerScoreboardRowSchema", () => {
  it("parses valid scoreboard row", () => {
    expect(() => playerScoreboardRowSchema.parse(minimalScoreboardRow)).not.toThrow();
  });

  it("accepts null for optional stat fields", () => {
    const result = playerScoreboardRowSchema.parse(minimalScoreboardRow);
    expect(result.combatDeathCount).toBeNull();
    expect(result.bombDeathCount).toBeNull();
  });

  it("rejects confidence outside [0,1]", () => {
    expect(playerScoreboardRowSchema.safeParse({ ...minimalScoreboardRow, confidence: 1.1 }).success).toBe(false);
    expect(playerScoreboardRowSchema.safeParse({ ...minimalScoreboardRow, confidence: -0.1 }).success).toBe(false);
  });

  it("rejects invalid fieldAvailability richKills value", () => {
    expect(
      playerScoreboardRowSchema.safeParse({
        ...minimalScoreboardRow,
        fieldAvailability: { ...minimalScoreboardRow.fieldAvailability, richKills: "unknown" },
      }).success
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cohort.ts
// ─────────────────────────────────────────────────────────────────────────────

describe("seasonCohortBundleSchema", () => {
  const bundle = {
    version: "cs2-demo-analysis-kit/cohort-1.0" as const,
    matchCount: 3,
    players: [],
    weightsVersion: "rr-six-accounts-1.0",
    provenance: {
      cohortVersion: "cs2-demo-analysis-kit/cohort-1.0" as const,
      sourceSchemaVersion: "cs2-demo-format/3.0" as const,
      matches: [{ matchId: "abc123", sourceDemoHash: null }],
    },
  };

  it("parses a valid cohort bundle", () => {
    expect(() => seasonCohortBundleSchema.parse(bundle)).not.toThrow();
  });

  it("enforces cohort version literal", () => {
    expect(
      seasonCohortBundleSchema.safeParse({ ...bundle, version: "cs2-demo-analysis-kit/cohort-2.0" }).success
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// workspace.ts
// ─────────────────────────────────────────────────────────────────────────────

describe("workspaceTabSchema", () => {
  it("accepts all valid tab keys", () => {
    for (const key of ["overview", "rounds", "players", "economy", "map", "replay"] as const) {
      expect(() => workspaceTabSchema.parse({ key, label: "Label" })).not.toThrow();
    }
  });

  it("rejects unknown tab key", () => {
    expect(workspaceTabSchema.safeParse({ key: "stats", label: "Stats" }).success).toBe(false);
  });
});

describe("matchWorkspaceModelSchema", () => {
  it("parses a minimal workspace model", () => {
    expect(() => matchWorkspaceModelSchema.parse(minimalWorkspaceModel)).not.toThrow();
  });

  it("enforces workspace version literal", () => {
    expect(
      matchWorkspaceModelSchema.safeParse({ ...minimalWorkspaceModel, version: "cs2-demo-analysis-kit/workspace-1.0" }).success
    ).toBe(false);
  });

  it("enforces sourceSchemaVersion literal", () => {
    expect(
      matchWorkspaceModelSchema.safeParse({ ...minimalWorkspaceModel, sourceSchemaVersion: "cs2-demo-format/2.0" }).success
    ).toBe(false);
  });

  it("replay nullable fields accept null when unavailable", () => {
    const result = matchWorkspaceModelSchema.parse(minimalWorkspaceModel);
    expect(result.replay.sampleRate).toBeNull();
    expect(result.replay.tickrate).toBeNull();
  });

  it("map status message accepts null", () => {
    const result = matchWorkspaceModelSchema.parse(minimalWorkspaceModel);
    expect(result.map.status.message).toBeNull();
  });
});
