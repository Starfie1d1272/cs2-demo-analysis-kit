import type { BracketCell, ElimModel, EventStage, SwissColumn, SwissModel } from "@cs2dak/contract";
import type { StudioSeriesRecord } from "./series";

// 类型 BracketCell / SwissModel / ElimModel 等已下沉至 @cs2dak/contract，
// 本文件仅保留 Studio 侧模型推导函数（依赖 StudioSeriesRecord）。

function winnerOf(scoreA: number | null, scoreB: number | null, finished: boolean): "A" | "B" | null {
  if (!finished || scoreA == null || scoreB == null || scoreA === scoreB) return null;
  return scoreA > scoreB ? "A" : "B";
}

function cellFromSeries(row: StudioSeriesRecord): BracketCell {
  const finished = row.status === "finished";
  return {
    key: row.id,
    teamA: row.teamAName,
    teamB: row.teamBName,
    scoreA: row.scoreA ?? null,
    scoreB: row.scoreB ?? null,
    winner: winnerOf(row.scoreA ?? null, row.scoreB ?? null, finished),
    date: row.completedAt ?? row.scheduledAt ?? null,
    entryIds: row.entryIds,
  };
}

function parseRecord(record: string): { w: number; l: number } {
  const [w, l] = record.split("-").map((value) => Number(value) || 0);
  return { w: w ?? 0, l: l ?? 0 };
}

/**
 * 从瑞士轮各场结果推算 Buchholz 战绩图：按轮次顺序累积每队 W-L，每场归入"赛前战绩组"，
 * 达 winsTarget 晋级 / 达 lossTarget 淘汰。无需赛事包预存 record，旧包也能直接显示。
 */
export function swissModelFromResults(
  series: StudioSeriesRecord[],
  winsTargetArg?: number,
  lossTargetArg?: number,
): SwissModel {
  const sorted = [...series].sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  const rec = new Map<string, { w: number; l: number }>();
  const get = (team: string) => rec.get(team) ?? { w: 0, l: 0 };
  const columns = new Map<number, Map<string, BracketCell[]>>();

  for (const row of sorted) {
    const round = row.round ?? 0;
    const before = row.teamARecordBefore ?? `${get(row.teamAName).w}-${get(row.teamAName).l}`;
    const cell = cellFromSeries(row);
    const col = columns.get(round) ?? new Map<string, BracketCell[]>();
    (col.get(before) ?? col.set(before, []).get(before)!).push(cell);
    columns.set(round, col);
    if (cell.winner) {
      const [winName, loseName] = cell.winner === "A" ? [row.teamAName, row.teamBName] : [row.teamBName, row.teamAName];
      const win = get(winName); rec.set(winName, { w: win.w + 1, l: win.l });
      const lose = get(loseName); rec.set(loseName, { w: lose.w, l: lose.l + 1 });
    }
  }

  // 战绩完整的赛事里，晋级队的胜场 = 进线门槛、淘汰队的负场 = 出局门槛，
  // 即各队最大胜/负场。未显式传入时按此自动推算（Major 通常 3 胜进 / 3 负汰）。
  const records = [...rec.values()];
  const winsTarget = winsTargetArg ?? Math.max(1, ...records.map((r) => r.w));
  const lossTarget = lossTargetArg ?? Math.max(1, ...records.map((r) => r.l));
  const advanced: { team: string; record: string }[] = [];
  const eliminated: { team: string; record: string }[] = [];
  for (const [team, { w, l }] of rec) {
    if (w >= winsTarget) advanced.push({ team, record: `${w}-${l}` });
    else if (l >= lossTarget) eliminated.push({ team, record: `${w}-${l}` });
  }
  advanced.sort((a, b) => parseRecord(a.record).l - parseRecord(b.record).l || a.team.localeCompare(b.team));
  eliminated.sort((a, b) => parseRecord(b.record).w - parseRecord(a.record).w || a.team.localeCompare(b.team));

  const cols: SwissColumn[] = [...columns.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, groups]) => ({
      round,
      groups: [...groups.entries()]
        .map(([record, matches]) => ({ record, matches }))
        .sort((a, b) => parseRecord(b.record).w - parseRecord(a.record).w || parseRecord(a.record).l - parseRecord(b.record).l),
    }));

  return { columns: cols, advanced, eliminated, winsTarget, lossTarget };
}

const ELIM_ROUND_LABEL = (round: number, total: number): string =>
  round === total ? "决赛" : round === total - 1 ? "半决赛" : round === total - 2 ? "四分之一决赛" : `第 ${round} 轮`;

/**
 * 淘汰赛 bracket：有 bracketNodes 用节点轮次/标签；否则从 series 的 round 推算列（决赛 / 半决赛 …）。
 */
export function elimModelFromResults(series: StudioSeriesRecord[], stage: EventStage): ElimModel {
  const nodes = stage.bracketNodes ?? [];
  if (nodes.length > 0) {
    const rounds = [...new Set(nodes.map((node) => node.round))].sort((a, b) => a - b);
    const byNode = new Map(series.filter((row) => row.bracketNodeId).map((row) => [row.bracketNodeId!, row]));
    return {
      columns: rounds.map((round) => ({
        round,
        label: nodes.find((node) => node.round === round)?.label?.replace(/\s*\d+$/, "") ?? `第 ${round} 轮`,
        matches: nodes.filter((node) => node.round === round).map((node) => {
          const row = byNode.get(node.id);
          return row ? cellFromSeries(row) : { key: node.id, teamA: null, teamB: null, scoreA: null, scoreB: null, winner: null, date: null };
        }),
      })),
    };
  }
  const rounds = [...new Set(series.map((row) => row.round ?? 1))].sort((a, b) => a - b);
  const total = rounds.length;
  return {
    columns: rounds.map((round, index) => ({
      round,
      label: ELIM_ROUND_LABEL(index + 1, total),
      matches: series.filter((row) => (row.round ?? 1) === round).map(cellFromSeries),
    })),
  };
}
