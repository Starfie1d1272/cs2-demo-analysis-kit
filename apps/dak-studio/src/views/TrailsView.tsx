import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OpeningTrailsModel, OpeningTrailRound } from "@cs2dak/contract";
import { buildOpeningTrails } from "@cs2dak/presentation";
import { getMapCalibration, worldToRadar } from "@cs2dak/maps";
import { getDemoPackage, matchIdForEntry, type StudioDemoEntry } from "../lib/library";
import { getPinnedPlayer } from "../lib/pin";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { EmptyState } from "../components/primitives";

/**
 * 开局动线：选手在长枪局开局前 N 秒的走位 + 道具投掷叠加动画。
 * 数据由 @cs2dak/presentation buildOpeningTrails 派生，本视图只做投影与播放。
 */

export interface TrailsViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  onGoLibrary: () => void;
  teamRenames?: Record<string, string>;
}

const WINDOW_SECONDS = 30;
const RANGE_OPTIONS = [3, 5, 10, 0] as const; // 0 = 全部

interface PlayerOption {
  steamId64: string;
  name: string;
  matchCount: number;
}

const GRENADE_COLOR: Record<string, string> = {
  flashbang: "#ffd84d",
  smoke: "#9aa6b2",
  molotov: "#ff8a3d",
  incendiary: "#ff8a3d",
  hegrenade: "#ff5f6e",
  decoy: "#6f7d8a"
};

const GRENADE_LABEL: Record<string, string> = {
  flashbang: "闪光",
  smoke: "烟雾",
  molotov: "燃烧瓶",
  incendiary: "燃烧弹",
  hegrenade: "高爆",
  decoy: "诱饵"
};

function trailColor(index: number): string {
  return `hsl(${(index * 47) % 360} 75% 60%)`;
}

/** 烟/火的近似作用半径（游戏单位），只服务视觉示意；其余道具不画范围圈。 */
const EFFECT_RADIUS_UNITS: Partial<Record<string, number>> = {
  smoke: 144,
  molotov: 120,
  incendiary: 120
};

/** destroyT 缺失时的保底效果时长（秒）。 */
const EFFECT_DURATION_SECONDS: Partial<Record<string, number>> = {
  smoke: 18,
  molotov: 7,
  incendiary: 7,
  hegrenade: 0.7,
  flashbang: 0.7,
  decoy: 15
};

