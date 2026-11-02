import type { MatchWorkspaceModel } from "@cs2dak/presentation";
import { ANALYSIS_MANIFEST } from "./analysis-manifest";
import type { AnalysisContext } from "./analysis-context";
import type { StudioDemoEntry } from "./demo-entry";
import { sourceRefForEntry, type StudioSourceRef } from "./saved-evidence";
import type { AnalysisPageId } from "./studio-navigation";
import {
  roundMatchesFilter,
  type MatchWorkspaceState,
} from "./match-workspace-state";
import { matchesQuickRound } from "./match-review";

export type ExportCell = string | number | boolean | null;
export interface AnalysisResultSection {
  title: string;
  text: string[];
  columns: Array<{ key: string; label: string; unit: string | null }>;
  rows: Array<Record<string, ExportCell>>;
  sampleDescription: string;
  limitations: string[];
}
export interface AnalysisResultSnapshotV1 {
  schemaVersion: 1;
  title: string;
  generatedAt: number;
  appVersion: string;
  page: AnalysisPageId | "match";
  context: AnalysisContext | null;
  scopeSummary: string;
  conditions: string[];
  sources: StudioSourceRef[];
  sections: AnalysisResultSection[];
  limitations: string[];
}

function projectContext(
  context: AnalysisContext | null,
): AnalysisContext | null {
  if (!context) return null;
  const focus =
    context.focus.kind === "aggregate"
      ? { kind: "aggregate" as const }
      : context.focus.kind === "team"
        ? { kind: "team" as const, teamName: context.focus.teamName }
        : context.focus.kind === "match"
          ? {
              kind: "match" as const,
              entryId: context.focus.entryId,
              label: context.focus.label,
            }
          : context.focus.kind === "event"
            ? {
                kind: "event" as const,
                eventId: context.focus.eventId,
                label: context.focus.label,
              }
            : {
                kind: context.focus.kind,
                playerKey: context.focus.playerKey,
                label: context.focus.label,
              };
  const role = (value: AnalysisContext["roles"]["beneficiary"]) =>
    value ? { kind: value.kind, id: value.id, label: value.label } : undefined;
  const baseline =
    context.baseline.kind === "specified"
      ? {
          kind: "specified" as const,
          subject: role(context.baseline.subject)!,
          ...(context.baseline.label !== undefined && {
            label: context.baseline.label,
          }),
        }
      : context.baseline.kind === "event-peers"
        ? {
            kind: "event-peers" as const,
            eventId: context.baseline.eventId,
            ...(context.baseline.label !== undefined && {
              label: context.baseline.label,
            }),
          }
        : context.baseline.kind === "personal-history"
          ? {
              kind: "personal-history" as const,
              playerKey: context.baseline.playerKey,
              ...(context.baseline.label !== undefined && {
                label: context.baseline.label,
              }),
            }
          : {
              kind: context.baseline.kind,
              ...(context.baseline.label !== undefined && {
                label: context.baseline.label,
              }),
            };
  const corpus = context.corpus;
  return {
    goal: context.goal,
    focus,
    baseline,
    roles: {
      beneficiary: role(context.roles.beneficiary),
      opponent: role(context.roles.opponent),
      comparison: role(context.roles.comparison),
    },
    corpus: {
      eventIds: [...corpus.eventIds],
      entryIds: [...corpus.entryIds],
      matchIds: [...corpus.matchIds],
      maps: [...corpus.maps],
      tags: [...corpus.tags],
      excludedEntryIds: [...corpus.excludedEntryIds],
      ...(corpus.entrySelectionActive !== undefined && {
        entrySelectionActive: corpus.entrySelectionActive,
      }),
      ...(corpus.dateRange && {
        dateRange: {
          from: corpus.dateRange.from,
          to: corpus.dateRange.to,
          includeUnknown: corpus.dateRange.includeUnknown,
        },
      }),
    },
  };
}

