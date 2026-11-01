import { playerScoreboardRowSchema, type PlayerScoreboardRow, type DemoViewModel } from "./models/summary.js";

/** Already-computed display data; accepts any producer with this shape. */
export type DemoViewInput = Pick<DemoViewModel, "teams" | "playerRoundFacts" | "timeline" | "economy" | "heatmap" | "qa"> & {
  mapName: string;
  scoreboard: Array<Omit<PlayerScoreboardRow, "indicators"> & { indicators: object }>;
};
/** Asset URLs belong to the embedding product. Omitted images render without a radar background. */
export interface DemoViewOptions {
  radarImageUrl?: string | null;
  lowerRadarImageUrl?: string | null;
}

export function buildDemoViewModel(bundle: DemoViewInput, options: DemoViewOptions = {}): DemoViewModel {
  return {
    title: `${bundle.teams.teamA.name} vs ${bundle.teams.teamB.name}`,
    subtitle: `${bundle.mapName} · ${bundle.scoreboard.length} 名选手 · ${bundle.economy.length} 回合`,
    map: {
      name: bundle.mapName,
      radarImageUrl: options.radarImageUrl ?? null,
      lowerRadarImageUrl: options.lowerRadarImageUrl ?? null,
      calibrated: bundle.heatmap.length > 0
    },
    scoreline: `${bundle.teams.teamA.score}:${bundle.teams.teamB.score}`,
    teams: bundle.teams,
    scoreboard: bundle.scoreboard.map((row) => playerScoreboardRowSchema.parse({ ...row, indicators: numericExplanations(row.indicators) })),
    playerRoundFacts: bundle.playerRoundFacts,
    timeline: bundle.timeline,
    economy: bundle.economy,
    heatmap: bundle.heatmap,
    qa: bundle.qa
  };
}

/** Keep only numeric explanation values; producer identifiers are not display metrics. */
function numericExplanations(input: object): PlayerScoreboardRow["indicators"] {
  const values: PlayerScoreboardRow["indicators"] = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || (typeof value === "number" && Number.isFinite(value))) {
      values[key] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const entries = Object.entries(value);
      if (entries.every(([, item]) => typeof item === "number" && Number.isFinite(item))) {
        values[key] = Object.fromEntries(entries) as Record<string, number>;
      }
    }
  }
  return values;
}
