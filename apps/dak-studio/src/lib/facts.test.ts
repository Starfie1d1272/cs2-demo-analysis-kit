import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, TACTICAL_FACT_VERSION } from "@cs2dak/core";
import type { ExecuteBucket } from "@cs2dak/core";
import { buildSeasonCohort, buildSeasonCohortFromRows } from "@cs2dak/cohort";
import {
  buildPlayerMechanicsProfile,
  buildPlayerMechanicsProfileFromRows,
  buildPlayerSeasonInsights,
  buildPlayerWeaponStats,
  buildDuelInsights,
  buildDuelInsightsFromFacts,
  buildTeamComparison,
  buildTeamComparisonFromFacts,
  buildTournamentInsights,
  buildTournamentInsightsFromFacts,
  buildUtilityValueSummary
} from "@cs2dak/presentation";
import { buildPlayerSeasonDetailsFromFacts, buildUtilityValueSummaryFromFacts } from "./facts-projections";
import { DERIVED_CACHE_RECORD_NAMESPACES, FACTS_RECORD_NAMESPACES, createFactsStore } from "./facts-store";
import { extractMatchFacts } from "./extract-match-facts";
import { createIdbAdapter } from "./storage/idb-adapter";

const fixture = (async () => loadDemoPackageFromZip(await readFile(
  fileURLToPath(new URL("../../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url))
)))();
const m1Facts = fixture.then((pkg) => extractMatchFacts(pkg, { matchId: "m1" }));
const m2Facts = fixture.then((pkg) => extractMatchFacts(pkg, { matchId: "m2" }));

function stableNumbers<T>(value: T): T {
  if (typeof value === "number") return Number(value.toFixed(12)) as T;
  if (Array.isArray(value)) return value.map(stableNumbers) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, stableNumbers(entry)])
    ) as T;
  }
  return value;
}