/** Capture only the data explicitly projected by the page, independently of later edits. */
export function captureAnalysisResult(
  input: Omit<
    AnalysisResultSnapshotV1,
    "schemaVersion" | "generatedAt" | "appVersion" | "sources"
  > & { entries: StudioDemoEntry[] },
): AnalysisResultSnapshotV1 {
  const { entries, ...result } = input;
  const sourceWarnings: string[] = [];
  const safeIdentifier = (value: string) => {
    if (/^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(value)) {
      sourceWarnings.push("来源标识包含本机路径，已隐藏。");
      return "[来源标识已隐藏]";
    }
    return value;
  };
  const snapshot = structuredClone({
    ...result,
    context: projectContext(result.context),
    schemaVersion: 1 as const,
    generatedAt: Date.now(),
    appVersion: ANALYSIS_MANIFEST.appVersion,
    sources: entries.map((entry) => {
      const source = sourceRefForEntry(entry);
      // Legacy records can contain paths; only the final filename belongs in a report.
      const hash = source.demoSha256;
      if (hash === null)
        sourceWarnings.push(
          `来源 ${source.fileName.split(/[\\/]/).pop() ?? ""} 未记录原始 demo SHA-256。`,
        );
      else if (!/^[a-f0-9]{64}$/.test(hash))
        sourceWarnings.push("来源 demo SHA-256 无效，已保留为未知。");
      const builtWith =
        source.builtWith &&
        typeof source.builtWith.formatVersion === "string" &&
        typeof source.builtWith.factsRevision === "string"
          ? {
              formatVersion: source.builtWith.formatVersion,
              factsRevision: source.builtWith.factsRevision,
            }
          : null;
      if (builtWith === null)
        sourceWarnings.push(
          `来源 ${source.fileName.split(/[\\/]/).pop() ?? ""} 的构建版本未知。`,
        );
      return {
        ...source,
        builtWith,
        entryId: safeIdentifier(source.entryId),
        matchId: safeIdentifier(source.matchId),
        demoSha256: hash && /^[a-f0-9]{64}$/.test(hash) ? hash : null,
        fileName: source.fileName.split(/[\\/]/).pop() ?? "",
      };
    }),
    limitations: [...result.limitations, ...sourceWarnings],
    sections: result.sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            typeof value === "number" && !Number.isFinite(value) ? null : value,
          ]),
        ),
      ),
    })),
  });
  // Legacy identifiers can be paths even in context or evidence rows. Never serialize them.
  let redacted = false;
  const scrub = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (/^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(value)) {
        redacted = true;
        return "[路径已隐藏]";
      }
      return value.replace(
        /(?:[a-zA-Z]:[\\/]|\\\\|\/(?:home|root|Users|workspace|tmp|var|mnt|Volumes|opt)\/)[^\s"']+/g,
        () => {
          redacted = true;
          return "[路径已隐藏]";
        },
      );
    }
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, scrub(item)]),
      );
    return value;
  };
  const safe = scrub(snapshot) as AnalysisResultSnapshotV1;
  if (redacted) safe.limitations.push("部分本机路径已隐藏。");
  return safe;
}

