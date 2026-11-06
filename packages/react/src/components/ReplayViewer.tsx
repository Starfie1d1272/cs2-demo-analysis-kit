import { normalizeReplayViewState, type ReplayViewState } from '@cs2dak/presentation';
import type {
  MapView,
  WorkspaceReplay,
  WorkspaceReplayFrame,
  WorkspaceReplayLoadout,
  WorkspaceReplayRound,
} from '@cs2dak/presentation';
import { displayWeaponName } from '@cs2dak/presentation/weapons';
import { deriveReplayClock } from '@cs2dak/presentation/replay-clock';
import {
  getMapCalibration,
  worldToRadar,
  hasLowerLevel,
  levelAt,
  type MapLevel,
} from '@cs2dak/maps/calibration';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { KillFeed } from './KillFeed';
import { Panel } from './Panel';

function replayFrameIndexAtTick(round: WorkspaceReplayRound, tick: number): number {
  const targetEndTick = round.targetEndTick ?? round.officialEndTick;
  const endIndex =
    targetEndTick != null
      ? Math.max(
          round.frameCount - 1,
          Math.round((targetEndTick - round.startTick) / round.tickStep),
        )
      : Math.max(round.frameCount - 1, 0);
  const index = Math.round((tick - round.startTick) / round.tickStep);
  return Math.max(0, Math.min(endIndex, index));
}

export interface ReplayViewerProps {
  replay: WorkspaceReplay;
  map: MapView;
  state: ReplayViewState | null;
  onStateChange: (next: ReplayViewState | null) => void;
}