export function TrailsView({ allEntries, entries, scope, onScopeChange, onGoLibrary, teamRenames = {} }: TrailsViewProps) {
  // 业务流程：① 选手 → ② 地图（该选手出场的图）→ ③ 最近 N 场（该选手在该图）
  const [rangeN, setRangeN] = useState<number>(5);
  const [steamId64, setSteamId64] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerOption[] | null>(null);
  /** entryId → 该场出场选手集合。 */
  const [rosterByEntry, setRosterByEntry] = useState<Map<string, Set<string>> | null>(null);
  const [models, setModels] = useState<OpeningTrailsModel[] | null>(null);
  const [mapName, setMapName] = useState<string | null>(null);
  const [side, setSide] = useState<"t" | "ct">("t");
  const [hiddenRounds, setHiddenRounds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // ① 加载范围内全部 DemoPackage，建立选手候选与每场名单（derived 缓存命中后开销很小）
  useEffect(() => {
    if (entries.length === 0) {
      setPlayers(null);
      setRosterByEntry(null);
      setModels(null);
      return;
    }
    let cancelled = false;
    setPlayers(null);
    setError(null);
    Promise.all(entries.map(async (entry) => ({ id: entry.id, pkg: await getDemoPackage(entry.id) })))
      .then((loaded) => {
        if (cancelled) return;
        const counts = new Map<string, PlayerOption>();
        const roster = new Map<string, Set<string>>();
        for (const { id, pkg } of loaded) {
          const ids = new Set<string>();
          for (const player of pkg.players) {
            ids.add(player.steamId64);
            const current = counts.get(player.steamId64);
            if (current) current.matchCount += 1;
            else counts.set(player.steamId64, { steamId64: player.steamId64, name: player.name, matchCount: 1 });
          }
          roster.set(id, ids);
        }
        const options = [...counts.values()].sort((a, b) => b.matchCount - a.matchCount || a.name.localeCompare(b.name));
        setPlayers(options);
        setRosterByEntry(roster);
        setSteamId64((current) => {
          if (current && options.some((option) => option.steamId64 === current)) return current;
          const pinned = getPinnedPlayer();
          const pinnedOption = pinned ? options.find((option) => pinned.steamIds.includes(option.steamId64)) : null;
          return (pinnedOption ?? options[0])?.steamId64 ?? null;
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  // 该选手出场的全部场次（matchId 日期前缀降序）
  const playerEntries = useMemo(() => {
    if (!steamId64 || !rosterByEntry) return [];
    return entries
      .filter((entry) => rosterByEntry.get(entry.id)?.has(steamId64))
      .sort((a, b) => matchIdForEntry(b).localeCompare(matchIdForEntry(a)));
  }, [entries, steamId64, rosterByEntry]);

  // ② 地图选项 = 该选手出场过的图
  const mapOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of playerEntries) {
      counts.set(entry.meta.mapName, (counts.get(entry.meta.mapName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [playerEntries]);

  useEffect(() => {
    setMapName((current) =>
      current && mapOptions.some(([map]) => map === current) ? current : (mapOptions[0]?.[0] ?? null)
    );
  }, [mapOptions]);

  // ③ 范围 = 该选手在该图的最近 N 场
  const rangeEntries = useMemo(() => {
    if (!mapName) return [];
    const pool = playerEntries.filter((entry) => entry.meta.mapName === mapName);
    return rangeN > 0 ? pool.slice(0, rangeN) : pool;
  }, [playerEntries, mapName, rangeN]);

  // 为选中选手构建各场动线
  useEffect(() => {
    if (!steamId64 || rangeEntries.length === 0) {
      setModels(null);
      return;
    }
    let cancelled = false;
    setModels(null);
    setError(null);
    Promise.all(
      rangeEntries.map(async (entry) =>
        buildOpeningTrails(await getDemoPackage(entry.id), matchIdForEntry(entry), steamId64, {
          windowSeconds: WINDOW_SECONDS
        })
      )
    )
      .then((result) => {
        if (cancelled) return;
        setModels(result);
        setHiddenRounds(new Set());
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [rangeEntries, steamId64]);

  const visibleRounds = useMemo(() => {
    if (!models || !mapName) return [];
    return models
      .filter((model) => model.mapName === mapName)
      .flatMap((model) => model.rounds)
      .filter((round) => round.side === side);
  }, [models, mapName, side]);

  const missingReplay = useMemo(
    () => (models ?? []).filter((model) => !model.available).map((model) => model.matchId),
    [models]
  );

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <EmptyState
          mark
          title="还没有动线数据"
          hint="开局动线需要含回放流的 v3 ZIP，先导入几场比赛。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
      </div>
    );
  }

  const selectedPlayer = players?.find((option) => option.steamId64 === steamId64) ?? null;

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>开局动线</h1>
          <p>
            选手在<b>长枪局</b>开局前 {WINDOW_SECONDS} 秒的走位与道具投掷叠加动画——直观看出默认位、出门路线和道具习惯，也可用于学习职业选手的 default。
          </p>
        </div>
      </header>

      <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} teamRenames={teamRenames} />

      <div className="stu-trail-controls">
        <label>
          <span>① 选手</span>
          <select className="stu-select" value={steamId64 ?? ""} onChange={(e) => setSteamId64(e.target.value || null)}>
            {(players ?? []).map((option) => (
              <option key={option.steamId64} value={option.steamId64}>
                {option.name}（{option.matchCount} 场）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>② 地图</span>
          <select className="stu-select" value={mapName ?? ""} onChange={(e) => setMapName(e.target.value || null)}>
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
            onChange={(e) => setRangeN(Number(e.target.value))}
            title="该选手在该地图的最近 N 场"
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
          {(["t", "ct"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={side === value}
              className={side === value ? "stu-chip stu-chip-active" : "stu-chip"}
              onClick={() => setSide(value)}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
        {selectedPlayer && mapName && (
          <span className="stu-dim">
            正在叠加：{selectedPlayer.name} · {mapName} · {rangeEntries.length} 场
          </span>
        )}
      </div>

      {error ? (
        <EmptyState variant="error" title="构建失败" hint={error} />
      ) : !models || !players ? (
        <div className="stu-loading">提取 {rangeEntries.length} 场回放轨迹…</div>
      ) : visibleRounds.length === 0 ? (
        <EmptyState
          variant="insufficient"
          title="没有可叠加的回合"
          hint={
            <>
              {mapName
                ? `${selectedPlayer?.name ?? "该选手"} 在 ${mapName} 的 ${side.toUpperCase()} 方没有含回放的长枪局。试试切换阵营、地图或扩大范围。`
                : "该范围内没有含回放流的长枪局。"}
              {missingReplay.length > 0 && ` 注意：${missingReplay.join("、")} 不含回放流。`}
            </>
          }
        />
      ) : (
        <TrailStage
          key={`${mapName}-${side}-${steamId64}-${visibleRounds.length}`}
          mapName={mapName!}
          rounds={visibleRounds}
          hiddenRounds={hiddenRounds}
          onToggleRound={(roundKey) =>
            setHiddenRounds((current) => {
              const next = new Set(current);
              if (next.has(roundKey)) next.delete(roundKey);
              else next.add(roundKey);
              return next;
            })
          }
          missingReplay={missingReplay}
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
}

function TrailStage({ mapName, rounds, hiddenRounds, onToggleRound, missingReplay }: TrailStageProps) {
  const [time, setTime] = useState(WINDOW_SECONDS);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [trailOpacity, setTrailOpacity] = useState(0.5);
  const [showTrails, setShowTrails] = useState(true);
  const [showGrenades, setShowGrenades] = useState(true);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const calibration = getMapCalibration(mapName);
  const size = calibration?.radarSize ?? 1024;

  // 预投影到 radar 坐标
  const projected = useMemo(() => {
    return rounds.map((round, index) => {
      const project = (point: { x: number; y: number }) => {
        if (!calibration) return { x: size / 2 + point.x / 10, y: size / 2 - point.y / 10 };
        const radar = worldToRadar(point, calibration);
        return { x: radar.x, y: radar.y };
      };
      return {
        key: roundKeyOf(round),
        color: trailColor(index),
        round,
        points: round.points.map((p) => ({ t: p.t, ...project(p) })),
        grenades: round.grenades.map((g) => {
          const effect = project({ x: g.effectX, y: g.effectY });
          return {
            t: g.t,
            grenade: g.grenade,
            effectT: g.effectT,
            destroyT: g.destroyT,
            ex: effect.x,
            ey: effect.y,
            ...project(g)
          };
        })
      };
    });
  }, [rounds, calibration, size]);

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

  const visible = projected.filter((item) => !hiddenRounds.has(item.key));

  return (
    <div className="stu-trail-layout">
      <div className="stu-trail-stage-wrap">
        <svg
          className="stu-trail-stage"
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${mapName} 开局动线`}
        >
          <image href={`./maps/radars/${mapName}.png`} width={size} height={size} opacity={0.85} />
          {visible.map((item) => {
            const pts = item.points.filter((p) => p.t <= time);
            if (pts.length === 0) return null;
            const head = pts[pts.length - 1];
            return (
              <g key={item.key}>
                {/* 轨迹开关只控制路径线；选手当前位置点始终可见 */}
                {showTrails && (
                  <polyline
                    points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={size / 340}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={trailOpacity}
                  />
                )}
                <circle cx={head.x} cy={head.y} r={size / 110} fill={item.color} stroke="#0b0e10" strokeWidth={size / 512} opacity={Math.min(1, trailOpacity + 0.3)} />
                {showGrenades && item.grenades
                  .filter((g) => g.t <= time)
                  .map((g, gi) => {
                    const scale = calibration?.scale ?? 10;
                    const effectRadius = EFFECT_RADIUS_UNITS[g.grenade];
                    const effectEnd = g.destroyT ?? g.effectT + (EFFECT_DURATION_SECONDS[g.grenade] ?? 0);
                    const effectVisible = time >= g.effectT;
                    const effectActive = effectVisible && time <= effectEnd;
                    return (
                      <g key={`${item.key}-g${gi}`}>
                        {effectVisible && (
                          <line x1={g.x} y1={g.y} x2={g.ex} y2={g.ey} stroke={GRENADE_COLOR[g.grenade] ?? "#fff"} strokeWidth={size / 1024} strokeDasharray={`${size / 256} ${size / 256}`} opacity={0.55} />
                        )}
                        {effectActive && effectRadius != null && (
                          <circle cx={g.ex} cy={g.ey} r={effectRadius / scale} fill={GRENADE_COLOR[g.grenade] ?? "#fff"} opacity={0.22} stroke={GRENADE_COLOR[g.grenade] ?? "#fff"} strokeOpacity={0.5} strokeWidth={size / 1024} />
                        )}
                        {effectVisible && (
                          <circle cx={g.ex} cy={g.ey} r={size / 170} fill={GRENADE_COLOR[g.grenade] ?? "#fff"} opacity={0.95} stroke="#0b0e10" strokeWidth={size / 680} />
                        )}
                        <circle cx={g.x} cy={g.y} r={size / 240} fill="none" stroke={GRENADE_COLOR[g.grenade] ?? "#fff"} strokeWidth={size / 768} opacity={0.8} />
                        <title>{`${GRENADE_LABEL[g.grenade] ?? g.grenade} · 出手 ${g.t.toFixed(1)}s → 生效 ${g.effectT.toFixed(1)}s（${item.round.matchId} R${item.round.roundNumber}）`}</title>
                      </g>
                    );
                  })}
              </g>
            );
          })}
        </svg>
        <div className="stu-trail-playbar">
          <button type="button" className="stu-icon-button" onClick={() => (time >= WINDOW_SECONDS ? restart() : setPlaying((v) => !v))} aria-label={playing ? "暂停" : "播放"}>
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
          <span className="stu-trail-clock">{time.toFixed(1)}s / {WINDOW_SECONDS}s</span>
          <div className="stu-speed-toggle" role="group" aria-label="图层">
            <button
              type="button"
              className={showTrails ? "stu-chip stu-chip-active" : "stu-chip"}
              onClick={() => setShowTrails((v) => !v)}
            >
              轨迹
            </button>
            <button
              type="button"
              className={showGrenades ? "stu-chip stu-chip-active" : "stu-chip"}
              onClick={() => setShowGrenades((v) => !v)}
            >
              道具
            </button>
          </div>
          <label className="stu-trail-opacity" title="轨迹透明度">
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={trailOpacity}
              onChange={(e) => setTrailOpacity(Number(e.target.value))}
            />
          </label>
          <div className="stu-speed-toggle" role="group" aria-label="播放速度">
            {[1, 2, 4].map((value) => (
              <button
                key={value}
                type="button"
                className={speed === value ? "stu-chip stu-chip-active" : "stu-chip"}
                onClick={() => setSpeed(value)}
              >
                {value}x
              </button>
            ))}
          </div>
        </div>
      </div>
      <aside className="stu-trail-legend">
        <h3>回合（{rounds.length}）</h3>
        {projected.map((item) => (
          <button
            key={item.key}
            type="button"
            className={hiddenRounds.has(item.key) ? "stu-trail-chip stu-trail-chip-off" : "stu-trail-chip"}
            onClick={() => onToggleRound(item.key)}
            title={`${item.round.matchId} · R${item.round.roundNumber} · ${item.round.grenades.length} 颗道具`}
          >
            <span className="stu-trail-swatch" style={{ background: item.color }} />
            <span className="stu-trail-chip-label">
              R{item.round.roundNumber} · {item.round.matchId.length > 22 ? `${item.round.matchId.slice(0, 22)}…` : item.round.matchId}
            </span>
            <small>{item.round.grenades.length} 道具</small>
          </button>
        ))}
        <div className="stu-trail-grenade-legend">
          {Object.entries(GRENADE_LABEL).filter(([key]) => key !== "incendiary").map(([key, label]) => (
            <span key={key}>
              <i style={{ background: GRENADE_COLOR[key] }} />
              {label}
            </span>
          ))}
        </div>
        {missingReplay.length > 0 && (
          <p className="stu-dim stu-trail-note">无回放流：{missingReplay.join("、")}</p>
        )}
      </aside>
    </div>
  );
}
