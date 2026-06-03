import { displayWeaponName } from "@cs2dak/core";
import type { WorkspaceKillEvent } from "@cs2dak/contract";

export interface KillFeedProps {
  kills: WorkspaceKillEvent[];
  currentTick: number;
  /** Ticks per second — used to compute the fade window. */
  tickrate: number | null;
}

const WINDOW_SECONDS = 8;

export function KillFeed({ kills, currentTick, tickrate }: KillFeedProps) {
  const windowTicks = WINDOW_SECONDS * (tickrate ?? 64);
  const visible = kills
    .filter((k) => k.tick <= currentTick && k.tick > currentTick - windowTicks)
    .slice(-5)
    .reverse();

  if (visible.length === 0) return null;

  return (
    <div className="dak-killfeed" aria-label="Kill feed">
      {visible.map((k) => (
        <div key={k.id} className="dak-killfeed-row">
          <span className={`dak-killfeed-name dak-killfeed-name-${k.killerTeamKey ?? "none"}`}>
            {k.killerName ?? "环境"}
          </span>
          <span className="dak-killfeed-weapon">{displayWeaponName(k.weapon)}</span>
          <span className="dak-killfeed-victim">{k.victimName}</span>
          <span className="dak-killfeed-badges">
            {k.headshot && <b className="dak-kf-badge dak-kf-hs">HS</b>}
            {k.tradeKill && <b className="dak-kf-badge dak-kf-tr">TR</b>}
            {k.throughSmoke && <b className="dak-kf-badge dak-kf-smk">SMK</b>}
            {k.noScope && <b className="dak-kf-badge dak-kf-ns">NS</b>}
            {k.flashAssist && <b className="dak-kf-badge dak-kf-fa">FA</b>}
          </span>
        </div>
      ))}
    </div>
  );
}