/** Fixed projection of the already loaded single-match report model. */
export function buildMatchAnalysisResult(
  model: MatchWorkspaceModel,
  entry: StudioDemoEntry,
  state: MatchWorkspaceState,
): AnalysisResultSnapshotV1 {
  const rounds = model.rounds.filter(
    (row) =>
      roundMatchesFilter(row, state.roundExplorer.filter) &&
      matchesQuickRound(
        row,
        state.quickRoundFilter,
        state.reviewPlayerSteamId64,
      ),
  );
  const conditions = [
    `当前子页：${state.view}`,
    `选中回合：${state.roundExplorer.selectedRoundNumber ?? "无"}`,
    `复盘选手：${model.scoreboard.find((row) => row.steamId64 === state.reviewPlayerSteamId64)?.name ?? "全部"}`,
    `快捷回合筛选：${state.quickRoundFilter}`,
    `回合筛选：${JSON.stringify(state.roundExplorer.filter)}`,
    "记分板与关键回合为整场；回合表应用当前回合筛选。",
  ];
  return captureAnalysisResult({
    title: model.title,
    page: "match",
    context: null,
    scopeSummary: `${model.mapName} · ${model.scoreline}`,
    conditions,
    entries: [entry],
    limitations: ["图像、回放帧和原始 ZIP 未包含；此文件不能重建旧算法环境。"],
    sections: [
      {
        title: "记分板",
        text: [],
        sampleDescription: `${model.scoreboard.length} 名选手`,
        limitations: [],
        columns: [
          { key: "name", label: "选手", unit: null },
          { key: "team", label: "队伍", unit: null },
          { key: "accountRR", label: "职业 RR", unit: null },
          { key: "rr", label: "RR", unit: null },
          { key: "kills", label: "击杀", unit: null },
          { key: "deaths", label: "死亡", unit: null },
          { key: "assists", label: "助攻", unit: null },
          { key: "adr", label: "ADR", unit: null },
          { key: "kast", label: "KAST", unit: "%" },
          { key: "headshotPercent", label: "HS", unit: "%" },
          { key: "entryKills", label: "首杀", unit: null },
          { key: "tradeKills", label: "补枪", unit: null },
          { key: "awpKills", label: "AWP", unit: null },
          { key: "utilityDamage", label: "道具伤害", unit: null },
        ],
        rows: model.scoreboard.map((row) => ({
          name: row.name,
          team: model.teams[row.teamKey].name,
          kills:
            row.fieldAvailability.playerStats === "available"
              ? row.kills
              : null,
          deaths:
            row.fieldAvailability.playerStats === "available"
              ? row.deaths
              : null,
          assists:
            row.fieldAvailability.playerStats === "available"
              ? row.assists
              : null,
          adr: row.fieldAvailability.damages === "available" ? row.adr : null,
          kast: row.fieldAvailability.rounds === "available" ? row.kast : null,
          accountRR: row.accountRR,
          rr: row.rr,
          headshotPercent:
            row.fieldAvailability.playerStats === "available"
              ? row.headshotPercent
              : null,
          entryKills:
            row.fieldAvailability.playerStats === "available"
              ? row.entryKills
              : null,
          tradeKills:
            row.fieldAvailability.playerStats === "available"
              ? row.tradeKills
              : null,
          awpKills:
            row.fieldAvailability.playerStats === "available"
              ? row.awpKills
              : null,
          utilityDamage:
            row.fieldAvailability.damages === "available"
              ? row.utilityDamage
              : null,
        })),
      },
      {
        title: "关键回合",
        text: [],
        sampleDescription: `${model.reportHighlights.length} 个关键回合`,
        limitations: [],
        columns: [
          { key: "round", label: "回合", unit: null },
          { key: "score", label: "比分", unit: null },
          { key: "winner", label: "胜方", unit: null },
          { key: "tags", label: "标签", unit: null },
        ],
        rows: model.reportHighlights.map((row) => ({
          round: row.roundNumber,
          score: row.scoreBefore,
          winner: row.winnerSide,
          tags: row.tags.join("、"),
        })),
      },
      {
        title: "经济与回合",
        text: [],
        sampleDescription: `${rounds.length} 个回合（全部筛选结果）`,
        limitations: [],
        columns: [
          { key: "round", label: "回合", unit: null },
          { key: "score", label: "比分", unit: null },
          { key: "winner", label: "胜方", unit: null },
          { key: "economyA", label: "A 队经济", unit: null },
          { key: "economyB", label: "B 队经济", unit: null },
          { key: "reason", label: "结束方式", unit: null },
        ],
        rows: rounds.map((row) => ({
          round: row.roundNumber,
          score: row.scoreBefore,
          winner: row.winnerSide,
          economyA: row.teamAEconomy,
          economyB: row.teamBEconomy,
          reason: row.endReason,
        })),
      },
    ],
  });
}