export function ReplayViewer({ replay, map, state, onStateChange }: ReplayViewerProps) {
  const normalized = normalizeReplayViewState(replay, map, state);
  const latest = useRef({ state: normalized, onStateChange });
  latest.current = { state: normalized, onStateChange };
  useEffect(() => {
    if (JSON.stringify(state) !== JSON.stringify(normalized)) onStateChange(normalized);
  }, [
    state,
    normalized?.roundNumber,
    normalized?.tick,
    normalized?.playing,
    normalized?.speed,
    normalized?.layers.trace,
    normalized?.layers.killLines,
    normalized?.layers.grenades,
    normalized?.level,
    onStateChange,
  ]);
  const calibration = getMapCalibration(map.name);
  const dualLevel = !!(calibration && hasLowerLevel(calibration) && map.lowerRadarImageUrl);
  const levelOf = (z: number): MapLevel => (calibration ? levelAt(z, calibration) : 'upper');
  const round = replay.rounds.find((row) => row.roundNumber === normalized?.roundNumber);
  const playing = normalized?.playing ?? false;
  const speed = normalized?.speed ?? 1;
  const layers = normalized?.layers ?? { trace: false, killLines: true, grenades: true };
  const level = normalized?.level ?? 'upper';
  const frameIndex = round && normalized ? replayFrameIndexAtTick(round, normalized.tick) : 0;
  const lastDataFrameIndex = round ? Math.max(round.frameCount - 1, 0) : 0;
  const targetEndFrameIndex = round
    ? replayFrameIndexAtTick(
        round,
        round.targetEndTick ??
          round.officialEndTick ??
          round.startTick + lastDataFrameIndex * round.tickStep,
      )
    : 0;
  const update = (patch: Partial<ReplayViewState>) => {
    if (normalized)
      onStateChange(normalizeReplayViewState(replay, map, { ...normalized, ...patch }));
  };
  const setRoundNumber = (roundNumber: number) => {
    const next = replay.rounds.find((row) => row.roundNumber === roundNumber);
    if (next) update({ roundNumber, tick: next.freezeEndTick, playing: false });
  };
  useEffect(() => {
    if (!playing || !round || targetEndFrameIndex <= 0) return;
    let active = true;
    const timer = window.setInterval(
      () => {
        const current = latest.current.state;
        if (!active || !current || !current.playing || current.roundNumber !== round.roundNumber)
          return;
        const endTick = round.startTick + targetEndFrameIndex * round.tickStep;
        const tick = Math.min(endTick, current.tick + round.tickStep);
        latest.current.onStateChange({ ...current, tick, playing: tick < endTick });
      },
      Math.max(35, 1000 / ((replay.sampleRate ?? 8) * speed)),
    );
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [playing, round, replay, targetEndFrameIndex, speed]);

  // Stable per-player numbers: teamA → 1-5, teamB → 6-0.
  // Computed from round.players order so the mapping is consistent across frames.
  const playerNumbers = useMemo(() => {
    const result: Record<string, string> = {};
    if (!round) return result;
    round.players
      .filter((p) => p.teamKey === 'teamA')
      .forEach((p, i) => {
        result[p.steamId64] = String(i + 1);
      });
    round.players
      .filter((p) => p.teamKey === 'teamB')
      .forEach((p, i) => {
        result[p.steamId64] = String((i + 6) % 10);
      });
    return result;
  }, [round]);

  const endTick = round ? round.startTick + targetEndFrameIndex * round.tickStep : 0;

  // 2D 时间轴锚点：首杀 / 每次击杀 / 下包拆包（freeze end = 起点本身）
  const anchors = useMemo(() => {
    const list: { tick: number; kind: string; label: string }[] = [];
    if (!round) return list;
    round.kills.forEach((kill, i) => {
      list.push({
        tick: kill.tick,
        kind: i === 0 ? 'firstkill' : 'kill',
        label: `${i === 0 ? '首杀' : '击杀'}：${kill.killerName ?? '?'} → ${kill.victimName}`,
      });
    });
    if (round.bomb) {
      list.push({ tick: round.bomb.plantTick, kind: 'bomb', label: '下包' });
      if (round.bomb.defuseTick != null)
        list.push({ tick: round.bomb.defuseTick, kind: 'defuse', label: '拆包' });
    }
    return list.filter((a) => a.tick >= round.startTick && a.tick <= endTick);
  }, [round, endTick]);
  const seekTick = (tick: number) => {
    update({ tick, playing: false });
  };
  // 帧数据访问用 dataFrameIndex（clamp 到实际录制范围），让超出部分冻结在最后帧

  if (!replay.available || !round) {
    return (
      <Panel title="2D 回放">
        <p className="dak-muted">该导出包不含回放流。</p>
      </Panel>
    );
  }

  const currentFrameIndex = Math.min(frameIndex, targetEndFrameIndex);
  // 数据帧 clamp：超出实际录制帧数时冻结在最后一帧
  const dataFrameIndex = Math.min(currentFrameIndex, lastDataFrameIndex);
  const currentTick = round.startTick + currentFrameIndex * round.tickStep;
  const replayClock = deriveReplayClock(round, currentTick, replay.tickrate ?? 64);

  const currentPlayers = round.players
    .map((player) => ({
      player,
      frame:
        player.frames[dataFrameIndex] ??
        player.frames.find((frame) => frame.alive) ??
        player.frames[0],
    }))
    .filter(
      (
        row,
      ): row is { player: WorkspaceReplayRound['players'][number]; frame: WorkspaceReplayFrame } =>
        Boolean(row.frame),
    );
  const selectedRoundIndex = Math.max(
    0,
    replay.rounds.findIndex((row) => row.roundNumber === round.roundNumber),
  );
  const seekRoundByOffset = (offset: number) => {
    const next =
      replay.rounds[Math.max(0, Math.min(replay.rounds.length - 1, selectedRoundIndex + offset))];
    if (next) setRoundNumber(next.roundNumber);
  };
  const rosterTeams = (['teamA', 'teamB'] as const).map((teamKey) => ({
    teamKey,
    side: currentPlayers.find(({ player }) => player.teamKey === teamKey)?.player.side ?? null,
    rows: [...currentPlayers]
      .filter(({ player }) => player.teamKey === teamKey)
      .sort((a, b) => {
        const na = Number(playerNumbers[a.player.steamId64] ?? '99');
        const nb = Number(playerNumbers[b.player.steamId64] ?? '99');
        return (na === 0 ? 10 : na) - (nb === 0 ? 10 : nb);
      }),
  }));
  const renderRosterTeam = (team: (typeof rosterTeams)[number]) => (
    <section className="dak-roster-team" key={team.teamKey} aria-label={`${team.teamKey} 当前状态`}>
      <div className="dak-roster-team-head">
        <span className={`dak-team-dot dak-team-dot-${team.teamKey}`} />
        <b>{team.side ? team.side.toUpperCase() : team.teamKey}</b>
        <small>{team.rows.length}/5</small>
      </div>
      <div className="dak-frame-player-list">
        {team.rows.map(({ player, frame }) => {
          // 装备严格跟随逐帧数据：道具丢出后即消失，捡/传枪后主武器即替换（不回退到开局 loadout）
          const heldUtility =
            frame.grenades.length > 0
              ? heldUtilityLabel({
                  ...player.loadout,
                  grenadeCount: frame.grenades.length,
                  grenades: frame.grenades,
                })
              : null;
          const heldGun = frame.weapon && isGunWeapon(frame.weapon) ? frame.weapon : null;
          // frame.weapon 是武器原始 key，loadout 可能存展示名；统一到展示名空间再比较与渲染，避免误判「捡枪」并显示原始 key。
          const heldGunLabel = heldGun ? displayWeaponName(heldGun) : null;
          const primaryLabel = primaryLoadoutLabel(player.loadout);
          const secondaryLabel = player.loadout.secondaryWeapon
            ? displayWeaponName(player.loadout.secondaryWeapon)
            : null;
          const pickedUp =
            heldGunLabel != null &&
            heldGunLabel !== primaryLabel &&
            heldGunLabel !== secondaryLabel;
          const primary = pickedUp ? heldGunLabel : primaryLabel;
          return (
            <div
              className={`dak-frame-player-row${!frame.alive ? ' dak-frame-player-row-dead' : ''}`}
              key={player.steamId64}
            >
              <span className="dak-frame-player-num">{playerNumbers[player.steamId64] ?? '?'}</span>
              <span className="dak-frame-player-name">{player.name}</span>
              {frame.alive ? (
                <small className="dak-frame-loadout">
                  <span className="dak-frame-primary">
                    {primary}
                    {pickedUp ? '*' : ''}
                  </span>
                  {player.loadout.primaryWeapon && secondaryLabel && !pickedUp && (
                    <span>{secondaryLabel}</span>
                  )}
                  {heldUtility && <span>{heldUtility}</span>}
                  {frame.armor > 0 && <span>{frame.hasHelmet ? '全甲' : '半甲'}</span>}
                  {frame.hasDefuseKit && <span>kit</span>}
                  {frame.hasBomb && <span>C4</span>}
                  {frame.flashed && <span>白 {frame.flashRemainingSeconds.toFixed(1)}s</span>}
                </small>
              ) : (
                <small className="dak-frame-weapon">阵亡</small>
              )}
              {renderHpArmor(frame)}
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="dak-replay-layout">
      <section className="dak-replay-controlbar" aria-label="回放控制">
        <div className="dak-replay-round-nav">
          <button
            className="dak-icon-button"
            type="button"
            onClick={() => seekRoundByOffset(-1)}
            disabled={selectedRoundIndex <= 0}
            aria-label="上一回合"
          >
            <ChevronLeft size={17} />
          </button>
          <label className="dak-round-select-label">
            <span>回合</span>
            <select
              className="dak-round-select"
              value={round.roundNumber}
              onChange={(event) => setRoundNumber(Number(event.target.value))}
            >
              {replay.rounds.map((row) => (
                <option key={row.roundNumber} value={row.roundNumber}>
                  R{row.roundNumber} · {row.frameCount} 帧
                </option>
              ))}
            </select>
          </label>
          <button
            className="dak-icon-button"
            type="button"
            onClick={() => seekRoundByOffset(1)}
            disabled={selectedRoundIndex >= replay.rounds.length - 1}
            aria-label="下一回合"
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="dak-playback">
          <button
            className="dak-play-button"
            type="button"
            onClick={() => update({ playing: !playing })}
            aria-label={playing ? '暂停' : '播放'}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            className="dak-icon-button"
            type="button"
            onClick={() =>
              seekTick(
                currentTick -
                  round.tickStep * Math.max(1, Math.round((replay.sampleRate ?? 8) / 2)),
              )
            }
            aria-label="后退"
          >
            <ChevronLeft size={17} />
          </button>
          <div className="dak-scrubber-wrap">
            <div className="dak-scrubber-anchors" aria-hidden="true">
              {anchors.map((anchor, i) => (
                <button
                  key={`${anchor.tick}-${i}`}
                  type="button"
                  className={`dak-scrubber-anchor dak-scrubber-anchor-${anchor.kind}`}
                  style={{
                    left: `${endTick > round.startTick ? ((anchor.tick - round.startTick) / (endTick - round.startTick)) * 100 : 0}%`,
                  }}
                  title={anchor.label}
                  onClick={() => seekTick(anchor.tick)}
                />
              ))}
            </div>
            <input
              className="dak-scrubber"
              type="range"
              min={0}
              max={targetEndFrameIndex}
              value={currentFrameIndex}
              onChange={(event) =>
                seekTick(round.startTick + Number(event.target.value) * round.tickStep)
              }
            />
          </div>
          <button
            className="dak-icon-button"
            type="button"
            onClick={() =>
              seekTick(
                currentTick +
                  round.tickStep * Math.max(1, Math.round((replay.sampleRate ?? 8) / 2)),
              )
            }
            aria-label="前进"
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="dak-replay-statusline" aria-label="当前回放状态">
          <div className={`dak-replay-clock dak-replay-clock-${replayClock.phase}`}>
            <span>{replayClock.label === '回合' ? '回合时间' : replayClock.label}</span>
            <strong>{replayClock.display}</strong>
          </div>
          <div className="dak-replay-techline" aria-label="回放技术信息">
            <span>R{round.roundNumber}</span>
            <span>Tick {currentTick}</span>
            <span>
              帧 {currentFrameIndex + 1}/{round.frameCount}
            </span>
            <span>{replay.sampleRate ?? 0} Hz</span>
          </div>
        </div>
        <div className="dak-replay-togglebar">
          <div className="dak-speed-group" role="group" aria-label="叠加图层">
            {(
              [
                ['trace', '走位轨迹'],
                ['killLines', '击杀连线'],
                ['grenades', '道具轨迹'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={layers[key] ? 'dak-speed dak-speed-active' : 'dak-speed'}
                aria-pressed={layers[key]}
                onClick={() => update({ layers: { ...layers, [key]: !layers[key] } })}
              >
                {label}
              </button>
            ))}
          </div>
          {dualLevel && (
            <div
              className="dak-speed-group dak-speed-group-compact"
              role="group"
              aria-label="地图层级"
            >
              {(['upper', 'lower'] as const).map((nextLevel) => (
                <button
                  key={nextLevel}
                  type="button"
                  className={level === nextLevel ? 'dak-speed dak-speed-active' : 'dak-speed'}
                  onClick={() => update({ level: nextLevel })}
                >
                  {nextLevel === 'upper' ? '上层' : '下层'}
                </button>
              ))}
            </div>
          )}
          <div
            className="dak-speed-group dak-speed-group-compact"
            role="group"
            aria-label="播放速度"
          >
            {([0.5, 1, 2, 4] as const).map((nextSpeed) => (
              <button
                key={nextSpeed}
                type="button"
                className={speed === nextSpeed ? 'dak-speed dak-speed-active' : 'dak-speed'}
                onClick={() => update({ speed: nextSpeed })}
              >
                {nextSpeed}x
              </button>
            ))}
          </div>
        </div>
      </section>
      <aside className="dak-replay-roster-panel dak-replay-roster-left">
        <div className="dak-roster-board">{renderRosterTeam(rosterTeams[0])}</div>
      </aside>
      <section className="dak-replay-stage-panel" aria-label={`R${round.roundNumber} 2D 回放`}>
        <div
          className="dak-replay-stage"
          style={(() => {
            const url = dualLevel && level === 'lower' ? map.lowerRadarImageUrl : map.radarImageUrl;
            return url ? { backgroundImage: `url(${url})` } : undefined;
          })()}
        >
          <div className="dak-replay-gridlines" aria-hidden="true" />
          <KillFeed kills={round.kills} currentTick={currentTick} tickrate={replay.tickrate} />
          {layers.trace && (
            <svg
              className="dak-replay-trajectories"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {currentPlayers.map(({ player, frame }) => {
                if (!frame.alive) return null;
                if (dualLevel && levelOf(frame.z) !== level) return null;
                // 最近 ~10 秒的走位轨迹（8 Hz × 80 帧）；clamp 到实际录制范围
                const traceFrames = player.frames
                  .slice(Math.max(0, dataFrameIndex - 80), dataFrameIndex + 1)
                  .filter((f) => f.alive);
                if (traceFrames.length < 2) return null;
                const points = traceFrames
                  .map((f) => {
                    const pos = replayPointPercent(f, map);
                    return `${pos.x},${pos.y}`;
                  })
                  .join(' ');
                return (
                  <polyline
                    key={`trace-${player.steamId64}`}
                    className={`dak-replay-playertrace dak-replay-playertrace-${player.teamKey}`}
                    points={points}
                  />
                );
              })}
            </svg>
          )}
          {layers.killLines && (
            <svg
              className="dak-replay-trajectories"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {round.kills.map((kill, i) => {
                // 击杀后保留 ~3 秒的连线
                if (kill.killerX == null || kill.victimX == null) return null;
                if (
                  currentTick < kill.tick ||
                  currentTick > kill.tick + 3 * (replay.tickrate ?? 64)
                )
                  return null;
                if (dualLevel && kill.victimZ != null && levelOf(kill.victimZ) !== level)
                  return null;
                const from = replayPointPercent({ x: kill.killerX, y: kill.killerY ?? 0 }, map);
                const to = replayPointPercent({ x: kill.victimX, y: kill.victimY ?? 0 }, map);
                return (
                  <g key={`killline-${i}`}>
                    <line
                      className="dak-replay-killline"
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                    />
                    <circle className="dak-replay-killline-victim" cx={to.x} cy={to.y} r={0.7} />
                  </g>
                );
              })}
            </svg>
          )}
          {layers.grenades && (
            <GrenadeEffectLayer
              round={round}
              currentTick={currentTick}
              tickrate={replay.tickrate ?? 64}
              map={map}
              level={dualLevel ? level : null}
              levelOf={levelOf}
            />
          )}
          <BombMarker
            bomb={round.bomb}
            currentTick={currentTick}
            tickrate={replay.tickrate ?? 64}
            map={map}
            offLevel={dualLevel && round.bomb != null && levelOf(round.bomb.z ?? 0) !== level}
          />
          {(round.groundBombs ?? []).map((gb, gbIdx) => {
            if (currentTick < gb.startTick || currentTick > gb.endTick) return null;
            if (dualLevel && levelOf(gb.z ?? 0) !== level) return null;
            return (
              <span
                key={`gb-${gbIdx}`}
                className="dak-replay-bomb dak-replay-bomb-dropped"
                style={{
                  left: `${replayPointPercent(gb, map).x}%`,
                  top: `${replayPointPercent(gb, map).y}%`,
                }}
                title="C4 掉落"
                aria-hidden="true"
              >
                c4
              </span>
            );
          })}
          {(round.groundDefusers ?? []).map((gd, gdIdx) => {
            if (currentTick < gd.startTick || currentTick > gd.endTick) return null;
            if (dualLevel && levelOf(gd.z ?? 0) !== level) return null;
            return (
              <span
                key={`gd-${gdIdx}`}
                className="dak-replay-defuser dak-replay-defuser-dropped"
                style={{
                  left: `${replayPointPercent(gd, map).x}%`,
                  top: `${replayPointPercent(gd, map).y}%`,
                }}
                title="拆弹器掉落"
                aria-hidden="true"
              >
                kit
              </span>
            );
          })}
          {currentPlayers.map(({ player, frame }) => (
            <div
              key={player.steamId64}
              className={`dak-replay-token dak-replay-token-${player.teamKey}${!frame.alive ? ' dak-replay-token-dead' : ''}${frame.flashed ? ' dak-replay-token-flashed' : ''}${dualLevel && levelOf(frame.z) !== level ? ' dak-replay-token-offlevel' : ''}`}
              style={{
                ...replayFramePosition(frame, map),
                transform: `translate(-50%, -50%) rotate(${90 - frame.yaw}deg)`,
              }}
              title={`${playerNumbers[player.steamId64] ?? '?'} ${player.name} · ${frame.hp} HP${frame.hasDefuseKit ? ' · 拆弹器' : ''}${frame.flashed ? ` · 白 ${frame.flashRemainingSeconds.toFixed(1)}s` : ''}`}
            >
              {frame.alive ? (
                <span style={{ transform: `rotate(${frame.yaw - 90}deg)` }}>
                  {playerNumbers[player.steamId64] ?? '?'}
                </span>
              ) : (
                <svg
                  className="dak-replay-dead-x"
                  viewBox="0 0 10 10"
                  width="14"
                  height="14"
                  aria-hidden="true"
                  style={{ transform: `rotate(${frame.yaw - 90}deg)` }}
                >
                  <line
                    x1="1.5"
                    y1="1.5"
                    x2="8.5"
                    y2="8.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <line
                    x1="8.5"
                    y1="1.5"
                    x2="1.5"
                    y2="8.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {frame.hasDefuseKit && (
                <i style={{ transform: `rotate(${frame.yaw - 90}deg)` }}>kit</i>
              )}
              {frame.hasBomb && (
                <i
                  className="dak-replay-c4-tag"
                  style={{ transform: `rotate(${frame.yaw - 90}deg)` }}
                >
                  c4
                </i>
              )}
            </div>
          ))}
        </div>
      </section>
      <aside className="dak-replay-roster-panel dak-replay-roster-right">
        <div className="dak-roster-board">{renderRosterTeam(rosterTeams[1])}</div>
      </aside>
    </div>
  );
}

/** 渲染 HP 条 + 护甲底色（HP 条盖在护甲层上；护甲层满宽时可区分全甲 vs 半甲）。 */
function renderHpArmor(frame: WorkspaceReplayFrame) {
  const fullArmor = frame.hasHelmet && frame.armor >= 100;
  const armorColor = fullArmor ? 'var(--dak-accent)' : 'var(--dak-accent-b)';
  const armorLabel = !frame.hasHelmet ? '半甲' : frame.armor >= 100 ? '全甲' : `甲 ${frame.armor}`;
  return (
    <div className="dak-hp-bar-wrap" title={`${frame.hp} HP · ${armorLabel}`}>
      <div className="dak-hp-bar-track">
        <div
          className="dak-hp-bar"
          style={{ width: `${frame.hp}%`, background: hpBarColor(frame.hp) }}
        />
      </div>
      {frame.armor > 0 && (
        <div
          className="dak-armor-bar"
          style={{ width: `${frame.armor}%`, background: armorColor }}
        />
      )}
    </div>
  );
}

function hpBarColor(hp: number): string {
  if (hp > 60) return 'var(--dak-ok)';
  if (hp > 30) return 'var(--dak-warn)';
  return 'var(--dak-danger)';
}

// 刀/各类投掷物/C4 不算枪：用于判定逐帧手持是否应替换主武器显示
function isGunWeapon(weapon: string): boolean {
  if (weapon === 'c4' || weapon === 'taser') return false;
  if (weapon.includes('knife') || weapon.includes('bayonet') || weapon === 'karambit') return false;
  if (
    weapon.includes('grenade') ||
    weapon === 'flashbang' ||
    weapon === 'molotov' ||
    weapon === 'decoy'
  )
    return false;
  return true;
}

function primaryLoadoutLabel(loadout: WorkspaceReplayLoadout): string {
  const weapon = loadout.primaryWeapon ?? loadout.secondaryWeapon;
  return weapon ? displayWeaponName(weapon) : '—';
}

function heldUtilityLabel(loadout: WorkspaceReplayLoadout): string {
  if (loadout.grenades.length === 0) {
    return `道具 x${loadout.grenadeCount}`;
  }
  const counts = new Map<WorkspaceReplayLoadout['grenades'][number], number>();
  for (const grenade of loadout.grenades) {
    counts.set(grenade, (counts.get(grenade) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([grenade, count]) => `${grenadeShortLabel(grenade)}${count > 1 ? count : ''}`)
    .join(' ');
}

function grenadeShortLabel(grenade: WorkspaceReplayLoadout['grenades'][number]): string {
  if (grenade === 'flashbang') return '闪';
  if (grenade === 'smoke') return '烟';
  if (grenade === 'molotov' || grenade === 'incendiary') return '火';
  if (grenade === 'hegrenade') return '雷';
  return '诱';
}

function replayPointPercent(frame: { x: number; y: number }, map: MapView) {
  const calibration = getMapCalibration(map.name);
  if (calibration) {
    const radar = worldToRadar(frame, calibration);
    if (!radar.outOfBounds) {
      return {
        x: (radar.x / calibration.radarSize) * 100,
        y: (radar.y / calibration.radarSize) * 100,
      };
    }
  }
  return {
    x: Math.max(4, Math.min(96, 50 + frame.x / 70)),
    y: Math.max(4, Math.min(96, 50 - frame.y / 70)),
  };
}

function replayFramePosition(frame: { x: number; y: number }, map: MapView) {
  const pos = replayPointPercent(frame, map);
  return { left: `${pos.x}%`, top: `${pos.y}%` };
}

/** world 半径 → 相对舞台宽度的百分比；无标定时给一个保底视觉尺寸。 */
function replayRadiusPercent(radiusUnits: number, map: MapView): number {
  const calibration = getMapCalibration(map.name);
  if (!calibration) return 4;
  return (radiusUnits / calibration.scale / calibration.radarSize) * 100;
}

// 效果消失 tick 缺失时的保底时长（秒）；半径为近似游戏单位，只服务视觉示意。
const GRENADE_EFFECT_DEFAULTS: Record<
  string,
  {
    durationSeconds: number;
    radiusUnits: number;
    kind: 'smoke' | 'fire' | 'he' | 'flash' | 'decoy';
  }
> = {
  smoke: { durationSeconds: 20, radiusUnits: 144, kind: 'smoke' },
  molotov: { durationSeconds: 7, radiusUnits: 120, kind: 'fire' },
  incendiary: { durationSeconds: 5.5, radiusUnits: 120, kind: 'fire' },
  hegrenade: { durationSeconds: 0.7, radiusUnits: 90, kind: 'he' },
  flashbang: { durationSeconds: 0.7, radiusUnits: 70, kind: 'flash' },
  decoy: { durationSeconds: 15, radiusUnits: 30, kind: 'decoy' },
};

type ReplayRoundModel = WorkspaceReplayRound;

/** 道具效果（烟/火/爆/闪）+ 飞行轨迹叠加层，按 currentTick 过滤生命周期。
 *  level 非 null 时（双层地图）效果只画在所属层，飞行物按当前帧 z 过滤。 */
function GrenadeEffectLayer({
  round,
  currentTick,
  tickrate,
  map,
  level = null,
  levelOf,
}: {
  round: ReplayRoundModel;
  currentTick: number;
  tickrate: number;
  map: MapView;
  level?: MapLevel | null;
  levelOf?: (z: number) => MapLevel;
}) {
  return (
    <>
      {round.grenades.map((row, index) => {
        const spec = GRENADE_EFFECT_DEFAULTS[row.grenade];
        if (!spec) return null;
        const endTick = row.destroyTick ?? row.effectTick + spec.durationSeconds * tickrate;
        if (currentTick < row.effectTick || currentTick > endTick) return null;
        if (level && levelOf && levelOf(row.effectZ ?? 0) !== level) return null;
        const sizePercent = replayRadiusPercent(spec.radiusUnits, map) * 2;
        const countdown =
          spec.kind === 'smoke' ? Math.max(0, Math.ceil((endTick - currentTick) / tickrate)) : null;
        return (
          <span
            key={`fx-${index}`}
            className={`dak-replay-fx dak-replay-fx-${spec.kind}${row.throwerSide ? ` dak-replay-fx-${row.throwerSide}` : ''}`}
            style={{
              ...replayFramePosition({ x: row.effectX, y: row.effectY }, map),
              width: `${sizePercent}%`,
              height: `${sizePercent}%`,
            }}
            aria-hidden="true"
          >
            {countdown != null && <span className="dak-replay-fx-countdown">{countdown}</span>}
          </span>
        );
      })}
      <svg
        className="dak-replay-trajectories"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {round.projectiles.map((proj, index) => {
          const frameIdx = Math.floor((currentTick - proj.startTick) / round.tickStep);
          if (frameIdx < 0 || frameIdx >= proj.x.length) return null;
          const points = proj.x
            .slice(0, frameIdx + 1)
            .map((x, i) => {
              const pos = replayPointPercent({ x, y: proj.y[i] }, map);
              return `${pos.x},${pos.y}`;
            })
            .join(' ');
          return (
            <polyline
              key={`trail-${index}`}
              className={`dak-replay-trail dak-replay-trail-${proj.grenade}`}
              points={points}
            />
          );
        })}
      </svg>
      {round.projectiles.map((proj, index) => {
        const frameIdx = Math.floor((currentTick - proj.startTick) / round.tickStep);
        if (frameIdx < 0 || frameIdx >= proj.x.length) return null;
        const projZ = proj.z?.[frameIdx];
        if (level && levelOf && projZ != null && levelOf(projZ) !== level) return null;
        return (
          <span
            key={`proj-${index}`}
            className={`dak-replay-projectile dak-replay-projectile-${proj.grenade}`}
            style={replayFramePosition({ x: proj.x[frameIdx], y: proj.y[frameIdx] }, map)}
            aria-hidden="true"
          />
        );
      })}
    </>
  );
}

/** 下包后的 C4 定点标记：拆除转绿、爆炸先闪后熄。 */
function BombMarker({
  bomb,
  currentTick,
  tickrate,
  map,
  offLevel = false,
}: {
  bomb: ReplayRoundModel['bomb'];
  currentTick: number;
  tickrate: number;
  map: MapView;
  /** 双层地图且 C4 在另一层时隐藏。 */
  offLevel?: boolean;
}) {
  if (!bomb || currentTick < bomb.plantTick || offLevel) return null;
  const defused = bomb.defuseTick != null && currentTick >= bomb.defuseTick;
  const exploded = !defused && bomb.explodeTick != null && currentTick >= bomb.explodeTick;
  const exploding =
    exploded && bomb.explodeTick != null && currentTick <= bomb.explodeTick + 2 * tickrate;
  const state = defused ? 'defused' : exploded ? (exploding ? 'exploding' : 'exploded') : 'armed';
  return (
    <span
      className={`dak-replay-bomb dak-replay-bomb-${state}`}
      style={replayFramePosition(bomb, map)}
      title={defused ? 'C4 已拆除' : exploded ? 'C4 已爆炸' : 'C4 已安放'}
    >
      c4
    </span>
  );
}
