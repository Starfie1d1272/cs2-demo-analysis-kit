import { round } from "./season-metrics.js";
import { displayWeaponName } from "./weapons.js";
import type { DemoPackage } from "@cs2dak/contract";

export interface TeamComparisonPlayerRow {
  teamName: string;
  steamId64: string;
  name: string;
  rr: number | null;
  adr: number | null;
  kast: number | null;
  kpr: number | null;
  dpr: number | null;
}

/** 该队某场比赛的概览（赛前侦察用，可点跳回放）。 */
export interface TeamComparisonSideMatch {
  matchId: string;
  mapName: string;
  opponent: string;
  roundsWon: number;
  roundsLost: number;
  won: boolean;
}

export interface TeamComparisonSide {
  teamName: string;
  matchCount: number;
  players: TeamComparisonPlayerRow[];
  weaponPreference: Array<{ weapon: string; label: string; kills: number; sharePercent: number }>;
  economyWinRate: Array<{ economyType: string; rounds: number; wins: number; winRatePercent: number | null }>;
  /** 该队在 cohort 内打过的比赛（按场次自然序）。 */
  matches: TeamComparisonSideMatch[];
}

export interface TeamComparisonModel {
  /** 0.2：服务"赛前侦察"——两队各自跨全部己方比赛聚合，无需互相交手；去掉旧的噪声 evidence，改 per-team 比赛列表。 */
  version: "cs2-demo-analysis-kit/team-comparison-0.2";
  teams: [TeamComparisonSide, TeamComparisonSide] | [];
  radar: Array<{ metric: string; label: string; a: number | null; b: number | null; delta: number | null }>;
  /** cohort 内全部队伍（按场次降序），供 UI 选 A/B 两队。 */
  availableTeams: Array<{ name: string; matches: number }>;
}

/** 队伍总览只编排已有跨场事实；不推导强弱项、因果或对策。 */
export interface TeamOverviewModel {
  version: "cs2-demo-analysis-kit/team-overview-0.1";
  teamName: string;
  matchCount: number;
  wins: number;
  losses: number;
  roundsWon: number;
  roundsLost: number;
  maps: Array<{ mapName: string; matches: number; wins: number; losses: number; roundsWon: number; roundsLost: number }>;
  roster: TeamComparisonPlayerRow[];
  weaponPreference: TeamComparisonSide["weaponPreference"];
  economyWinRate: TeamComparisonSide["economyWinRate"];
  matches: TeamComparisonSideMatch[];
}

export interface TeamComparisonInput {
  matchId: string;
  pkg: DemoPackage;
}

export interface TeamComparisonFacts {
  matchId: string;
  mapName: string;
  teams: Record<"teamA" | "teamB", string>;
  players: Array<{ steamId64: string; name: string; teamKey: "teamA" | "teamB" }>;
  playerStats: Array<{
    playerSteamId64: string;
    rounds: number;
    kills: number;
    deaths: number;
    damageHealth: number;
    kastRounds: number;
  }>;
  kills: Array<{ killerSteamId64: string | null; roundNumber: number; tick: number; weapon: string }>;
  rounds: Array<{ teamAEconomy: string; teamBEconomy: string; winnerTeamKey: "teamA" | "teamB" }>;
}

function teamName(pkg: DemoPackage, key: string): string {
  return key === "teamA" ? (pkg.match.teamA.name ?? "Team A") : (pkg.match.teamB.name ?? "Team B");
}

function averageNullable(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => value != null && Number.isFinite(value));
  return nums.length > 0 ? round(nums.reduce((sum, value) => sum + value, 0) / nums.length, 2) : null;
}

export function extractTeamComparisonFacts(input: TeamComparisonInput): TeamComparisonFacts {
  const { pkg } = input;
  return {
    matchId: input.matchId,
    mapName: pkg.match.mapName,
    teams: {
      teamA: teamName(pkg, "teamA"),
      teamB: teamName(pkg, "teamB")
    },
    players: pkg.players.map((player) => ({
      steamId64: player.steamId64,
      name: player.name,
      teamKey: player.teamKey
    })),
    playerStats: pkg.playerStats.map((stat) => {
      const player = pkg.players[stat.playerIndex];
      return {
        playerSteamId64: player?.steamId64 ?? "",
        rounds: stat.rounds,
        kills: stat.kills,
        deaths: stat.deaths,
        damageHealth: stat.damageHealth,
        kastRounds: stat.kastRounds
      };
    }).filter((row) => row.playerSteamId64 !== ""),
    kills: pkg.kills.map((kill) => ({
      killerSteamId64: kill.killerIndex != null ? (pkg.players[kill.killerIndex]?.steamId64 ?? null) : null,
      roundNumber: kill.roundNumber,
      tick: kill.tick,
      weapon: kill.weapon
    })),
    rounds: pkg.rounds.map((roundRow) => ({
      teamAEconomy: roundRow.teamAEconomy,
      teamBEconomy: roundRow.teamBEconomy,
      winnerTeamKey: roundRow.winnerTeamKey
    }))
  };
}

