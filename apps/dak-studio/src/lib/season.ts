import {
  buildPlayerMapRoleEvidence,
  buildSeasonCohortFromRows,
  buildTeamMapResponsibilityEvidence,
  type PlayerIdentityMap,
} from "@cs2dak/cohort";
import {
  buildAllPlayerSeasonProfiles,
  buildPlayerMapRoleProfiles,
  buildTeamMapRoleMatrices,
  buildDuelInsightsFromFacts,
  buildSeasonLeaderboardModel,
  buildTournamentInsightsFromFacts,
  buildTeamComparisonFromFacts,
  buildTeamOverviewFromFacts,
  type PlayerFlashSummary,
  type PlayerSeasonInsights,
  type PlayerMechanicsProfile,
  type PlayerWeaponStat,
  type UtilityValueSummary,
  type TournamentInsights,
  type TeamComparisonModel,
  type TeamOverviewModel,
  type DuelInsightsFacts
} from "@cs2dak/presentation";
import { touchLimitedCache } from "./idb";
import {
  buildPlayerFlashSummariesFromFacts,
  buildPlayerSeasonDetailsFromFacts,
  buildUtilityValueSummaryFromFacts,
} from "./facts-projections";
import { getFactsStore } from "./facts-store";
import { getStorage } from "./storage";
import { FACTS_REVISION } from "./analysis-manifest";
import type {
  DuelInsightsModel,
  PlayerSeasonProfile,
  SeasonCohortBundle,
  SeasonLeaderboardModel,
  PlayerMapRoleEvidence,
  PlayerMapRoleProfile,
  RoleDeclaration,
  TeamMapResponsibilityEvidence,
} from "@cs2dak/contract";
import { matchIdForEntry, type StudioDemoEntry } from "./library";
import { displayTeamName, originalTeamNamesForDisplay } from "./identity";

export interface IdentityOptions {
  /** 与 IdentityStoreState.version 一致；0 表示无自定义映射。 */
  version: number;
  map: PlayerIdentityMap;
  /** 队伍原名 → 显示名；聚合时替换 pkg.match.teamA/B.name，同名队伍自动合并。 */
  teamRenames?: Record<string, string>;
}

/**
 * 跨场聚合缓存，两层：
 * - 内存：同一会话内 id 集合不变时复用。
 * - IndexedDB：派生产物（bundle/排行榜/档案/赛事 insights）持久化，
 *   重开应用时无需重新解压解析全部 ZIP——这是赛事中台首屏慢的主因。
 * 聚合入口只读本地持久化 facts；缺 facts 时要求显式回填/重新导入，不在视图请求里现场解 ZIP。
 */

/** 聚合算法/口径变化时 +1，旧缓存自动失效重算。 */
export const CACHE_VERSION = 10;

export interface SeasonSummary {
  bundle: SeasonCohortBundle;
  leaderboard: SeasonLeaderboardModel;
  profiles: PlayerSeasonProfile[];
  insights: TournamentInsights | null;
}

export function seasonCacheKey(
  entries: StudioDemoEntry[],
  identityVersion?: number,
  selectedTeams: string[] = [],
  factsRevision = FACTS_REVISION,
): string {
  const factsPart = `:facts=${factsRevision}`;
  const idPart = identityVersion ? `:idv${identityVersion}` : "";
  const teamPart = selectedTeams.length > 0 ? `:teams=${[...selectedTeams].sort().join(",")}` : "";
  return `v${CACHE_VERSION}${factsPart}${idPart}${teamPart}:` + entries.map((entry) => entry.id).sort().join("|");
}

const keyOf = seasonCacheKey;

function selectedOriginalTeams(selectedTeams: string[], renames?: Record<string, string>): Set<string> {
  return new Set(selectedTeams.flatMap((team) => originalTeamNamesForDisplay(team, renames ?? {})));
}

