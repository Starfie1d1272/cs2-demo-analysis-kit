import { matchIdForEntry, type StudioDemoEntry } from "./library.js";

/** 当前分析的用户目标；运行时状态，不是可保存的业务对象。 */
export type AnalysisGoal =
  | "explore"
  | "personal-review"
  | "player-analysis"
  | "team-analysis"
  | "event-analysis"
  | "match-review"
  | "own-review"
  | "opponent-prep";

/** 只描述语料，绝不把 Team 混入其中。 */
export interface AnalysisCorpus {
  eventIds: string[];
  entryIds: string[];
  matchIds: string[];
  maps: string[];
  tags: string[];
  excludedEntryIds: string[];
}

export type AnalysisFocus =
  | { kind: "aggregate" }
  | { kind: "self"; playerKey: string; label: string }
  | { kind: "player"; playerKey: string; label: string }
  | { kind: "team"; teamName: string }
  | { kind: "event"; eventId: string; label: string }
  | { kind: "match"; entryId: string; label: string };

export interface AnalysisRoleRef {
  kind: "self" | "player" | "team";
  id: string;
  label: string;
}

export interface AnalysisRoles {
  beneficiary?: AnalysisRoleRef;
  opponent?: AnalysisRoleRef;
  comparison?: AnalysisRoleRef;
}

export type AnalysisBaseline =
  | { kind: "corpus"; label?: string }
  | { kind: "event-peers"; eventId: string; label?: string }
  | { kind: "personal-history"; playerKey: string; label?: string }
  | { kind: "specified"; subject: AnalysisRoleRef; label?: string }
  | { kind: "descriptive"; label?: string };

/** Studio 的唯一共同分析语义；不含 tab、tick、排序、持久化或导航状态。 */
export interface AnalysisContext {
  goal: AnalysisGoal;
  corpus: AnalysisCorpus;
  focus: AnalysisFocus;
  roles: AnalysisRoles;
  baseline: AnalysisBaseline;
}

export interface AnalysisEventScope {
  id: string;
  name: string;
  entryIds: string[];
}

/** 仅供尚未迁移的页面消费；它不是第二份可写状态。 */
export interface CohortScopeProjection {
  eventIds: string[];
  maps: string[];
  tags: string[];
  excludedIds: string[];
  teams: string[];
}

export const EMPTY_ANALYSIS_CORPUS: AnalysisCorpus = {
  eventIds: [],
  entryIds: [],
  matchIds: [],
  maps: [],
  tags: [],
  excludedEntryIds: [],
};

export const EMPTY_ANALYSIS_CONTEXT: AnalysisContext = {
  goal: "explore",
  corpus: EMPTY_ANALYSIS_CORPUS,
  focus: { kind: "aggregate" },
  roles: {},
  baseline: { kind: "descriptive" },
};

function copyCorpus(corpus: AnalysisCorpus = EMPTY_ANALYSIS_CORPUS): AnalysisCorpus {
  return {
    eventIds: [...corpus.eventIds],
    entryIds: [...corpus.entryIds],
    matchIds: [...corpus.matchIds],
    maps: [...corpus.maps],
    tags: [...corpus.tags],
    excludedEntryIds: [...corpus.excludedEntryIds],
  };
}

/** 从入口/default setting 创建新的当前上下文；不会隐式保留旧上下文。 */
export function createAnalysisContext(
  input: Partial<AnalysisContext> & Pick<AnalysisContext, "goal">,
): AnalysisContext {
  return {
    goal: input.goal,
    corpus: copyCorpus(input.corpus),
    focus: input.focus ?? { kind: "aggregate" },
    roles: { ...input.roles },
    baseline: input.baseline ?? { kind: "descriptive" },
  };
}

/** 专家直达与对象入口共用的最小默认值；缺少的 focus/role 仍由能力明确要求。 */
export function createAnalysisContextPreset(
  goal: AnalysisGoal,
  input: Omit<Partial<AnalysisContext>, "goal" | "baseline"> & { baseline?: AnalysisBaseline } = {},
): AnalysisContext {
  return createAnalysisContext({
    ...input,
    goal,
    baseline: input.baseline ?? (goal === "explore" ? { kind: "descriptive" } : { kind: "corpus" }),
  });
}

export function withAnalysisFocus(context: AnalysisContext, focus: AnalysisFocus): AnalysisContext {
  return { ...context, focus };
}

export function withAnalysisRoles(context: AnalysisContext, roles: AnalysisRoles): AnalysisContext {
  return { ...context, roles: { ...roles } };
}

export function withAnalysisBaseline(context: AnalysisContext, baseline: AnalysisBaseline): AnalysisContext {
  return { ...context, baseline };
}

export function withAnalysisGoal(context: AnalysisContext, goal: AnalysisGoal): AnalysisContext {
  return { ...context, goal };
}

export function cohortScopeProjection(context: AnalysisContext): CohortScopeProjection {
  return {
    eventIds: [...context.corpus.eventIds],
    maps: [...context.corpus.maps],
    tags: [...context.corpus.tags],
    excludedIds: [...context.corpus.excludedEntryIds],
    teams: context.focus.kind === "team" ? [context.focus.teamName] : [],
  };
}