/**
 * @param inputs  cohort 内全部比赛的 facts
 * @param requestedPair  指定要对比的两队名（如 UI 选了 A/B）；缺省取场次最多的两队。
 *                       两队**无需互相交手**——各自跨全部己方比赛聚合，服务赛前侦察。
 */
export function buildTeamComparisonFromFacts(
  inputs: TeamComparisonFacts[],
  requestedPair?: [string, string]
): TeamComparisonModel {
  const matchCounts = new Map<string, number>();
  for (const input of inputs) {
    for (const teamName of [input.teams.teamA, input.teams.teamB]) {
      matchCounts.set(teamName, (matchCounts.get(teamName) ?? 0) + 1);
    }
  }
  const availableTeams = [...matchCounts.entries()]
    .map(([name, matches]) => ({ name, matches }))
    .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));

  const empty = (): TeamComparisonModel => ({
    version: "cs2-demo-analysis-kit/team-comparison-0.2",
    teams: [],
    radar: [],
    availableTeams
  });

  const valid = (name: string | undefined): name is string => name != null && matchCounts.has(name);
  const teamNames =
    requestedPair && valid(requestedPair[0]) && valid(requestedPair[1]) && requestedPair[0] !== requestedPair[1]
      ? [requestedPair[0], requestedPair[1]]
      : availableTeams.slice(0, 2).map((team) => team.name);
  if (teamNames.length < 2) return empty();

  const sides = teamNames.map((name): TeamComparisonSide => {
    const playerRows = new Map<string, TeamComparisonPlayerRow & { rounds: number; kills: number; deaths: number; damage: number; kastRounds: number }>();
    const weaponKills = new Map<string, number>();
    const economy = new Map<string, { rounds: number; wins: number }>();
    const matches: TeamComparisonSideMatch[] = [];
    for (const input of inputs) {
      const playerBySteam = new Map(input.players.map((player) => [player.steamId64, player]));
      for (const [teamKey, candidate] of [["teamA", input.teams.teamA], ["teamB", input.teams.teamB]] as const) {
        if (candidate !== name) continue;
        let roundsWon = 0;
        let roundsLost = 0;
        for (const round of input.rounds) {
          if (round.winnerTeamKey === teamKey) roundsWon += 1;
          else roundsLost += 1;
        }
        matches.push({
          matchId: input.matchId,
          mapName: input.mapName,
          opponent: teamKey === "teamA" ? input.teams.teamB : input.teams.teamA,
          roundsWon,
          roundsLost,
          won: roundsWon > roundsLost
        });
        for (const stat of input.playerStats) {
          const player = playerBySteam.get(stat.playerSteamId64);
          if (!player || player.teamKey !== teamKey) continue;
          const current = playerRows.get(player.steamId64) ?? {
            teamName: name,
            steamId64: player.steamId64,
            name: player.name,
            rr: null,
            adr: null,
            kast: null,
            kpr: null,
            dpr: null,
            rounds: 0,
            kills: 0,
            deaths: 0,
            damage: 0,
            kastRounds: 0
          };
          current.rounds += stat.rounds;
          current.kills += stat.kills;
          current.deaths += stat.deaths;
          current.damage += stat.damageHealth;
          current.kastRounds += stat.kastRounds;
          playerRows.set(player.steamId64, current);
        }
        for (const kill of input.kills) {
          if (kill.killerSteamId64 == null) continue;
          const killer = playerBySteam.get(kill.killerSteamId64);
          if (!killer || killer.teamKey !== teamKey) continue;
          const weapon = killWeaponLabel(kill.weapon);
          weaponKills.set(weapon, (weaponKills.get(weapon) ?? 0) + 1);
        }
        for (const round of input.rounds) {
          const type = teamKey === "teamA" ? round.teamAEconomy : round.teamBEconomy;
          const cell = economy.get(type) ?? { rounds: 0, wins: 0 };
          cell.rounds += 1;
          if (round.winnerTeamKey === teamKey) cell.wins += 1;
          economy.set(type, cell);
        }
      }
    }
    const players = [...playerRows.values()].map((row) => ({
      teamName: row.teamName,
      steamId64: row.steamId64,
      name: row.name,
      rr: row.rounds > 0 ? round((row.kills - row.deaths) / row.rounds + row.damage / row.rounds / 100, 3) : null,
      adr: row.rounds > 0 ? round(row.damage / row.rounds, 1) : null,
      kast: row.rounds > 0 ? round(row.kastRounds / row.rounds * 100, 1) : null,
      kpr: row.rounds > 0 ? round(row.kills / row.rounds, 3) : null,
      dpr: row.rounds > 0 ? round(row.deaths / row.rounds, 3) : null
    })).sort((a, b) => (b.rr ?? 0) - (a.rr ?? 0));
    const totalWeaponKills = [...weaponKills.values()].reduce((sum, value) => sum + value, 0);
    return {
      teamName: name,
      matchCount: matches.length,
      players,
      weaponPreference: [...weaponKills.entries()]
        .map(([weapon, kills]) => ({ weapon, label: displayWeaponName(weapon), kills, sharePercent: totalWeaponKills > 0 ? round(kills / totalWeaponKills * 100, 1) : 0 }))
        .sort((a, b) => b.kills - a.kills)
        .slice(0, 8),
      economyWinRate: [...economy.entries()]
        .map(([economyType, cell]) => ({ economyType, rounds: cell.rounds, wins: cell.wins, winRatePercent: cell.rounds > 0 ? round(cell.wins / cell.rounds * 100, 1) : null }))
        .sort((a, b) => a.economyType.localeCompare(b.economyType)),
      matches
    };
  }) as [TeamComparisonSide, TeamComparisonSide];
  const radar = [
    { metric: "rr", label: "RR", a: averageNullable(sides[0].players.map((row) => row.rr)), b: averageNullable(sides[1].players.map((row) => row.rr)) },
    { metric: "adr", label: "ADR", a: averageNullable(sides[0].players.map((row) => row.adr)), b: averageNullable(sides[1].players.map((row) => row.adr)) },
    { metric: "kast", label: "KAST", a: averageNullable(sides[0].players.map((row) => row.kast)), b: averageNullable(sides[1].players.map((row) => row.kast)) },
    { metric: "kpr", label: "KPR", a: averageNullable(sides[0].players.map((row) => row.kpr)), b: averageNullable(sides[1].players.map((row) => row.kpr)) },
    { metric: "dpr", label: "DPR", a: averageNullable(sides[0].players.map((row) => row.dpr)), b: averageNullable(sides[1].players.map((row) => row.dpr)) }
  ].map((row) => ({ ...row, delta: row.a != null && row.b != null ? round(row.a - row.b, 2) : null }));
  return { version: "cs2-demo-analysis-kit/team-comparison-0.2", teams: sides, radar, availableTeams };
}

