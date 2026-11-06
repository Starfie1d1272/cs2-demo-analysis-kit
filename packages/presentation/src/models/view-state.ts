import { getMapCalibration, hasLowerLevel } from '@cs2dak/maps/calibration';
import type { MapView } from './summary.js';
import type { WorkspaceReplay } from './workspace.js';

export interface TableSortState {
  key: string | null;
  direction: 'asc' | 'desc';
}
export interface TableState {
  sort: TableSortState;
  page: number;
}
export interface ReplayViewState {
  roundNumber: number;
  tick: number;
  playing: boolean;
  speed: 0.5 | 1 | 2 | 4;
  layers: { trace: boolean; killLines: boolean; grenades: boolean };
  level: 'upper' | 'lower';
}

export function normalizeTableState(
  state: TableState,
  input: { sortableKeys: readonly string[]; totalRows: number; pageSize?: number },
): TableState {
  const size = input.pageSize;
  const pages =
    size != null && Number.isFinite(size) && size > 0 && Number.isFinite(input.totalRows)
      ? Math.max(1, Math.ceil(Math.max(0, input.totalRows) / size))
      : 1;
  return {
    sort: {
      key:
        state.sort.key != null && input.sortableKeys.includes(state.sort.key)
          ? state.sort.key
          : null,
      direction: state.sort.direction === 'asc' ? 'asc' : 'desc',
    },
    page: Math.max(
      0,
      Math.min(pages - 1, Number.isFinite(state.page) ? Math.trunc(state.page) : 0),
    ),
  };
}

export function createReplayViewState(
  replay: WorkspaceReplay,
  map: MapView,
): ReplayViewState | null {
  return normalizeReplayViewState(replay, map, null);
}

export function normalizeReplayViewState(
  replay: WorkspaceReplay,
  map: MapView,
  state: ReplayViewState | null,
): ReplayViewState | null {
  const rounds = replay.rounds.filter(
    (r) =>
      Number.isFinite(r.roundNumber) &&
      Number.isFinite(r.startTick) &&
      Number.isFinite(r.freezeEndTick) &&
      Number.isFinite(r.tickStep) &&
      r.tickStep > 0 &&
      Number.isFinite(r.frameCount) &&
      r.frameCount > 0,
  );
  if (!replay.available || !rounds.length) return null;
  const round = rounds.find((r) => r.roundNumber === state?.roundNumber) ?? rounds[0]!;
  const end = round.targetEndTick ?? round.officialEndTick;
  const last = Math.max(
    round.frameCount - 1,
    end != null && Number.isFinite(end) ? Math.round((end - round.startTick) / round.tickStep) : 0,
  );
  const tick =
    state?.roundNumber === round.roundNumber && Number.isFinite(state.tick)
      ? state.tick
      : round.freezeEndTick;
  const index = Math.max(0, Math.min(last, Math.round((tick - round.startTick) / round.tickStep)));
  const calibration = getMapCalibration(map.name);
  return {
    roundNumber: round.roundNumber,
    tick: round.startTick + index * round.tickStep,
    playing: state?.playing === true,
    speed: state && ([0.5, 1, 2, 4] as number[]).includes(state.speed) ? state.speed : 1,
    layers: {
      trace: state?.layers?.trace === true,
      killLines: state?.layers?.killLines ?? true,
      grenades: state?.layers?.grenades ?? true,
    },
    level:
      state?.level === 'lower' &&
      !!map.lowerRadarImageUrl &&
      !!calibration &&
      hasLowerLevel(calibration)
        ? 'lower'
        : 'upper',
  };
}