function allowedTeamKeysByMatch(
  entries: StudioDemoEntry[],
  selectedTeams: string[],
  renames?: Record<string, string>,
): Map<string, Set<"teamA" | "teamB">> | null {
  if (selectedTeams.length === 0) return null;
  const selected = selectedOriginalTeams(selectedTeams, renames);
  return new Map(entries.map((entry) => {
    const keys = new Set<"teamA" | "teamB">();
    if (selected.has(entry.meta.teamAName)) keys.add("teamA");
    if (selected.has(entry.meta.teamBName)) keys.add("teamB");
    return [matchIdForEntry(entry), keys];
  }));
}

export function filterDuelFactsByTeam(
  facts: DuelInsightsFacts[],
  selectedTeams: string[],
  renames?: Record<string, string>,
): DuelInsightsFacts[] {
  if (selectedTeams.length === 0) return facts;
  const selected = selectedOriginalTeams(selectedTeams, renames);
  return facts.map((fact) => {
    const selectedSteamIds = new Set(Object.entries(fact.teamNamesBySteamId)
      .filter(([, teamName]) => selected.has(teamName))
      .map(([steamId]) => steamId));
    const involvedInDuel = (row: { killerSteamId64: string; victimSteamId64: string }) =>
      selectedSteamIds.has(row.killerSteamId64) || selectedSteamIds.has(row.victimSteamId64);
    return {
      ...fact,
      duelRows: fact.duelRows.filter(involvedInDuel),
      openingRows: fact.openingRows.filter(involvedInDuel),
      mechanicsRows: fact.mechanicsRows.filter((row) => selectedSteamIds.has(row.steamId64)),
      teamNamesBySteamId: Object.fromEntries(Object.entries(fact.teamNamesBySteamId).filter(([steamId]) => selectedSteamIds.has(steamId))),
    };
  });
}

/**
 * 队伍透镜（match 级）：按队伍过滤 TournamentInsights 的各队伍数组。
 * insights 由已 `withTeamRenames` 的 facts 构建，teamName 是显示名，
 * 故直接按 selectedTeams（显示名）匹配，不走 originalTeamNamesForDisplay。
 */
function filterTournamentInsightsByTeam(insights: TournamentInsights, selectedTeams: string[]): TournamentInsights {
  if (selectedTeams.length === 0) return insights;
  const selected = new Set(selectedTeams);
  const byTeam = <T extends { teamName: string }>(rows: T[]) => rows.filter((row) => selected.has(row.teamName));
  return {
    ...insights,
    teamPistols: byTeam(insights.teamPistols),
    ecoUpsets: byTeam(insights.ecoUpsets),
    teamManAdvantageConversions: byTeam(insights.teamManAdvantageConversions),
    teamEconomySummaries: byTeam(insights.teamEconomySummaries),
  };
}

// ── 持久层：StorageAdapter 的 "cache" 命名空间。touchedAt 拆到伴随命名空间
//    "cache-meta"，命中只刷新轻量时间戳，不重写数 MB 的 summary 本体；prune 也只读它。 ──
const cacheStore = getStorage().records("cache");
const cacheMeta = getStorage().records("cache-meta");

/** 按 key 多条缓存（不同 scope 互不覆盖），LRU 清理只保留最近 MAX_CACHE_KEYS 条。 */
const MAX_CACHE_KEYS = 12;

interface MetaRecord {
  touchedAt: number;
}

interface PersistedValue<T> {
  key: string;
  touchedAt: number;
  value: T;
}

/** 只刷新 LRU 时间戳（轻量命名空间），不重写 summary 本体。 */
async function touchMeta(key: string): Promise<void> {
  try {
    await cacheMeta.put<MetaRecord>(key, { touchedAt: Date.now() });
  } catch { /* 忽略 */ }
}