/** 将旧 CohortScope 的用户操作映射回唯一 context owner。 */
export function applyCohortScopeProjection(context: AnalysisContext, next: CohortScopeProjection): AnalysisContext {
  const selectedTeam = next.teams[0] ?? null;
  const clearedTeamFocus = context.focus.kind === "team" && !selectedTeam;
  return {
    ...context,
    goal: selectedTeam && context.goal === "explore"
      ? "team-analysis"
      : clearedTeamFocus && context.goal === "team-analysis" ? "explore" : context.goal,
    corpus: {
      eventIds: [...next.eventIds],
      entryIds: [...context.corpus.entryIds],
      matchIds: [...context.corpus.matchIds],
      maps: [...next.maps],
      tags: [...next.tags],
      excludedEntryIds: [...next.excludedIds],
    },
    focus: selectedTeam ? { kind: "team", teamName: selectedTeam } : clearedTeamFocus ? { kind: "aggregate" } : context.focus,
  };
}

/**
 * 解析当前语料。focus/roles 永远不参与筛比赛：队伍是分析主体或关系对象，
 * 不是隐式 corpus filter。
 */
export function resolveAnalysisCorpus(
  entries: readonly StudioDemoEntry[],
  corpus: AnalysisCorpus,
  events: readonly AnalysisEventScope[] = [],
): StudioDemoEntry[] {
  const excluded = new Set(corpus.excludedEntryIds);
  const eventEntryIds = corpus.eventIds.length > 0
    ? new Set(events.filter((event) => corpus.eventIds.includes(event.id)).flatMap((event) => event.entryIds))
    : null;
  const entryIds = corpus.entryIds.length > 0 ? new Set(corpus.entryIds) : null;
  const matchIds = corpus.matchIds.length > 0 ? new Set(corpus.matchIds) : null;

  return entries.filter((entry) =>
    (!eventEntryIds || eventEntryIds.has(entry.id)) &&
    (!entryIds || entryIds.has(entry.id)) &&
    (!matchIds || matchIds.has(matchIdForEntry(entry))) &&
    (corpus.maps.length === 0 || corpus.maps.includes(entry.meta.mapName)) &&
    (corpus.tags.length === 0 || entry.tags.some((tag) => corpus.tags.includes(tag))) &&
    !excluded.has(entry.id),
  );
}

/** 仅供用户明确要求“只取某队参加的比赛”时使用；不是 context 的隐含行为。 */
export function filterCorpusEntriesByTeam(
  entries: readonly StudioDemoEntry[],
  teamName: string,
  teamRenames: Record<string, string> = {},
): StudioDemoEntry[] {
  const normalized = teamName.trim().toLowerCase();
  const display = (name: string) => (teamRenames[name] ?? name).trim().toLowerCase();
  return entries.filter((entry) => display(entry.meta.teamAName) === normalized || display(entry.meta.teamBName) === normalized);
}

export type AnalysisCapability = "player" | "team" | "event" | "match" | "coach";

/** 当前能力缺少的必要坐标；局部筛选不应进入此判断。 */
export function missingAnalysisCoordinates(context: AnalysisContext, capability: AnalysisCapability): string[] {
  if (capability === "player") {
    return context.focus.kind === "self" || context.focus.kind === "player" ? [] : ["分析选手"];
  }
  if (capability === "team") return context.focus.kind === "team" ? [] : ["分析队伍"];
  if (capability === "event") return context.focus.kind === "event" ? [] : ["赛事"];
  if (capability === "match") return context.focus.kind === "match" ? [] : ["比赛"];
  if (context.goal === "opponent-prep") {
    return [context.roles.beneficiary ? null : "我方", context.roles.opponent ? null : "对手"].filter(
      (value): value is string => value != null,
    );
  }
  if (context.goal === "own-review") return context.roles.beneficiary ? [] : ["我方"];
  return [];
}

function focusLabel(focus: AnalysisFocus): string {
  if (focus.kind === "aggregate") return "整体范围";
  if (focus.kind === "team") return focus.teamName;
  return focus.label;
}

function baselineLabel(baseline: AnalysisBaseline): string {
  if (baseline.label) return baseline.label;
  if (baseline.kind === "corpus") return "当前样本";
  if (baseline.kind === "event-peers") return "赛事同侪";
  if (baseline.kind === "personal-history") return "个人历史";
  if (baseline.kind === "specified") return baseline.subject.label;
  return "仅描述";
}

const GOAL_LABEL: Record<AnalysisGoal, string> = {
  explore: "自由探索",
  "personal-review": "个人复盘",
  "player-analysis": "选手分析",
  "team-analysis": "队伍分析",
  "event-analysis": "赛事分析",
  "match-review": "单场复盘",
  "own-review": "己方复盘",
  "opponent-prep": "对手备战",
};

/** 供壳层/行动快照复用的可读上下文，不暴露内部 id。 */
export function summarizeAnalysisContext(
  context: AnalysisContext,
  entries: readonly StudioDemoEntry[],
  events: readonly AnalysisEventScope[] = [],
): string {
  const corpus = resolveAnalysisCorpus(entries, context.corpus, events);
  const corpusLabel = context.corpus.eventIds.length === 1
    ? events.find((event) => event.id === context.corpus.eventIds[0])?.name ?? `${corpus.length} 场`
    : `${corpus.length} 场`;
  return [focusLabel(context.focus), corpusLabel, baselineLabel(context.baseline), GOAL_LABEL[context.goal]].join(" · ");
}