function escapeMarkdown(value: ExportCell): string {
  return String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#!])/g, "\\$1")
    .replace(/\|/g, "\\|")
    .replace(/\r\n|\r|\n/g, "<br>");
}
export function analysisResultMarkdown(
  snapshot: AnalysisResultSnapshotV1,
): string {
  const lines = [
    `# ${escapeMarkdown(snapshot.title)}`,
    "",
    `范围：${escapeMarkdown(snapshot.scopeSummary)}`,
    `生成时间：${new Date(snapshot.generatedAt).toISOString()}`,
    `应用版本：${escapeMarkdown(snapshot.appVersion)}`,
    `样本：${snapshot.sources.length} 场来源，详见各节`,
    "",
    "## 条件",
    ...snapshot.conditions.map((value) => `- ${escapeMarkdown(value)}`),
  ];
  for (const section of snapshot.sections) {
    lines.push(
      "",
      `## ${escapeMarkdown(section.title)}`,
      "",
      escapeMarkdown(section.sampleDescription),
      ...section.text.map(escapeMarkdown),
    );
    if (section.columns.length) {
      lines.push(
        "",
        `| ${section.columns.map((column) => escapeMarkdown(column.label + (column.unit ? ` (${column.unit})` : ""))).join(" | ")} |`,
        `| ${section.columns.map(() => "---").join(" | ")} |`,
      );
      for (const row of section.rows)
        lines.push(
          `| ${section.columns.map((column) => escapeMarkdown(row[column.key] ?? null)).join(" | ")} |`,
        );
    }
    lines.push(
      ...section.limitations.map((value) => `- 局限：${escapeMarkdown(value)}`),
    );
  }
  lines.push(
    "",
    "## 来源",
    ...snapshot.sources.map(
      (source) =>
        `- ${escapeMarkdown(source.fileName)} · ${escapeMarkdown(source.mapName)} · entry ${escapeMarkdown(source.entryId)} · match ${escapeMarkdown(source.matchId)} · SHA-256 ${escapeMarkdown(source.demoSha256)} · 构建版本 ${escapeMarkdown(source.builtWith ? JSON.stringify(source.builtWith) : null)}`,
    ),
    "",
    "## 局限",
    ...snapshot.limitations.map((value) => `- ${escapeMarkdown(value)}`),
  );
  return lines.join("\n");
}

/** Source and context must come from the same successful request as the supplied model. */
export interface AnalysisExportSource {
  context: AnalysisContext;
  entries: StudioDemoEntry[];
  scopeSummary: string;
  conditions: string[];
}

/** Build the envelope only from entries retained with a successful request. */
export function analysisExportSource(
  context: AnalysisContext,
  entries: StudioDemoEntry[],
  scopeSummary: string,
): AnalysisExportSource {
  const corpus = context.corpus;
  const date = corpus.dateRange;
  return {
    context,
    entries,
    scopeSummary,
    conditions: [
      "实际参照见各节说明。",
      `日期：${date ? `${date.from ?? "不限"} 至 ${date.to ?? "不限"}${date.includeUnknown ? "（含未知日期）" : "（不含未知日期）"}` : "不限"}`,
      `地图：${corpus.maps.length ? corpus.maps.join("、") : "不限"}`,
      `标签：${corpus.tags.length ? corpus.tags.join("、") : "不限"}`,
      `实际来源：${entries.length} 场`,
    ],
  };
}

export function withAnalysisExportEntries(
  source: AnalysisExportSource,
  entries: StudioDemoEntry[],
): AnalysisExportSource {
  return {
    ...source,
    entries,
    conditions: [
      ...source.conditions.filter(
        (condition) => !condition.startsWith("实际来源："),
      ),
      `实际来源：${entries.length} 场`,
    ],
  };
}

/** Allow capture only when the rendered snapshot and the current successful sample agree. */
export function canExportSnapshot(
  snapshot: { generation: number; sample?: string } | null | undefined,
  analysis: { generation: number; status: string },
  entries?: StudioDemoEntry[] | null,
): boolean {
  return (
    !!snapshot &&
    analysis.status === "ready" &&
    snapshot.generation === analysis.generation &&
    (snapshot.sample === undefined ||
      (entries != null &&
        snapshot.sample === JSON.stringify(entries.map((entry) => entry.id))))
  );
}
export function unionExportEntries(
  ...groups: Array<StudioDemoEntry[] | null | undefined>
): StudioDemoEntry[] {
  return [
    ...new Map(
      groups.flatMap((group) => group ?? []).map((entry) => [entry.id, entry]),
    ).values(),
  ];
}

export function withCapabilityConditions(
  source: AnalysisExportSource,
  ...items: Array<
    import("./capability-availability").CapabilityAvailability | null
  >
): AnalysisExportSource {
  const conditions = items
    .filter((item) => item !== null)
    .flatMap((item) => [
      `能力 ${item.capability} 样本：${item.eligibleMatches}/${item.totalMatches} 场`,
      ...item.excluded.map((row) => `未纳入 ${row.count} 场：${row.reason}`),
      ...item.dependencies
        .filter((row) => row.available < row.totalEligible)
        .map(
          (row) =>
            `依赖 ${row.key}：${row.available}/${row.totalEligible} 场具备${row.required ? "（必需）" : "（可选）"}`,
        ),
    ]);
  return { ...source, conditions: [...source.conditions, ...conditions] };
}
