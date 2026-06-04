import {
  mvpRecommendationSchema,
  seriesSummarySchema,
  type MatchWorkspaceModel,
  type MvpCandidate,
  type MvpRecommendation,
  type SeriesMatchInput,
  type SeriesPlayerRow,
  type SeriesSummary
} from "@cs2dak/contract";
import { round } from "./season-metrics.js";

const MVP_CANDIDATE_LIMIT = 3;

interface MvpSource {
  playerKey: string;
  name: string;
  teamName: string;
  rivalhubRR: number;
  hltvRating: number;
  confidence: number;
}

function candidateFrom(source: MvpSource): MvpCandidate {
  const recommendationScore = round(
    source.rivalhubRR * 0.45 + source.hltvRating * 0.4 + source.confidence * 0.15,
    4
  );
  return {
    ...source,
    recommendationScore,
    explanation: [
      `RivalHub RR ${source.rivalhubRR.toFixed(3)}（45%）`,
      `HLTV Rating 2.0 ${source.hltvRating.toFixed(2)}（40%）`,
      `数据可信度 ${(source.confidence * 100).toFixed(0)}%（15%）`
    ]
  };
}

function rankMvpCandidates(sources: MvpSource[]): MvpCandidate[] {
  return sources
    .map(candidateFrom)
    .sort((a, b) =>
      b.recommendationScore - a.recommendationScore
      || b.rivalhubRR - a.rivalhubRR
      || b.hltvRating - a.hltvRating
    )
    .slice(0, MVP_CANDIDATE_LIMIT);
}

export function recommendMatchMvp(model: MatchWorkspaceModel): MvpRecommendation {
  const candidates = rankMvpCandidates(model.scoreboard.map((row) => ({
    playerKey: row.steamId64,
    name: row.name,
    teamName: model.teams[row.teamKey].name,
    rivalhubRR: row.accountRR,
    hltvRating: row.rr,
    confidence: row.confidence
  })));
  if (candidates.length === 0) throw new Error("match MVP recommendation requires at least one player");
  return mvpRecommendationSchema.parse({
    version: "cs2-demo-analysis-kit/mvp-recommendation-0.1",
    recommended: candidates[0],
    candidates
  });
}

interface SeriesAccumulator {
  playerKey: string;
  name: string;
  teamName: string;
  mapCount: number;
  totalRounds: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  kastRounds: number;
  rivalhubRRRounds: number;
  hltvRatingRounds: number;
  confidenceRounds: number;
  perMap: SeriesPlayerRow["perMap"];
}

export interface SeriesTeamIdentity {
  teamKey: string;
  name: string;
}

export interface SeriesSummaryOptions {
  /** Key format: `${matchId}:teamA` / `${matchId}:teamB`. Identity remains product-owned. */
  teamMap?: Record<string, SeriesTeamIdentity>;
}

function stableTeamKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

function teamIdentity(
  matchId: string,
  side: "teamA" | "teamB",
  model: MatchWorkspaceModel,
  options: SeriesSummaryOptions
): SeriesTeamIdentity {
  return options.teamMap?.[`${matchId}:${side}`] ?? {
    teamKey: stableTeamKey(model.teams[side].name),
    name: model.teams[side].name
  };
}

export function buildSeriesSummary(
  matches: SeriesMatchInput[],
  options: SeriesSummaryOptions = {}
): SeriesSummary {
  if (matches.length === 0) throw new Error("series summary requires at least one match");

  const players = new Map<string, SeriesAccumulator>();
  const teams = new Map<string, { teamKey: string; name: string; mapsWon: number }>();

  for (const { matchId, model } of matches) {
    const identity = {
      teamA: teamIdentity(matchId, "teamA", model, options),
      teamB: teamIdentity(matchId, "teamB", model, options)
    };
    for (const team of [identity.teamA, identity.teamB]) {
      if (!teams.has(team.teamKey)) teams.set(team.teamKey, { ...team, mapsWon: 0 });
    }
    const winnerSide = model.teams.teamA.score === model.teams.teamB.score
      ? null
      : model.teams.teamA.score > model.teams.teamB.score ? "teamA" : "teamB";
    if (winnerSide) teams.get(identity[winnerSide].teamKey)!.mapsWon += 1;

    for (const row of model.scoreboard) {
      const rounds = model.players.find((player) => player.row.steamId64 === row.steamId64)?.roundFacts.length
        ?? model.rounds.length;
      const teamName = identity[row.teamKey].name;
      const acc = players.get(row.steamId64) ?? {
        playerKey: row.steamId64,
        name: row.name,
        teamName,
        mapCount: 0,
        totalRounds: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        kastRounds: 0,
        rivalhubRRRounds: 0,
        hltvRatingRounds: 0,
        confidenceRounds: 0,
        perMap: []
      };
      acc.mapCount += 1;
      acc.totalRounds += rounds;
      acc.kills += row.kills;
      acc.deaths += row.deaths;
      acc.assists += row.assists;
      acc.damage += row.adr * rounds;
      acc.kastRounds += (row.kast / 100) * rounds;
      acc.rivalhubRRRounds += row.accountRR * rounds;
      acc.hltvRatingRounds += row.rr * rounds;
      acc.confidenceRounds += row.confidence * rounds;
      acc.perMap.push({
        matchId,
        mapName: model.mapName,
        rivalhubRR: row.accountRR,
        hltvRating: row.rr,
        adr: row.adr,
        kast: row.kast
      });
      players.set(row.steamId64, acc);
    }
  }

  const scoreboard = [...players.values()]
    .map((row): SeriesPlayerRow => ({
      playerKey: row.playerKey,
      name: row.name,
      teamName: row.teamName,
      mapCount: row.mapCount,
      totalRounds: row.totalRounds,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      adr: round(row.damage / row.totalRounds, 1),
      kast: round((row.kastRounds / row.totalRounds) * 100, 1),
      rivalhubRR: round(row.rivalhubRRRounds / row.totalRounds, 3),
      hltvRating: round(row.hltvRatingRounds / row.totalRounds, 2),
      confidence: round(row.confidenceRounds / row.totalRounds, 3),
      perMap: row.perMap
    }))
    .sort((a, b) => b.rivalhubRR - a.rivalhubRR || b.hltvRating - a.hltvRating);

  return seriesSummarySchema.parse({
    version: "cs2-demo-analysis-kit/series-summary-0.1",
    mapCount: matches.length,
    maps: matches.map(({ matchId, model }) => ({
      matchId,
      mapName: model.mapName,
      scoreline: model.scoreline,
      teamAName: teamIdentity(matchId, "teamA", model, options).name,
      teamBName: teamIdentity(matchId, "teamB", model, options).name,
      winnerName: model.teams.teamA.score === model.teams.teamB.score
        ? null
        : model.teams.teamA.score > model.teams.teamB.score
          ? teamIdentity(matchId, "teamA", model, options).name
          : teamIdentity(matchId, "teamB", model, options).name
    })),
    teams: [...teams.values()].sort((a, b) => b.mapsWon - a.mapsWon || a.name.localeCompare(b.name)),
    scoreboard,
    mvpCandidates: rankMvpCandidates(scoreboard)
  });
}
