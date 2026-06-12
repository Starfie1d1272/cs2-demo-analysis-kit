import type { DemoPackage, PackagePlayer, PackageRound, Side, TeamKey } from "@cs2dak/contract";

/**
 * v3 基础设施：playerIndex → player 解析与 per-round side 推导。
 * 所有下游模块统一经此层取 player / side，禁止散落的 steamId64 查找。
 */
export interface PlayerResolver {
  /** players.json 原始行序（playerIndex 的真相源） */
  readonly players: readonly PackagePlayer[];
  byIndex(index: number): PackagePlayer;
  byIndexOrNull(index: number | null | undefined): PackagePlayer | null;
  /** 同一局内 steamId64 → playerIndex（cohort 身份归并入口用） */
  indexOfSteamId(steamId64: string): number | null;
  /** 玩家在指定回合所处 side（由 teamKey + rounds.teamASide/BSide 推导） */
  sideOf(playerIndex: number, roundNumber: number): Side;
  /** 指定回合某 teamKey 的 side */
  teamSideOf(teamKey: TeamKey, roundNumber: number): Side;
}

export function createPlayerResolver(
  players: readonly PackagePlayer[],
  rounds: readonly PackageRound[]
): PlayerResolver {
  const steamIdToIndex = new Map<string, number>();
  players.forEach((p, i) => {
    if (!steamIdToIndex.has(p.steamId64)) steamIdToIndex.set(p.steamId64, i);
  });
  const roundByNumber = new Map<number, PackageRound>();
  for (const r of rounds) roundByNumber.set(r.roundNumber, r);

  const requireRound = (roundNumber: number): PackageRound => {
    const round = roundByNumber.get(roundNumber);
    if (!round) throw new Error(`Unknown roundNumber ${roundNumber}`);
    return round;
  };

  const byIndex = (index: number): PackagePlayer => {
    const player = players[index];
    if (!player) throw new Error(`playerIndex ${index} out of range (players=${players.length})`);
    return player;
  };

  const teamSideOf = (teamKey: TeamKey, roundNumber: number): Side => {
    const round = requireRound(roundNumber);
    return teamKey === "teamA" ? round.teamASide : round.teamBSide;
  };

  return {
    players,
    byIndex,
    byIndexOrNull: (index) => (index === null || index === undefined ? null : byIndex(index)),
    indexOfSteamId: (steamId64) => steamIdToIndex.get(steamId64) ?? null,
    sideOf: (playerIndex, roundNumber) => teamSideOf(byIndex(playerIndex).teamKey, roundNumber),
    teamSideOf,
  };
}

export function createResolverFromPackage(pkg: DemoPackage): PlayerResolver {
  return createPlayerResolver(pkg.players, pkg.rounds);
}