async function readPersistedValue<T>(key: string): Promise<T | undefined> {
  try {
    const record = await cacheStore.get<PersistedValue<T>>(key);
    if (record) {
      await touchMeta(key);
      return record.value;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function writePersistedValue<T>(key: string, value: T): Promise<void> {
  try {
    await cacheStore.put<PersistedValue<T>>(key, { key, touchedAt: Date.now(), value });
    await touchMeta(key);
    void prunePersisted();
  } catch {
    // 写失败不影响功能
  }
}

/** 清理：旧版本 key（前缀不符）直接删，其余按 touchedAt 保留最近 MAX_CACHE_KEYS 条。
 *  只读 cache 的 key 列表与轻量 meta 命名空间，不反序列化任何 summary 本体。 */
async function prunePersisted(): Promise<void> {
  try {
    const keys = await cacheStore.keys();
    const metaEntries = await cacheMeta.entries<MetaRecord>();
    const touchedByKey = new Map<string, number>(metaEntries.map(([k, v]) => [k, v?.touchedAt ?? 0]));
    const prefix = `v${CACHE_VERSION}:`;
    const stale = keys.filter((k) => !k.startsWith(prefix));
    const staleSet = new Set(stale);
    const live = keys
      .filter((k) => !staleSet.has(k))
      .sort((a, b) => (touchedByKey.get(b) ?? 0) - (touchedByKey.get(a) ?? 0));
    const toDelete = [...stale, ...live.slice(MAX_CACHE_KEYS)];
    for (const k of toDelete) {
      await cacheStore.delete(k);
      await cacheMeta.delete(k);
    }
  } catch {
    // 清理失败不影响功能
  }
}

function missingFactsError(scope: string): Error {
  return new Error(`${scope} 缺少本地持久化 facts，请重新导入或执行 facts 回填后再打开。`);
}

/**
 * 把 facts 里的原始队名按 teamRenames 重映射后再交给 builder 聚合。
 * facts 在导入时以原始队名落库，聚合按 `teams[teamKey]` 字符串做 key——
 * 不在此重放改名，同名队伍就不会合并（队伍明细矩阵/对比表会显示未合并的原名）。
 * cache key 已并入 identity.version（改名 +1），无需额外失效处理。
 */
export function withTeamRenames<T extends { teams: Record<string, string> }>(
  facts: T[],
  renames?: Record<string, string>
): T[] {
  if (!renames || Object.keys(renames).length === 0) return facts;
  return facts.map((f) => ({
    ...f,
    teams: Object.fromEntries(Object.entries(f.teams).map(([k, v]) => [k, renames[v] ?? v]))
  }));
}

export interface PlayerSeasonDetails {
  insights: PlayerSeasonInsights;
  weaponStats: PlayerWeaponStat[];
  mechanics: PlayerMechanicsProfile;
}

const DETAILS_CACHE_LIMIT = 6;
const SMALL_CACHE_LIMIT = 3;
const detailsCache = new Map<string, Promise<PlayerSeasonDetails>>();
const flashCache = new Map<string, Promise<PlayerFlashSummary[]>>();
const utilityValueCache = new Map<string, Promise<UtilityValueSummary>>();
const duelInsightsCache = new Map<string, Promise<DuelInsightsModel>>();
const teamComparisonCache = new Map<string, Promise<TeamComparisonModel>>();
const teamOverviewCache = new Map<string, Promise<TeamOverviewModel | null>>();
const mapRoleEvidenceCache = new Map<string, Promise<MapRoleEvidenceSummary>>();

/** Persistable, declaration-independent role evidence. Declarations are intentionally merged only at presentation call time. */
export interface MapRoleEvidenceSummary {
  playerEvidence: PlayerMapRoleEvidence[];
  teamEvidence: TeamMapResponsibilityEvidence[];
}

function roleTeamIdentityMap(entries: StudioDemoEntry[], identity?: IdentityOptions): Record<string, string> {
  return Object.fromEntries(entries.flatMap((entry) => {
    const matchId = matchIdForEntry(entry);
    return [
      [`${matchId}:teamA`, displayTeamName(entry.meta.teamAName, identity?.teamRenames)],
      [`${matchId}:teamB`, displayTeamName(entry.meta.teamBName, identity?.teamRenames)],
    ];
  }));
}

export function getMapRoleEvidence(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<MapRoleEvidenceSummary> {
  const teamIdentityMap = roleTeamIdentityMap(entries, identity);
  const teamMappingKey = Object.entries(teamIdentityMap).sort(([a], [b]) => a.localeCompare(b)).map(([raw, canonical]) => `${raw}=${canonical}`).join("|");
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:map-role-evidence:v1:team-map=${teamMappingKey}`;
  const cached = mapRoleEvidenceCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<MapRoleEvidenceSummary>(key);
    if (persisted) return persisted;
    const factsStore = getFactsStore();
    const matchIds = entries.map(matchIdForEntry);
    const [playerPositionRounds, teamShapeRounds] = await Promise.all([
      factsStore.getPlayerPositionRounds({ matchIds }),
      factsStore.getTeamShapeRounds({ matchIds }),
    ]);
    if (playerPositionRounds.length === 0 && teamShapeRounds.length === 0) throw missingFactsError("地图职责证据");
    const options = { identityMap: identity?.map, teamIdentityMap };
    const playerEvidence = buildPlayerMapRoleEvidence({ playerPositionRounds, teamShapeRounds }, options)
      .filter((row) => selectedTeams.length === 0 || selectedTeams.includes(row.teamKey));
    const teamEvidence = buildTeamMapResponsibilityEvidence({ playerPositionRounds, teamShapeRounds }, options)
      .filter((row) => selectedTeams.length === 0 || selectedTeams.includes(row.teamKey));
    const summary = { playerEvidence, teamEvidence };
    void writePersistedValue(key, summary);
    return summary;
  })();
  return touchLimitedCache(mapRoleEvidenceCache, key, loading, SMALL_CACHE_LIMIT);
}

/** Declarations are input only: they never enter persisted evidence/cache keys and never overwrite automatic inference. */
export async function getPlayerMapRoleProfiles(
  entries: StudioDemoEntry[],
  declarations: RoleDeclaration[] = [],
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<PlayerMapRoleProfile[]> {
  const evidence = await getMapRoleEvidence(entries, identity, selectedTeams);
  return buildPlayerMapRoleProfiles(evidence.playerEvidence, declarations);
}

/** 选中选手的逐场洞察：只返回小结果，不把全量 DemoPackage 长期放进 React state。 */
export function getPlayerSeasonDetails(entries: StudioDemoEntry[], steamIds: string[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<PlayerSeasonDetails> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:player:v2:${[...steamIds].sort().join(",")}`;
  const cached = detailsCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<PlayerSeasonDetails>(key);
    if (persisted) return persisted;
    const factsStore = getFactsStore();
    const factsScope = { matchIds: entries.map(matchIdForEntry), steamIds };
    const factRows = await factsStore.getPlayerInsights(factsScope);
    const mechanicRows = await factsStore.getMechanicsRows(factsScope);
    if (factRows.length > 0 || mechanicRows.length > 0) {
      const details = await buildPlayerSeasonDetailsFromFacts(factsStore, factsScope);
      void writePersistedValue(key, details);
      return details;
    }
    throw missingFactsError("选手详情");
  })();
  return touchLimitedCache(detailsCache, key, loading, DETAILS_CACHE_LIMIT);
}

/** 对枪实验室：DuelInsights 是 LOS-heavy 派生模型，持久化后反复切页不再重跑 tri 判定。 */
const DUEL_CACHE_VER = 3;
export function getDuelInsights(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<DuelInsightsModel> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:duels:v${DUEL_CACHE_VER}`;
  const cached = duelInsightsCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<DuelInsightsModel>(key);
    if (persisted) return persisted;
    const factsStore = getFactsStore();
    const matchIds = entries.map(matchIdForEntry);
    const duelFacts = filterDuelFactsByTeam(await factsStore.getDuelFacts({ matchIds }), selectedTeams, identity?.teamRenames);
    if (duelFacts.length >= entries.length) {
      const model = buildDuelInsightsFromFacts(duelFacts);
      void writePersistedValue(key, model);
      return model;
    }
    throw missingFactsError("对枪实验室");
  })();
  return touchLimitedCache(duelInsightsCache, key, loading, SMALL_CACHE_LIMIT);
}

/** 道具页多人 Flash Value：单次扫描所有 demo，避免每个选手重复扫全量 events。 */
export function getPlayerFlashSummaries(
  entries: StudioDemoEntry[],
  players: Array<{ playerKey: string; name: string; steamIds: string[] }>,
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<PlayerFlashSummary[]> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:flash:v2:${players.map((p) => `${p.playerKey}=${p.steamIds.join(",")}`).sort().join("|")}`;
  const cached = flashCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<PlayerFlashSummary[]>(key);
    if (persisted) return persisted;
    const factsStore = getFactsStore();
    const matchIds = entries.map(matchIdForEntry);
    const factRows = await factsStore.getPlayerInsights({ matchIds });
    if (factRows.length > 0) {
      const summaries = await buildPlayerFlashSummariesFromFacts(factsStore, { matchIds, players });
      void writePersistedValue(key, summaries);
      return summaries;
    }
    throw missingFactsError("Flash Value");
  })();
  return touchLimitedCache(flashCache, key, loading, SMALL_CACHE_LIMIT);
}