describe("MatchFacts", () => {
  it("keeps cohort/presentation outputs outside the facts namespace", () => {
    expect(FACTS_RECORD_NAMESPACES).toContain("facts:team_awp_rounds");
    expect(FACTS_RECORD_NAMESPACES.some((name) => /player_insights|tournament|team_comparison|duel_facts|opening_trails|utility_value/.test(name))).toBe(false);
    expect(DERIVED_CACHE_RECORD_NAMESPACES.every((name) => name.startsWith("derived:match-v3-map2:"))).toBe(true);
  });

  it("persists the same compact AWP round facts produced by the direct core pipeline", async () => {
    const facts = await m1Facts;
    const store = createFactsStore(createIdbAdapter(), "facts-awp-parity");
    await store.putMatchFacts(facts);
    expect(await store.getTeamAwpRounds({ matchIds: ["m1"] })).toEqual(facts.teamAwpRounds);
  });

  it("projects persisted mechanics facts to the same profile as the existing package path", async () => {
    const pkg = await fixture;
    const matchId = "m1";
    const facts = await m1Facts;
    const store = createFactsStore(createIdbAdapter(), "facts-equivalence");
    await store.putMatchFacts(facts);

    const steamId64 = pkg.players[pkg.playerStats[0]!.playerIndex]!.steamId64;
    const playerKey = `steam:${steamId64}`;
    const projected = await store.getMechanicsRows({
      playerKeys: [playerKey],
      matchIds: [matchId]
    });

    const fromFacts = buildPlayerMechanicsProfileFromRows(
      projected.map((match) => match.rows),
      [steamId64],
      projected.length
    );
    const fromPackages = buildPlayerMechanicsProfile([{ matchId, pkg }], [steamId64]);

    expect(projected).toHaveLength(1);
    expect(fromFacts).toEqual(fromPackages);
  });

  it("projects persisted facts to the same player details as the existing package path", async () => {
    const pkg = await fixture;
    const matchId = "m1";
    const facts = await m1Facts;
    const store = createFactsStore(createIdbAdapter(), "facts-details-equivalence");
    await store.putMatchFacts(facts);

    const steamId64 = pkg.players[pkg.playerStats[0]!.playerIndex]!.steamId64;
    const details = await buildPlayerSeasonDetailsFromFacts(store, {
      steamIds: [steamId64],
      matchIds: [matchId]
    });

    expect(details).toEqual({
      insights: buildPlayerSeasonInsights([{ matchId, pkg }], [steamId64]),
      weaponStats: buildPlayerWeaponStats([{ matchId, pkg }], [steamId64]),
      mechanics: buildPlayerMechanicsProfile([{ matchId, pkg }], [steamId64])
    });
  });

  it("projects persisted cohort rows to the same season cohort as the existing package path", async () => {
    const pkg = await fixture;
    const matchId = "m1";
    const store = createFactsStore(createIdbAdapter(), "facts-cohort-equivalence");
    await store.putMatchFacts(await m1Facts);

    const rows = await store.getCohortRows({ matchIds: [matchId] });

    const fromRows = buildSeasonCohortFromRows(rows, { matchCount: 1 });
    const fromPackages = buildSeasonCohort([{ matchId, pkg }]);

    expect({ ...fromRows, players: [] }).toEqual({ ...fromPackages, players: [] });
    expect(new Map(fromRows.players.map((row) => [row.playerKey, stableNumbers(row)]))).toEqual(
      new Map(fromPackages.players.map((row) => [row.playerKey, stableNumbers(row)]))
    );
  });

  it("projects persisted tournament facts to the same tournament insights as the existing package path", async () => {
    const pkg = await fixture;
    const matchId = "m1";
    const store = createFactsStore(createIdbAdapter(), "facts-tournament-equivalence");
    await store.putMatchFacts(await m1Facts);

    expect(buildTournamentInsightsFromFacts(await store.getTournamentFacts({ matchIds: [matchId] }))).toEqual(
      buildTournamentInsights([{ matchId, pkg }])
    );
  });

  it("projects persisted team comparison facts to the same model as the existing package path", async () => {
    const pkg = await fixture;
    const matchId = "m1";
    const store = createFactsStore(createIdbAdapter(), "facts-team-equivalence");
    await store.putMatchFacts(await m1Facts);

    expect(buildTeamComparisonFromFacts(await store.getTeamComparisonFacts({ matchIds: [matchId] }))).toEqual(
      buildTeamComparison([{ matchId, pkg }])
    );
  });

  it("projects persisted duel facts to the same model as the existing package path", async () => {
    const pkg = await fixture;
    const matchId = "m1";
    const store = createFactsStore(createIdbAdapter(), "facts-duel-equivalence");
    await store.putMatchFacts(await m1Facts);

    expect(buildDuelInsightsFromFacts(await store.getDuelFacts({ matchIds: [matchId] }))).toEqual(
      buildDuelInsights([{ matchId, pkg }])
    );
  });

  it("projects persisted utility value facts without reopening the demo package", async () => {
    const pkg = await fixture;
    const matchId = "m1";
    const store = createFactsStore(createIdbAdapter(), "facts-utility-equivalence");
    await store.putMatchFacts(await m1Facts);
    const players = pkg.players.map((player) => ({
      playerKey: `steam:${player.steamId64}`,
      name: player.name,
      steamIds: [player.steamId64]
    }));

    expect(await buildUtilityValueSummaryFromFacts(store, { matchIds: [matchId], players })).toEqual(
      buildUtilityValueSummary([{ matchId, pkg }], players)
    );
    expect(await store.getUtilityValueFactMatchIds({ matchIds: [matchId] })).toEqual([matchId]);
  });

  it("提取 TacticalRoundFact：每回合每存活 side 一行，字段完整", async () => {
    const facts = await m1Facts;
    expect(facts.tacticalRounds.length).toBeGreaterThan(0);
    const f = facts.tacticalRounds[0]!;
    expect("snapshots" in f).toBe(false);
    expect(f.openingPattern.coarseSignature).toMatch(/^[TC]{1,2}:/);
    expect(f.openingPattern.evidence.every((row) => typeof row.tick === "number")).toBe(true);
    expect(Array.isArray(f.openingPressure)).toBe(true);
    expect(["a", "b", null]).toContain(f.targetSite);
    expect(f.siteEntries.a.entrants).toBeGreaterThanOrEqual(0);
    expect(f.siteEntries.b.entrants).toBeGreaterThanOrEqual(0);
    expect(f.teamName).toBeTruthy();
    expect(f.opponentName).toBeTruthy();
    expect(typeof f.won).toBe("boolean");
    expect(["teamA", "teamB"]).toContain(f.teamKey);
    // 真正下包的回合必有独立 plant 事实与 targetSite；execute 只在第二人真实进点时存在。
    const planted = facts.tacticalRounds.find(
      (r) => r.plant != null
    );
    if (planted) {
      expect(planted.targetSite).not.toBeNull();
      if (planted.executeBucket) {
        expect(["rush", "fast", "mid", "late"] satisfies ExecuteBucket[]).toContain(planted.executeBucket);
      }
    }
  });

  it("提取 C4 轨迹与进点入口（A1/A2）字段", async () => {
    const facts = await m1Facts;
    const t = facts.tacticalRounds.filter((f) => f.side === "t");
    expect(t.length).toBeGreaterThan(0);
    // 版本号写入
    expect(facts.tacticalRounds.every((f) => f.analysisVersion === TACTICAL_FACT_VERSION)).toBe(true);
    expect(facts.tacticalRounds.every((f) => Boolean(f.opponentEconomy))).toBe(true);
    // CT 不算 C4 轨迹
    expect(facts.tacticalRounds.filter((f) => f.side === "ct").every((f) => f.c4Route === null)).toBe(true);
    // 至少有一回合能跟到 C4 携带轨迹
    expect(t.some((f) => f.c4Route && f.c4Route.callouts.length > 0)).toBe(true);
    // 进点 order 带 entryCallout 字段（A1/A2 区分基础）
    const withEntries = facts.tacticalRounds.find((f) => f.siteEntries.a.order.length + f.siteEntries.b.order.length > 0);
    if (withEntries) {
      const order = [...withEntries.siteEntries.a.order, ...withEntries.siteEntries.b.order];
      expect(order.every((o) => "entryCallout" in o && "entryChokeId" in o && "trajectory" in o)).toBe(true);
    }
  });

  it("TacticalRoundFact store 读写：putMatchFacts 后 getTacticalRounds 返回相同数据", async () => {
    const matchId = "m1";
    const facts = await m1Facts;
    const store = createFactsStore(createIdbAdapter(), "facts-tactical-rounds");
    await store.putMatchFacts(facts);
    const rows = await store.getTacticalRounds({ matchIds: [matchId] });
    expect(rows.length).toBe(facts.tacticalRounds.length);
    expect(rows[0]?.openingPattern.coarseSignature).toBeTruthy();
  });

  it("地图位置 facts 以 teamKey 入键，读写后保留位置与队形两层事实", async () => {
    const facts = await m1Facts;
    const store = createFactsStore(createIdbAdapter(), "facts-map-intelligence");
    await store.putMatchFacts(facts);
    const positions = await store.getPlayerPositionRounds({ matchIds: ["m1"] });
    const shapes = await store.getTeamShapeRounds({ matchIds: ["m1"] });

    expect(positions).toHaveLength(facts.playerPositionRounds.length);
    expect(shapes).toHaveLength(facts.teamShapeRounds.length);
    expect(new Set(positions.map((row) => `${row.roundNumber}:${row.teamKey}:${row.playerIndex}`)).size).toBe(positions.length);
    expect(shapes.every((row) => row.windows.every((window) => window.componentPlayerIndices.length > 0))).toBe(true);
  });

  it("workspace 不随导入持久化（单场 ~35MB、整包全量分析的导入大头），改为打开时懒算", async () => {
    const store = createFactsStore(createIdbAdapter(), "facts-no-workspace");
    const facts = await m1Facts;
    expect(facts.matchWorkspace).toEqual([]);
    await store.putMatchFacts(facts);
    // 导入不再写 workspace，直读返回 null；视图改用 loadMatchWorkspaceModel 从 ZIP 懒算。
    expect(await store.getMatchWorkspace("m1")).toBeNull();
  });

  it("replaceRows：删除一场只动该场，另一场完整保留（key 前缀删除，不全量反序列化）", async () => {
    const store = createFactsStore(createIdbAdapter(), "facts-replace-isolation");
    await store.putMatchFacts(await m1Facts);
    await store.putMatchFacts(await m2Facts);

    // 两场并存
    const m2Tactical = (await store.getTacticalRounds({ matchIds: ["m2"] })).length;
    expect(m2Tactical).toBeGreaterThan(0);
    expect((await store.getPlayerMatchStats({ matchIds: ["m1"] })).length).toBeGreaterThan(0);

    // 删除 m1：m1 全部清空，m2 不受影响
    await store.deleteMatchFacts("m1");
    expect((await store.getTacticalRounds({ matchIds: ["m1"] })).length).toBe(0);
    expect((await store.getPlayerMatchStats({ matchIds: ["m1"] })).length).toBe(0);
    expect((await store.getTacticalRounds({ matchIds: ["m2"] })).length).toBe(m2Tactical);
  });

  it("replaceRows：重复 put 同一场幂等，不产生重复行", async () => {
    const store = createFactsStore(createIdbAdapter(), "facts-replace-idempotent");
    const facts = await m1Facts;
    await store.putMatchFacts(facts);
    await store.putMatchFacts(facts);
    expect((await store.getTacticalRounds({ matchIds: ["m1"] })).length).toBe(facts.tacticalRounds.length);
    expect((await store.getPlayerPositionRounds({ matchIds: ["m1"] })).length).toBe(facts.playerPositionRounds.length);
    expect((await store.getTeamShapeRounds({ matchIds: ["m1"] })).length).toBe(facts.teamShapeRounds.length);
  });
});
