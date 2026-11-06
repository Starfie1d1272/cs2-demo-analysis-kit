import { withStoredAnalysis } from '../lib/queries/query-cache';
import {
  canExportSnapshot,
  withCapabilityConditions,
  withAnalysisExportEntries as applyExportEntries,
} from '../lib/analysis-export';
import { AnalysisExportButtons } from '../components/AnalysisExportButtons';
import { buildOpeningAnalysisResult } from '../lib/analysis-export-spatial';
import type { AnalysisExportSource } from '../lib/analysis-export';
import {
  OPENING_WINDOW_SECONDS,
  OPENING_SPEEDS,
  OPENING_OPACITY_MIN,
  OPENING_OPACITY_MAX,
} from '../lib/spatial-view-state';
import { CapabilityBar, useCapability } from '../components/CapabilityBar';
import type { CapabilityRepairAction } from '../lib/capability-availability';
import {
  getAnalysisDataSnapshot,
  subscribeAnalysisDataInvalidation,
  assertAnalysisGeneration,
} from '../lib/queries/query-cache';
import { type OpeningPageState } from '../lib/spatial-view-state';
import { usePageReady } from '../lib/use-page-ready';
import { Pause, Play, RotateCcw } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { OpeningTrailsModel, OpeningTrailRound } from '@cs2dak/tactics';
import {
  RadarTrails,
  GRENADE_COLOR,
  type RadarTrail,
  type RadarGrenadeOverlay,
} from '../components/RadarTrails';
import { entryDate, matchIdForEntry, type StudioDemoEntry } from '../lib/demo-entry';
import type { IdentityOptions } from '../lib/identity';
import { getFactsStore } from '../lib/facts-store';
import { getAnalysisTeamSlots } from '../lib/queries/team-scope';
import { getDerivedCacheStore } from '../lib/derived-cache';
import { EmptyState } from '@cs2dak/react';

/**
 * 开局动线：选手在长枪局开局前 N 秒的走位 + 道具投掷叠加动画。
 * 数据由 @cs2dak/analytics buildOpeningTrails 派生，本视图只做投影与播放。
 */

export interface TrailsViewProps {
  onCapabilityRepair: (action: CapabilityRepairAction) => void;
  exportSource?: AnalysisExportSource | null;
  onPageReady?: (keys: string[]) => void;
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  onGoLibrary: () => void;
  onEditScope: () => void;
  onOpenMatch?: (
    entryId: string,
    target: { matchId: string; roundNumber: number },
    rounds: OpeningTrailRound[],
  ) => void;
  identityOptions?: IdentityOptions;
  focusPlayerKey: string | null;
  selectedTeams?: string[];
  onSelectPlayer: (playerKey: string, label: string) => void;
  state: OpeningPageState;
  onStateChange: Dispatch<SetStateAction<OpeningPageState>>;
}

const WINDOW_SECONDS = OPENING_WINDOW_SECONDS;
const RANGE_OPTIONS = [3, 5, 10, 0] as const; // 0 = 全部

interface PlayerOption {
  /** identity 归并后的稳定 key（未归并者为 steam:${steamId}）。 */
  playerKey: string;
  name: string;
  /** 归并到此选手的全部 steamId（一人多账号）。 */
  steamIds: string[];
  matchCount: number;
}

const GRENADE_LABEL: Record<string, string> = {
  flashbang: '闪光',
  smoke: '烟雾',
  molotov: '燃烧瓶',
  incendiary: '燃烧弹',
  hegrenade: '高爆',
  decoy: '诱饵',
};

function trailColor(index: number): string {
  return `hsl(${(index * 47) % 360} 75% 60%)`;
}

/** destroyT 缺失时的保底效果时长（秒）。 */
const EFFECT_DURATION_SECONDS: Partial<Record<string, number>> = {
  smoke: 18,
  molotov: 7,
  incendiary: 7,
  hegrenade: 0.7,
  flashbang: 0.7,
  decoy: 15,
};