export function getUtilityValueSummary(
  entries: StudioDemoEntry[],
  players: Array<{ playerKey: string; name: string; steamIds: string[] }>,
  identity?: IdentityOptions,
  selectedTeams: string[] = [],
): Promise<UtilityValueSummary> {
  const playerKey = players.map((p) => `${p.playerKey}=${p.steamIds.join(",")}`).sort().join("|");
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:utility-value:v2:${playerKey}`;
  const cached = utilityValueCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<UtilityValueSummary>(key);
    if (persisted) return persisted;
    const factsStore = getFactsStore();
    const matchIds = entries.map(matchIdForEntry);
    const facts = await factsStore.getUtilityValueFacts({ matchIds });
    if (facts.length >= entries.length) {
      const summary = await buildUtilityValueSummaryFromFacts(factsStore, {
        matchIds,
        players,
        teamRenames: identity?.teamRenames,
        selectedTeams
      });
      void writePersistedValue(key, summary);
      return summary;
    }
    throw missingFactsError("道具价值");
  })();
  return touchLimitedCache(utilityValueCache, key, loading, SMALL_CACHE_LIMIT);
}

const tournamentInsightsCache = new Map<string, Promise<TournamentInsights | null>>();

/** 赛事/经济页面只需要 TournamentInsights，不必冷启动时构建 cohort + profiles + RR/PRISM。 */
export function getTournamentInsights(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<TournamentInsights | null> {
  const key = `${keyOf(entries, identity?.version, selectedTeams)}:tournament`;
  const cached = tournamentInsightsCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<TournamentInsights | null>(key);
    if (persisted !== undefined) return persisted;
    const factsStore = getFactsStore();
    const matchIds = entries.map(matchIdForEntry);
    const facts = withTeamRenames(await factsStore.getTournamentFacts({ matchIds }), identity?.teamRenames);
    if (facts.length >= entries.length) {
      const built = facts.length > 0 ? buildTournamentInsightsFromFacts(facts) : null;
      const insights = built ? filterTournamentInsightsByTeam(built, selectedTeams) : null;
      void writePersistedValue(key, insights);
      return insights;
    }
    throw missingFactsError("赛事洞察");
  })();
  return touchLimitedCache(tournamentInsightsCache, key, loading, SMALL_CACHE_LIMIT);
}

/**
 * 队伍对比（赛前侦察）：两队各自跨全部己方比赛聚合，无需互相交手。
 * `pair` 指定要对比的 A/B 两队名（UI 选择）；缺省取场次最多的两队。
 * 返回的 model.availableTeams 供 UI 填充选队下拉。
 */
export async function getTeamComparison(entries: StudioDemoEntry[], identity?: IdentityOptions, pair?: [string, string]): Promise<TeamComparisonModel> {
  const key = `${keyOf(entries, identity?.version)}:team-comparison-v2:${pair ? `${pair[0]}__vs__${pair[1]}` : "auto"}`;
  const cached = teamComparisonCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<TeamComparisonModel>(key);
    if (persisted) return persisted;
    const factsStore = getFactsStore();
    const matchIds = entries.map(matchIdForEntry);
    const facts = withTeamRenames(await factsStore.getTeamComparisonFacts({ matchIds }), identity?.teamRenames);
    if (facts.length >= entries.length) {
      const model = buildTeamComparisonFromFacts(facts, pair);
      void writePersistedValue(key, model);
      return model;
    }
    throw missingFactsError("队伍对比");
  })();
  return touchLimitedCache(teamComparisonCache, key, loading, SMALL_CACHE_LIMIT);
}

/** 队伍对象页：从可重建 comparison facts 编排摘要，不在页面层重新解析 ZIP。 */
export async function getTeamOverview(entries: StudioDemoEntry[], teamName: string, identity?: IdentityOptions): Promise<TeamOverviewModel | null> {
  const key = `${keyOf(entries, identity?.version)}:team-overview-v2:${teamName}`;
  const cached = teamOverviewCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<TeamOverviewModel | null>(key);
    if (persisted !== undefined) return persisted;
    const factsStore = getFactsStore();
    const matchIds = entries.map(matchIdForEntry);
    const facts = withTeamRenames(await factsStore.getTeamComparisonFacts({ matchIds }), identity?.teamRenames);
    if (facts.length < entries.length) throw missingFactsError("队伍总览");
    const roleEvidence = await getMapRoleEvidence(entries, identity);
    const matrices = buildTeamMapRoleMatrices(roleEvidence.teamEvidence, buildPlayerMapRoleProfiles(roleEvidence.playerEvidence));
    const overview = buildTeamOverviewFromFacts(facts, teamName, matrices);
    void writePersistedValue(key, overview);
    return overview;
  })();
  return touchLimitedCache(teamOverviewCache, key, loading, SMALL_CACHE_LIMIT);
}

const seasonSummaryCache = new Map<string, Promise<SeasonSummary>>();

/** 聚合摘要：优先持久缓存命中（不触碰 ZIP），未命中才全量解析并回写。
 *  传入 identity 时将其并入缓存 key，identityMap 作为归并参数传给 buildSeasonCohort。
 *  teamRenames 在加载阶段应用，同名队伍自动合并。聚合后释放 pkgCache 降低峰值内存。 */
export function getSeasonSummary(entries: StudioDemoEntry[], identity?: IdentityOptions, selectedTeams: string[] = []): Promise<SeasonSummary> {
  const key = keyOf(entries, identity?.version, selectedTeams);
  const cached = seasonSummaryCache.get(key);
  if (cached) return cached;
  const loading = (async () => {
    const persisted = await readPersistedValue<SeasonSummary>(key);
    if (persisted) return persisted;
    const factsStore = getFactsStore();
    const matchIds = entries.map(matchIdForEntry);
    // 队伍透镜（行级）：不窄化 demo 语料，只按 teamKey 过滤 cohort 行。内层 row.teamKey 新旧 facts 皆有。
    const allowed = allowedTeamKeysByMatch(entries, selectedTeams, identity?.teamRenames);
    const cohortRows = (await factsStore.getCohortRows({ matchIds })).filter((row) =>
      !allowed || allowed.get(row.matchId)?.has(row.teamKey),
    );
    if (cohortRows.length > 0) {
      const cohortOpts = identity?.version ? { identityMap: identity.map } : {};
      const bundle = buildSeasonCohortFromRows(cohortRows, { ...cohortOpts, matchCount: entries.length });
      const tournamentFacts = withTeamRenames(await factsStore.getTournamentFacts({ matchIds }), identity?.teamRenames);
      const summary: SeasonSummary = {
        bundle,
        leaderboard: buildSeasonLeaderboardModel(bundle),
        profiles: buildAllPlayerSeasonProfiles(bundle),
        insights: tournamentFacts.length > 0 ? buildTournamentInsightsFromFacts(tournamentFacts) : null
      };
      void writePersistedValue(key, summary);
      return summary;
    }
    throw missingFactsError("赛季聚合");
  })();
  return touchLimitedCache(seasonSummaryCache, key, loading, SMALL_CACHE_LIMIT);
}