export function buildTeamComparison(
  inputs: TeamComparisonInput[],
  requestedPair?: [string, string]
): TeamComparisonModel {
  return buildTeamComparisonFromFacts(inputs.map(extractTeamComparisonFacts), requestedPair);
}

export function buildTeamOverviewFromFacts(inputs: TeamComparisonFacts[], teamName: string): TeamOverviewModel | null {
  const opponent = inputs
    .flatMap((input) => [input.teams.teamA, input.teams.teamB])
    .find((name) => name !== teamName);
  if (!opponent) return null;
  const comparison = buildTeamComparisonFromFacts(inputs, [teamName, opponent]);
  const side = comparison.teams.find((row) => row.teamName === teamName);
  if (!side) return null;

  const maps = new Map<string, { mapName: string; matches: number; wins: number; losses: number; roundsWon: number; roundsLost: number }>();
  let roundsWon = 0;
  let roundsLost = 0;
  for (const match of side.matches) {
    const row = maps.get(match.mapName) ?? { mapName: match.mapName, matches: 0, wins: 0, losses: 0, roundsWon: 0, roundsLost: 0 };
    row.matches += 1;
    row.wins += match.won ? 1 : 0;
    row.losses += match.won ? 0 : 1;
    row.roundsWon += match.roundsWon;
    row.roundsLost += match.roundsLost;
    roundsWon += match.roundsWon;
    roundsLost += match.roundsLost;
    maps.set(match.mapName, row);
  }
  return {
    version: "cs2-demo-analysis-kit/team-overview-0.1",
    teamName,
    matchCount: side.matchCount,
    wins: side.matches.filter((match) => match.won).length,
    losses: side.matches.filter((match) => !match.won).length,
    roundsWon,
    roundsLost,
    maps: [...maps.values()].sort((a, b) => b.matches - a.matches || a.mapName.localeCompare(b.mapName)),
    roster: side.players,
    weaponPreference: side.weaponPreference,
    economyWinRate: side.economyWinRate,
    matches: side.matches,
  };
}

function killWeaponLabel(weapon: string): string {
  return weapon.toLowerCase().replace(/^weapon_/, "");
}