export function TrailsView({
  exportSource,
  onCapabilityRepair,
  allEntries,
  entries,
  onGoLibrary,
  onEditScope,
  onOpenMatch,
  identityOptions,
  onPageReady,
  focusPlayerKey,
  selectedTeams = [],
  onSelectPlayer,
  state: pageState,
  onStateChange: setPageState,
}: TrailsViewProps) {
  // 业务流程：① 选手 → ② 地图（该选手出场的图）→ ③ 最近 N 场（该选手在该图）
  const { recentMatchCount: rangeN, mapName, side } = pageState;
  const hiddenRounds = useMemo(
    () => new Set(pageState.hiddenRoundKeys),
    [pageState.hiddenRoundKeys],
  );
  const setRangeN = (recentMatchCount: OpeningPageState['recentMatchCount']) =>
    setPageState((current) => ({ ...current, recentMatchCount }));
  const setSide = (side: OpeningPageState['side']) =>
    setPageState((current) => ({ ...current, side }));
  const setMapName = (update: SetStateAction<string | null>) =>
    setPageState((current) => ({
      ...current,
      mapName: typeof update === 'function' ? update(current.mapName) : update,
    }));
  const selectedKey = focusPlayerKey;
  const [rosterSnapshot, setRosterSnapshot] = useState<{
    key: string;
    players: PlayerOption[];
    roster: Map<string, Set<string>>;
  } | null>(null);
  const rosterKey = JSON.stringify([
    entries.map((entry) => entry.id),
    identityOptions?.version,
    selectedTeams,
  ]);
  const players = rosterSnapshot?.key === rosterKey ? rosterSnapshot.players : null;
  const rosterByEntry = rosterSnapshot?.key === rosterKey ? rosterSnapshot.roster : null;
  const [modelSnapshot, setModelSnapshot] = useState<{
    key: string;
    generation: number;
    value: OpeningTrailsModel[];
  } | null>(null);
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const [error, setError] = useState<string | null>(null);

  // ① 加载范围内全部 DemoPackage，建立选手候选与每场名单（derived 缓存命中后开销很小）
  useEffect(() => {
    if (entries.length === 0) {
      return;
    }
    if (analysis.status !== 'ready') return;
    let cancelled = false;
    setError(null);
    // identity 归并：把每个 steamId 解析到稳定 playerKey + 显示名（未归并者各自成键）。
    const idMap = identityOptions?.map ?? {};
    const resolve = (steamId: string, name: string): { playerKey: string; displayName: string } => {
      const found = idMap[steamId];
      if (found && typeof found === 'object')
        return { playerKey: found.playerKey, displayName: found.displayName ?? name };
      if (typeof found === 'string') return { playerKey: found, displayName: name };
      return { playerKey: `steam:${steamId}`, displayName: name };
    };
    withStoredAnalysis(entries, async () => {
      const [rows, allowed] = await Promise.all([
        getFactsStore().getPlayerMatchStats({ matchIds: entries.map(matchIdForEntry) }),
        getAnalysisTeamSlots(entries, identityOptions, selectedTeams),
      ]);
      return rows.filter((row) => !allowed || allowed.get(row.matchId)?.has(row.teamKey));
    })
      .then(async (rows) => {
        if (cancelled) return;
        const counts = new Map<string, PlayerOption>();
        const roster = new Map<string, Set<string>>();
        for (const row of rows) {
          const entry = entries.find((candidate) => matchIdForEntry(candidate) === row.matchId);
          if (!entry) continue;
          const keys = new Set<string>();
          const { playerKey, displayName } = resolve(row.steamId64, row.playerName);
          const current = counts.get(playerKey);
          if (current) {
            if (!current.steamIds.includes(row.steamId64)) current.steamIds.push(row.steamId64);
            if (!keys.has(playerKey)) current.matchCount += 1;
          } else {
            counts.set(playerKey, {
              playerKey,
              name: displayName,
              steamIds: [row.steamId64],
              matchCount: 1,
            });
          }
          keys.add(playerKey);
          roster.set(entry.id, new Set([...(roster.get(entry.id) ?? []), ...keys]));
        }
        const options = [...counts.values()].sort(
          (a, b) => b.matchCount - a.matchCount || a.name.localeCompare(b.name),
        );
        if (cancelled) return;
        assertAnalysisGeneration(analysis.generation);
        setRosterSnapshot({ key: rosterKey, players: options, roster });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries, identityOptions?.version, focusPlayerKey, rosterKey, analysis]);

  // 已知日期优先，未知日期稳定排序；文件名或 matchId 不能充当日期。
  const playerEntries = useMemo(() => {
    if (!selectedKey || !rosterByEntry) return [];
    return entries
      .filter((entry) => rosterByEntry.get(entry.id)?.has(selectedKey))
      .sort(
        (a, b) =>
          (entryDate(b) ?? '').localeCompare(entryDate(a) ?? '') || a.id.localeCompare(b.id),
      );
  }, [entries, selectedKey, rosterByEntry]);

  // ② 地图选项 = 该选手出场过的图
  const mapOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of playerEntries) {
      counts.set(entry.meta.mapName, (counts.get(entry.meta.mapName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [playerEntries]);

  useEffect(() => {
    if (!rosterByEntry || !selectedKey || mapOptions.length === 0) return;
    setMapName((current) => current ?? mapOptions[0][0]);
  }, [rosterByEntry, selectedKey, mapOptions]);
  const missingSelectedMap =
    mapName !== null && rosterByEntry !== null && !mapOptions.some(([map]) => map === mapName);

  // ③ 范围 = 该选手在该图的最近 N 场
  const rangeEntries = useMemo(() => {
    if (!mapName) return [];
    const pool = playerEntries.filter((entry) => entry.meta.mapName === mapName);
    return rangeN > 0 ? pool.filter((entry) => entryDate(entry) !== null).slice(0, rangeN) : pool;
  }, [playerEntries, mapName, rangeN]);

  const selectedOption = players?.find((option) => option.playerKey === selectedKey);
  const openingScope = useMemo(
    () =>
      selectedOption
        ? { playerKeys: [selectedOption.playerKey], steamIds: selectedOption.steamIds }
        : undefined,
    [selectedOption],
  );
  const capability = useCapability(rangeEntries, 'opening', openingScope);
  const eligibleEntries = capability.eligible;
  const requestKey = JSON.stringify([eligibleEntries?.map((entry) => entry.id), openingScope]);
  const models = modelSnapshot?.key === requestKey ? modelSnapshot.value : null;
  usePageReady(
    entries.length === 0 ||
      error !== null ||
      (!!selectedOption &&
        rangeEntries.length > 0 &&
        (capability.error !== null || eligibleEntries?.length === 0)) ||
      (players !== null &&
        (!selectedKey ||
          players.length === 0 ||
          mapOptions.length === 0 ||
          (mapName !== null && (rangeEntries.length === 0 || models !== null)))),
    onPageReady,
  );

  // 为选中选手构建各场动线
  useEffect(() => {
    const selected = players?.find((option) => option.playerKey === selectedKey);
    if (!selected || !eligibleEntries || !eligibleEntries.length || analysis.status !== 'ready')
      return;
    let cancelled = false;
    setError(null);
    withStoredAnalysis(eligibleEntries, () =>
      getDerivedCacheStore().getOpeningTrails({
        matchIds: eligibleEntries.map(matchIdForEntry),
        playerKeys: [selected.playerKey],
        steamIds: selected.steamIds,
      }),
    )
      .then((result) => {
        if (cancelled) return;
        assertAnalysisGeneration(analysis.generation);
        setModelSnapshot({
          key: requestKey,
          generation: analysis.generation,
          value: result.map((fact) => fact.row),
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [eligibleEntries, selectedKey, players, requestKey, analysis]);

  const visibleRounds = useMemo(() => {
    if (!models || !mapName) return [];
    return models
      .filter((model) => model.mapName === mapName)
      .flatMap((model) => model.rounds)
      .filter((round) => round.side === side);
  }, [models, mapName, side]);

  const missingReplay = useMemo(
    () => (models ?? []).filter((model) => !model.available).map((model) => model.matchId),
    [models],
  );

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title={mapName ? `${mapName} 在当前资料库没有样本` : '还没有动线数据'}
          hint="开局动线需要含回放流的 v3 ZIP，先导入几场比赛。"
          action={
            <button type="button" className="stu-button" onClick={onGoLibrary}>
              去资料库
            </button>
          }
        />
      </div>
    );
  }

  const selectedPlayer = players?.find((option) => option.playerKey === selectedKey) ?? null;

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>开局动线</h1>
          {exportSource &&
            models &&
            selectedPlayer &&
            !missingSelectedMap &&
            rangeEntries.length > 0 &&
            !error &&
            !capability.error &&
            !capability.stale &&
            canExportSnapshot(modelSnapshot, analysis) && (
              <AnalysisExportButtons
                capture={() =>
                  buildOpeningAnalysisResult(
                    withCapabilityConditions(
                      applyExportEntries(exportSource, eligibleEntries ?? []),
                      capability.availability,
                    ),
                    visibleRounds,
                    selectedPlayer.name,
                    pageState,
                    missingReplay,
                  )
                }
              />
            )}
          <p>
            选手在<b>长枪局</b>开局前 {WINDOW_SECONDS}{' '}
            秒的走位与道具投掷叠加动画——直观看出默认位、出门路线和道具习惯，也可用于学习职业选手的
            default。
          </p>
        </div>
      </header>

      <div className="stu-trail-controls">
        <label>
          <span>① 选手</span>
          <select
            className="stu-select"
            value={selectedKey ?? ''}
            onChange={(e) => {
              const player = players?.find((option) => option.playerKey === e.target.value);
              if (player) onSelectPlayer(player.playerKey, player.name);
            }}
          >
            {selectedKey && !(players ?? []).some((option) => option.playerKey === selectedKey) && (
              <option value={selectedKey}>
                {players || entries.length === 0 ? '当前选手 · 0 场' : '正在读取选手…'}
              </option>
            )}
            {!selectedKey && <option value="">请选择选手</option>}
            {(players ?? []).map((option) => (
              <option key={option.playerKey} value={option.playerKey}>
                {option.name}（{option.matchCount} 场）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>② 地图</span>
          <select
            className="stu-select"
            value={mapName ?? ''}
            onChange={(e) => setMapName(e.target.value || null)}
          >
            {mapName === null && (
              <option value="">
                {rosterByEntry || entries.length === 0 ? '请选择地图' : '正在读取地图…'}
              </option>
            )}
            {mapName !== null && !mapOptions.some(([map]) => map === mapName) && (
              <option value={mapName}>
                {mapName}（{rosterByEntry || entries.length === 0 ? '0 场' : '读取中'}）
              </option>
            )}
            {mapOptions.map(([map, count]) => (
              <option key={map} value={map}>
                {map}（{count} 场）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>③ 范围</span>
          <select
            className="stu-select"
            value={rangeN}
            onChange={(e) =>
              setRangeN(Number(e.target.value) as OpeningPageState['recentMatchCount'])
            }
            title="当前范围内该选手在该地图的最近 N 场；无日期场次仅在全部中显示"
          >
            {RANGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0
                  ? `全部（${mapOptions.find(([map]) => map === mapName)?.[1] ?? 0} 场）`
                  : `最近 ${n} 场`}
              </option>
            ))}
          </select>
        </label>
        <div className="stu-side-toggle" role="radiogroup" aria-label="阵营">
          {(['t', 'ct'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={side === value}
              className={side === value ? 'stu-chip stu-chip-active' : 'stu-chip'}
              onClick={() => setSide(value)}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
        {selectedPlayer && mapName && (
          <span className="stu-dim">
            当前范围 · {selectedPlayer.name} · {mapName} ·{' '}
            {rangeN === 0 ? '全部' : `最近 ${rangeN} 场（仅有日期）`} · {rangeEntries.length} 场
          </span>
        )}
      </div>

      {selectedOption && capability.availability && (
        <CapabilityBar availability={capability.availability} onRepair={onCapabilityRepair} />
      )}
      {capability.error && (
        <p role="alert">
          能力读取失败：{capability.error}{' '}
          <button type="button" className="stu-button-sm" onClick={capability.retry}>
            重试
          </button>
          {capability.availability && ' · 显示旧版本'}
        </p>
      )}
      {models &&
        (error ||
          analysis.status !== 'ready' ||
          modelSnapshot?.generation !== analysis.generation) && (
          <p className="stu-muted" role="status">
            {error || analysis.status === 'error'
              ? '更新失败，显示旧版本结果。'
              : '正在更新，显示旧版本结果。'}
          </p>
        )}
      {entries.length === 0 && !error ? (
        <div className="stu-compact-empty">
          <EmptyState
            variant="insufficient"
            title="聚合范围为空"
            hint="请调整聚合范围。"
            action={
              <button type="button" className="stu-button-sm" onClick={onEditScope}>
                调整范围
              </button>
            }
          />
        </div>
      ) : capability.error && !models ? null : error && !models ? (
        <EmptyState variant="error" title="构建失败" hint={error} />
      ) : players && missingSelectedMap ? (
        <EmptyState
          variant="insufficient"
          title={`${mapName} 在当前范围没有该选手的样本`}
          hint="请选择其他地图，或调整范围以恢复该地图的比赛。"
        />
      ) : players && !selectedOption ? (
        <div className="stu-compact-empty">
          <EmptyState
            variant="insufficient"
            title="请选择选手"
            hint="选择选手和地图后查看开局动线。"
          />
        </div>
      ) : players &&
        rangeEntries.length > 0 &&
        eligibleEntries?.length === 0 &&
        !models ? null : players && rangeEntries.length === 0 ? (
        <div className="stu-compact-empty">
          <EmptyState
            variant="insufficient"
            title="当前条件没有比赛样本"
            hint="最近场次只包含有日期的比赛；可选择全部场次或调整选手、地图与范围。"
          />
        </div>
      ) : !models || !players ? (
        <div className="stu-loading">提取 {rangeEntries.length} 场回放轨迹…</div>
      ) : visibleRounds.length === 0 ? (
        <EmptyState
          variant="insufficient"
          title="没有可叠加的回合"
          hint={
            <>
              {mapName
                ? `${selectedPlayer?.name ?? '该选手'} 在 ${mapName} 的 ${side.toUpperCase()} 方没有含回放的长枪局。试试切换阵营、地图或扩大范围。`
                : '该范围内没有含回放流的长枪局。'}
              {missingReplay.length > 0 && ` 注意：${missingReplay.join('、')} 不含回放流。`}
            </>
          }
        />
      ) : (
        <TrailStage
          key={`${mapName}-${side}-${selectedKey}-${visibleRounds.length}`}
          mapName={mapName!}
          rounds={visibleRounds}
          hiddenRounds={hiddenRounds}
          pageState={pageState}
          onPageStateChange={setPageState}
          onToggleRound={(roundKey) =>
            setPageState((current) => ({
              ...current,
              hiddenRoundKeys: current.hiddenRoundKeys.includes(roundKey)
                ? current.hiddenRoundKeys.filter((key) => key !== roundKey)
                : [...current.hiddenRoundKeys, roundKey],
            }))
          }
          missingReplay={missingReplay}
          onOpenRound={
            onOpenMatch
              ? (round) => {
                  const entry = entries.find(
                    (candidate) => matchIdForEntry(candidate) === round.matchId,
                  );
                  if (entry)
                    onOpenMatch(
                      entry.id,
                      { matchId: round.matchId, roundNumber: round.roundNumber },
                      visibleRounds,
                    );
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function roundKeyOf(round: OpeningTrailRound): string {
  return `${round.matchId}#R${round.roundNumber}`;
}

interface TrailStageProps {
  mapName: string;
  rounds: OpeningTrailRound[];
  hiddenRounds: Set<string>;
  onToggleRound: (roundKey: string) => void;
  missingReplay: string[];
  onOpenRound?: (round: OpeningTrailRound) => void;
  pageState: OpeningPageState;
  onPageStateChange: Dispatch<SetStateAction<OpeningPageState>>;
}

function TrailStage({
  mapName,
  rounds,
  hiddenRounds,
  onToggleRound,
  missingReplay,
  onOpenRound,
  pageState,
  onPageStateChange,
}: TrailStageProps) {
  const { timeSeconds: time, speed, trailOpacity, showTrails, showGrenades } = pageState;
  const setTime = (update: SetStateAction<number>) =>
    onPageStateChange((current) => ({
      ...current,
      timeSeconds: typeof update === 'function' ? update(current.timeSeconds) : update,
    }));
  const setSpeed = (speed: number) => onPageStateChange((current) => ({ ...current, speed }));
  const setTrailOpacity = (trailOpacity: number) =>
    onPageStateChange((current) => ({ ...current, trailOpacity }));
  const setShowTrails = (update: SetStateAction<boolean>) =>
    onPageStateChange((current) => ({
      ...current,
      showTrails: typeof update === 'function' ? update(current.showTrails) : update,
    }));
  const setShowGrenades = (update: SetStateAction<boolean>) =>
    onPageStateChange((current) => ({
      ...current,
      showGrenades: typeof update === 'function' ? update(current.showGrenades) : update,
    }));
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const prepared = useMemo(
    () =>
      rounds.map((round, index) => ({
        key: roundKeyOf(round),
        color: trailColor(index),
        round,
      })),
    [rounds],
  );

  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      return;
    }
    const step = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      if (last != null) {
        setTime((current) => {
          const next = current + ((ts - last) / 1000) * speed;
          if (next >= WINDOW_SECONDS) {
            setPlaying(false);
            return WINDOW_SECONDS;
          }
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed]);

  const restart = () => {
    setTime(0);
    setPlaying(true);
  };

  const visible = prepared.filter((item) => !hiddenRounds.has(item.key));

  const trails: RadarTrail[] = visible.map((item) => ({
    id: item.key,
    points: item.round.points.filter((p) => p.t <= time).map((p) => ({ x: p.x, y: p.y })),
    color: item.color,
    opacity: trailOpacity,
  }));

  const grenadeOverlays: RadarGrenadeOverlay[] = visible.flatMap((item) =>
    item.round.grenades
      .filter((g) => g.t <= time)
      .map((g, gi) => {
        const effectEnd = g.destroyT ?? g.effectT + (EFFECT_DURATION_SECONDS[g.grenade] ?? 0);
        return {
          trailId: `${item.key}-g${gi}`,
          type: g.grenade,
          x: g.x,
          y: g.y,
          ex: g.effectX,
          ey: g.effectY,
          showEffect: time >= g.effectT,
          effectActive: time >= g.effectT && time <= effectEnd,
        };
      }),
  );

  return (
    <div className="stu-trail-layout">
      <div className="stu-trail-stage-wrap">
        <RadarTrails
          mapName={mapName}
          trails={trails}
          grenades={grenadeOverlays}
          showTrails={showTrails}
          showGrenades={showGrenades}
          trailOpacity={trailOpacity}
        />
        <div className="stu-trail-playbar">
          <button
            type="button"
            className="stu-icon-button"
            onClick={() => (time >= WINDOW_SECONDS ? restart() : setPlaying((v) => !v))}
            aria-label={playing ? '暂停' : '播放'}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button type="button" className="stu-icon-button" onClick={restart} aria-label="重播">
            <RotateCcw size={14} />
          </button>
          <input
            className="stu-trail-scrubber"
            type="range"
            min={0}
            max={WINDOW_SECONDS}
            step={0.1}
            value={time}
            onChange={(e) => {
              setPlaying(false);
              setTime(Number(e.target.value));
            }}
          />
          <span className="stu-trail-clock">
            {time.toFixed(1)}s / {WINDOW_SECONDS}s
          </span>
          <div className="stu-speed-toggle" role="group" aria-label="图层">
            <button
              type="button"
              className={showTrails ? 'stu-chip stu-chip-active' : 'stu-chip'}
              onClick={() => setShowTrails((v) => !v)}
            >
              轨迹
            </button>
            <button
              type="button"
              className={showGrenades ? 'stu-chip stu-chip-active' : 'stu-chip'}
              onClick={() => setShowGrenades((v) => !v)}
            >
              道具
            </button>
          </div>
          <label className="stu-trail-opacity" title="轨迹透明度">
            <input
              type="range"
              min={OPENING_OPACITY_MIN}
              max={OPENING_OPACITY_MAX}
              step={0.05}
              value={trailOpacity}
              onChange={(e) => setTrailOpacity(Number(e.target.value))}
            />
          </label>
          <div className="stu-speed-toggle" role="group" aria-label="播放速度">
            {OPENING_SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                className={speed === value ? 'stu-chip stu-chip-active' : 'stu-chip'}
                onClick={() => setSpeed(value)}
              >
                {value}x
              </button>
            ))}
          </div>
        </div>
      </div>
      <aside className="stu-trail-legend" id="opening:rounds">
        <h3>回合（{rounds.length}）</h3>
        {prepared.map((item) => (
          <div key={item.key}>
            <button
              type="button"
              className={
                hiddenRounds.has(item.key) ? 'stu-trail-chip stu-trail-chip-off' : 'stu-trail-chip'
              }
              onClick={() => onToggleRound(item.key)}
              title={`${item.round.matchId} · R${item.round.roundNumber} · ${item.round.grenades.length} 颗道具`}
            >
              <span className="stu-trail-swatch" style={{ background: item.color }} />
              <span className="stu-trail-chip-label">
                R{item.round.roundNumber} ·{' '}
                {item.round.matchId.length > 22
                  ? `${item.round.matchId.slice(0, 22)}…`
                  : item.round.matchId}
              </span>
              <small>{item.round.grenades.length} 道具</small>
            </button>
            {onOpenRound && (
              <button
                type="button"
                className="stu-button-sm"
                onClick={() => onOpenRound(item.round)}
              >
                打开回合
              </button>
            )}
          </div>
        ))}
        <div className="stu-trail-grenade-legend">
          {Object.entries(GRENADE_LABEL)
            .filter(([key]) => key !== 'incendiary')
            .map(([key, label]) => (
              <span key={key}>
                <i style={{ background: GRENADE_COLOR[key] }} />
                {label}
              </span>
            ))}
        </div>
        {missingReplay.length > 0 && (
          <p className="stu-dim stu-trail-note">无回放流：{missingReplay.join('、')}</p>
        )}
      </aside>
    </div>
  );
}
