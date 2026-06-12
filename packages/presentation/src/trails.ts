import {
  decodeDelta,
  openingTrailsModelSchema,
  type DemoPackage,
  type OpeningTrailRound,
  type OpeningTrailsModel
} from "@cs2dak/contract";
import { normalizeDemoPackage } from "@cs2dak/core";
import { nameForSteamId } from "./workspace-utils.js";

type TrailEconomy = OpeningTrailRound["economyType"];

export interface OpeningTrailsOptions {
  /** 开局窗口秒数，默认 30。 */
  windowSeconds?: number;
  /** 纳入的经济类型，默认 ["full"]（长枪局）。 */
  economyTypes?: TrailEconomy[];
}

/**
 * 提取单选手在指定经济类型回合开局窗口内的走位轨迹与道具投掷。
 * 轨迹来自 replay.json（8Hz），道具来自 grenades.json，回合边界与经济来自 rounds.json。
 * 输出 world 坐标；radar 投影由渲染端用 @cs2dak/maps 完成。
 */
export function buildOpeningTrails(
  input: unknown,
  matchId: string,
  steamId64: string,
  opts: OpeningTrailsOptions = {}
): OpeningTrailsModel {
  const pkg = normalizeDemoPackage(input) as DemoPackage;
  const windowSeconds = opts.windowSeconds ?? 30;
  const economyTypes = opts.economyTypes ?? ["full"];
  const playerName = nameForSteamId(pkg, steamId64) ?? steamId64;

  const base = {
    version: "cs2-demo-analysis-kit/opening-trails-0.2" as const,
    matchId,
    mapName: pkg.match.mapName,
    steamId64,
    playerName,
    windowSeconds
  };

  const replay = pkg.replay;
  if (!replay) {
    return openingTrailsModelSchema.parse({ ...base, available: false, rounds: [] });
  }

  const tickrate = replay.meta.tickrate;
  const roundRowByNumber = new Map(pkg.rounds.map((row) => [row.roundNumber, row]));

  const rounds = replay.rounds.flatMap((replayRound) => {
    const roundRow = roundRowByNumber.get(replayRound.roundNumber);
    const player = replayRound.players.find((p) => {
      const playerRow = pkg.players[p.playerIndex];
      return playerRow?.steamId64 === steamId64;
    });
    if (!roundRow || !player) return [];

    const playerRow = pkg.players[player.playerIndex];
    if (!playerRow) return [];
    const economyType = playerRow.teamKey === "teamA" ? roundRow.teamAEconomy : roundRow.teamBEconomy;
    if (!economyTypes.includes(economyType)) return [];

    const windowStart = roundRow.freezeEndTick;
    const windowEnd = windowStart + windowSeconds * tickrate;

    const points: { t: number; x: number; y: number }[] = [];
    const xs = decodeDelta(player.x);
    const ys = decodeDelta(player.y);
    const coordScale = replay.meta.coordScale;
    for (let index = 0; index < replayRound.frameCount; index += 1) {
      const tick = replayRound.startTick + index * replayRound.tickStep;
      if (tick < windowStart || tick > windowEnd) continue;
      const alive = ((player.flags[index] ?? 0) & 1) !== 0;
      if (!alive) break; // 阵亡即终止轨迹
      points.push({
        t: (tick - windowStart) / tickrate,
        x: (xs[index] ?? 0) * coordScale,
        y: (ys[index] ?? 0) * coordScale,
      });
    }
    if (points.length === 0) return [];

    const grenades = pkg.grenades
      .filter(
        (row) =>
          row.roundNumber === replayRound.roundNumber &&
          (pkg.players[row.throwerIndex]?.steamId64 ?? null) === steamId64 &&
          row.throwTick >= windowStart &&
          row.throwTick <= windowEnd
      )
      .map((row) => ({
        t: (row.throwTick - windowStart) / tickrate,
        x: row.throwPosition.x,
        y: row.throwPosition.y,
        grenade: row.grenade,
        effectT: Math.max(0, (row.effectTick - windowStart) / tickrate),
        destroyT: row.destroyTick == null ? null : Math.max(0, (row.destroyTick - windowStart) / tickrate),
        effectX: row.effectPosition.x,
        effectY: row.effectPosition.y
      }))
      .sort((a, b) => a.t - b.t);

    return [
      {
        matchId,
        roundNumber: replayRound.roundNumber,
        side: playerRow.teamKey === "teamA" ? roundRow.teamASide : roundRow.teamBSide,
        economyType,
        points,
        grenades
      }
    ];
  });

  return openingTrailsModelSchema.parse({ ...base, available: true, rounds });
}
