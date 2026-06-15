import type { DemoPackage } from "@cs2dak/contract";

/**
 * Demo 元数据：与 facts 一样可在 worker 内从 DemoPackage 计算，
 * 故抽到无存储依赖的共享模块（worker 与主线程都 import，不拖入 ./storage）。
 */
export interface DemoMeta {
  mapName: string;
  teamAName: string;
  teamBName: string;
  teamAScore: number;
  teamBScore: number;
  roundCount: number;
  durationSeconds: number;
  playerCount: number;
  hasReplay: boolean;
  source: string;
  /** 服务器名（来自 cs2-demo-format match.serverName）；旧条目/无值为 null。 */
  serverName: string | null;
}

export function metaFromPackage(pkg: DemoPackage): DemoMeta {
  return {
    mapName: pkg.match.mapName,
    teamAName: pkg.match.teamA.name ?? "Team A",
    teamBName: pkg.match.teamB.name ?? "Team B",
    teamAScore: pkg.match.teamA.score,
    teamBScore: pkg.match.teamB.score,
    roundCount: pkg.rounds.length,
    durationSeconds: pkg.match.durationSeconds,
    playerCount: pkg.players.length,
    hasReplay: Boolean(pkg.replay),
    source: pkg.match.source,
    serverName: pkg.match.serverName ?? null
  };
}
