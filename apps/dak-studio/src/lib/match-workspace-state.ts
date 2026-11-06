import { matchesQuickRound, type QuickRoundFilter } from './match-review';
import {
  createReplayViewState,
  normalizeReplayViewState,
  type MatchWorkspaceModel,
  type ReplayViewState,
} from '@cs2dak/presentation';
type RoundModel = MatchWorkspaceModel['rounds'][number];
export interface MatchRoundFilterState {
  winnerSide: 'all' | 'ct' | 't';
  economy: 'all' | 'pistol' | 'eco' | 'semi' | 'force' | 'full';
  bombSite: 'all' | 'a' | 'b' | 'none';
  endReason: string; // "all" 或具体 endReason
  firstKill: 'all' | 'teamA' | 'teamB';
  special: { clutch: boolean; multiKill: boolean; wallbang: boolean; smoke: boolean };
  playerSteamId64: string; // "" = 全部；匹配该选手有击杀/首杀/残局的回合
}

export const ROUND_FILTER_DEFAULT: MatchRoundFilterState = {
  winnerSide: 'all',
  economy: 'all',
  bombSite: 'all',
  endReason: 'all',
  firstKill: 'all',
  special: { clutch: false, multiKill: false, wallbang: false, smoke: false },
  playerSteamId64: '',
};

export function roundMatchesFilter(round: RoundModel, filter: MatchRoundFilterState): boolean {
  if (filter.winnerSide !== 'all' && round.winnerSide !== filter.winnerSide) return false;
  if (
    filter.economy !== 'all' &&
    round.teamAEconomy !== filter.economy &&
    round.teamBEconomy !== filter.economy
  )
    return false;
  if (filter.endReason !== 'all' && round.endReason !== filter.endReason) return false;
  const facets = round.facets;
  if (filter.bombSite !== 'all') {
    if (!facets) return false;
    if (filter.bombSite === 'none' ? facets.bombSite !== null : facets.bombSite !== filter.bombSite)
      return false;
  }
  if (filter.firstKill !== 'all' && facets?.firstKillTeamKey !== filter.firstKill) return false;
  if (filter.special.clutch && !facets?.clutch) return false;
  if (filter.special.multiKill && (facets?.maxKillsByOnePlayer ?? 0) < 3) return false;
  if (filter.special.wallbang && (facets?.wallbangKills ?? 0) === 0) return false;
  if (filter.special.smoke && (facets?.throughSmokeKills ?? 0) === 0) return false;
  if (filter.playerSteamId64) {
    const fact = round.playerFacts.find((f) => f.steamId64 === filter.playerSteamId64);
    const involved = !!fact && (fact.kills > 0 || fact.openingDuel !== 'none' || !fact.survived);
    const isClutcher = facets?.clutch?.steamId64 === filter.playerSteamId64;
    if (!involved && !isClutcher) return false;
  }
  return true;
}

export interface MatchWorkspaceState {
  view: 'overview' | 'rounds' | 'players' | 'economy' | 'weapons' | 'duels' | 'map' | 'replay';
  playerPanelSteamId64: string | null;
  reviewPlayerSteamId64: string | null;
  quickRoundFilter: QuickRoundFilter;
  roundExplorer: {
    filter: MatchRoundFilterState;
    selectedRoundNumber: number | null;
    showAllEvents: boolean;
  };
  mapLayer: 'death' | 'kill' | 'grenade';
  replay: ReplayViewState | null;
}
/** 证据目标必须有可播放的帧，不能让普通初始化的首回合回退冒充目标。 */
export function replayStateForRound(
  model: MatchWorkspaceModel,
  previous: ReplayViewState | null,
  roundNumber: number,
  tick?: number,
): ReplayViewState | null {
  const round = model.replay.rounds.find((item) => item.roundNumber === roundNumber);
  if (
    !model.replay.available ||
    !round ||
    !Number.isFinite(round.frameCount) ||
    round.frameCount <= 0
  )
    return null;
  const base = previous ?? createReplayViewState(model.replay, model.map.view);
  if (!base) return null;
  const result = normalizeReplayViewState(model.replay, model.map.view, {
    ...base,
    roundNumber,
    tick: tick ?? round.freezeEndTick,
    playing: false,
  });
  return result?.roundNumber === roundNumber ? result : null;
}

export function createMatchWorkspaceState(model: MatchWorkspaceModel): MatchWorkspaceState {
  return normalizeMatchWorkspaceState(model, {
    view: 'overview',
    playerPanelSteamId64: null,
    reviewPlayerSteamId64: null,
    quickRoundFilter: 'all',
    roundExplorer: {
      filter: { ...ROUND_FILTER_DEFAULT, special: { ...ROUND_FILTER_DEFAULT.special } },
      selectedRoundNumber: null,
      showAllEvents: false,
    },
    mapLayer: 'death',
    replay: createReplayViewState(model.replay, model.map.view),
  });
}
export function normalizeMatchWorkspaceState(
  model: MatchWorkspaceModel,
  state: MatchWorkspaceState,
): MatchWorkspaceState {
  const reviewPlayerSteamId64 = model.players.some(
    (p) => p.row.steamId64 === state.reviewPlayerSteamId64,
  )
    ? state.reviewPlayerSteamId64
    : null;
  const quickRoundFilter =
    !reviewPlayerSteamId64 &&
    (state.quickRoundFilter === 'first-death' || state.quickRoundFilter === 'utility')
      ? 'all'
      : (state.quickRoundFilter ?? 'all');
  const rounds = model.rounds.filter(
    (r) =>
      roundMatchesFilter(r, state.roundExplorer.filter) &&
      matchesQuickRound(r, quickRoundFilter, reviewPlayerSteamId64),
  );
  const selectedRoundNumber = rounds.some(
    (r) => r.roundNumber === state.roundExplorer.selectedRoundNumber,
  )
    ? state.roundExplorer.selectedRoundNumber
    : (rounds[0]?.roundNumber ?? null);
  const layers = model.map.modes.filter(
    (m) => m.key === 'death' || m.key === 'kill' || m.key === 'grenade',
  );
  const mapLayer = layers.some((m) => m.key === state.mapLayer)
    ? state.mapLayer
    : ((layers[0]?.key as MatchWorkspaceState['mapLayer'] | undefined) ?? 'death');
  return {
    ...state,
    reviewPlayerSteamId64,
    quickRoundFilter,
    playerPanelSteamId64: model.players.some((p) => p.row.steamId64 === state.playerPanelSteamId64)
      ? state.playerPanelSteamId64
      : (model.players[0]?.row.steamId64 ?? null),
    roundExplorer: { ...state.roundExplorer, selectedRoundNumber },
    mapLayer,
    replay: normalizeReplayViewState(model.replay, model.map.view, state.replay),
  };
}
export function snapshotMatchWorkspaceState(state: MatchWorkspaceState): MatchWorkspaceState {
  return {
    ...state,
    roundExplorer: {
      ...state.roundExplorer,
      filter: { ...state.roundExplorer.filter, special: { ...state.roundExplorer.filter.special } },
    },
    replay: state.replay
      ? { ...state.replay, layers: { ...state.replay.layers }, playing: false }
      : null,
  };
}
