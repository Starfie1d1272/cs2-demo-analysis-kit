import { describe, expect, it } from "vitest";
import type { DemoPackage, Duels, PackageDamage, PackageKill, PackageShots } from "@cs2dak/contract";
import { buildMechanicsSignals, derivePlayerMechanics } from "./mechanics.js";

const A = "76561198000000001";
const AI = 0;

/** Build columnar PackageShots from a flat shot list. */
function buildShots(
  shots: Array<{ tick: number; playerIndex: number; vx?: number; vy?: number; weaponIndex?: number }>
): PackageShots {
  const groups = new Map<string, Array<{ tick: number; playerIndex: number; vx: number; vy: number; weaponIndex: number }>>();
  for (const s of shots) {
    const key = `1:${s.playerIndex}`;
    const arr = groups.get(key) ?? [];
    arr.push({ tick: s.tick, playerIndex: s.playerIndex, vx: s.vx ?? 0, vy: s.vy ?? 0, weaponIndex: s.weaponIndex ?? 0 });
    groups.set(key, arr);
  }
  const tracks: PackageShots["tracks"] = [];
  for (const items of groups.values()) {
    const deltas: number[] = [];
    let prev = 0;
    for (const { tick } of items) { deltas.push(tick - prev); prev = tick; }
    const n = items.length;
    tracks.push({
      roundNumber: 1,
      playerIndex: items[0]!.playerIndex,
      tick: deltas,
      weapon: items.map((s) => s.weaponIndex),
      vx: items.map((s) => s.vx),
      vy: items.map((s) => s.vy),
      vz: Array<number>(n).fill(0),
      yaw: Array<number>(n).fill(0),
      pitch: Array<number>(n).fill(0),
      x: Array<number>(n).fill(0),
      y: Array<number>(n).fill(0),
      z: Array<number>(n).fill(0),
    });
  }
  return { meta: { coordScale: 1, angleScale: 10 }, weaponDict: ["ak47", "flashbang", "knife"], tracks };
}

function damage(tick: number): PackageDamage {
  return {
    roundNumber: 1,
    tick,
    attackerIndex: AI,
    victimIndex: 1,
    weapon: "ak47",
    hitgroup: "head",
    healthDamage: 100,
    healthDamageRaw: 100,
    armorDamage: 0,
    victimHealthBefore: 100,
    victimArmorAfter: 100,
    attackerPosition: { x: 0, y: 0, z: 0 },
    victimPosition: { x: 100, y: 0, z: 0 }
  };
}

function kill(tick: number, weapon = "ak47"): PackageKill {
  return {
    roundNumber: 1,
    tick,
    killerIndex: AI,
    victimIndex: 1,
    assisterIndex: null,
    flashAssisterIndex: null,
    weapon,
    killerActiveWeapon: weapon,
    victimActiveWeapon: null,
    headshot: false,
    flashAssist: false,
    tradeKill: false,
    tradeDeath: false,
    throughSmoke: false,
    noScope: false,
    penetratedObjects: 0,
    killerPosition: { x: 0, y: 0, z: 0 },
    victimPosition: { x: 100, y: 0, z: 0 }
  };
}

function pkg(overrides: Partial<DemoPackage>): DemoPackage {
  return {
    manifest: {
      schemaVersion: "cs2-demo-format/3.0",
      exporter: { name: "test", version: "0" },
      parser: { name: "test", version: "0" },
      demo: { hash: null, sourceFileName: null },
      mapName: "de_mirage",
      tickrate: 64,
      exportedAt: "2026-01-01T00:00:00Z",
      files: {
        match: "match.json",
        players: "players.json",
        rounds: "rounds.json",
        playerStats: "player-stats.json",
        playerEconomies: "player-economies.json",
        kills: "kills.json",
        damages: "damages.json",
        blinds: "blinds.json",
        bombs: "bombs.json",
        grenades: "grenades.json",
        clutches: "clutches.json"
      }
    },
    match: {
      mapName: "de_mirage",
      tickrate: 64,
      durationSeconds: 120,
      serverName: null,
      source: "test",
      teamA: { teamKey: "teamA", name: "A", score: 1 },
      teamB: { teamKey: "teamB", name: "B", score: 0 }
    },
    players: [{ steamId64: A, name: "A", teamKey: "teamA" }, { steamId64: "76561198000000002", name: "B", teamKey: "teamB" }],
    rounds: [],
    playerEconomies: [],
    playerStats: [],
    kills: [],
    damages: [],
    blinds: [],
    bombs: [],
    grenades: [],
    clutches: [],
    ...overrides
  } as DemoPackage;
}

describe("derivePlayerMechanics", () => {
  it("splits bursts and computes first-shot, spray, rhythm, and counter-strafe metrics", () => {
    const demo = pkg({
      shots: buildShots([
        { tick: 100, playerIndex: AI, weaponIndex: 0 }, // ak47
        { tick: 110, playerIndex: AI, weaponIndex: 0, vx: 20 },
        { tick: 120, playerIndex: AI, weaponIndex: 0, vx: 20 },
        { tick: 130, playerIndex: AI, weaponIndex: 0, vx: 20 },
        { tick: 140, playerIndex: AI, weaponIndex: 0, vx: 120 },
        { tick: 300, playerIndex: AI, weaponIndex: 0 },
        { tick: 310, playerIndex: AI, weaponIndex: 1 }, // flashbang
        { tick: 320, playerIndex: AI, weaponIndex: 2 }, // knife
      ]),
      damages: [damage(100), damage(140)],
      kills: [kill(140)]
    });

    const row = derivePlayerMechanics(demo)[0]!;
    expect(row).toMatchObject({ steamId64: A, weapon: "ak47", killCount: 1, burstCount: 2, shotCount: 6 });
    // 只有交火 burst（造成伤害的 burst1）计入首发；尾随的 300 burst 既无伤害也无 duels 窗口，被排除。
    expect(row.firstShotHit).toEqual({ value: 100, successes: 1, attempts: 1 });
    // ak 自动武器，burst1 长度 5 → 第 4 发起 [130,140]，仅 140 命中。
    expect(row.sprayHit).toEqual({ value: 50, successes: 1, attempts: 2 });
    // 无 duels 窗口 → 拿不到开枪前连续轨迹，无法判定移动 → 不计入。
    expect(row.counterStrafe.attempts).toBe(0);
    expect(row.counterStrafe.value).toBeNull();
    expect(row.oneTap).toEqual({ value: 0, successes: 0, attempts: 1 });
    expect(row.ttk).toEqual({ value: 625, sampleSize: 1 });
    expect(row.burstLengthBuckets).toEqual({ single: 1, short: 0, medium: 1, long: 0 });
    expect(row.medianShotIntervalMs).toBeGreaterThan(0);
    expect(row.firingPatternRatio).toEqual({ tap: 50, burst: 50, spray: 0 });
    expect(buildMechanicsSignals(demo)).toMatchObject({
      version: "cs2-demo-analysis-kit/mechanics-signals-0.2",
      burstGapSeconds: 0.25
    });
    expect(derivePlayerMechanics(demo).map((item) => item.weapon)).toEqual(["ak47"]);
  });

  it("hides counter-strafe when exporter velocity is unavailable", () => {
    const demo = pkg({
      shots: buildShots([
        { tick: 100, playerIndex: AI },
        { tick: 300, playerIndex: AI },
      ]),
      damages: [damage(100)]
    });

    expect(derivePlayerMechanics(demo)[0]!.counterStrafe.value).toBeNull();
  });

  it("sorts weapon rows by kill count before shot volume", () => {
    const demo = pkg({
      shots: buildShots([
        { tick: 100, playerIndex: AI, weaponIndex: 0 },
        { tick: 110, playerIndex: AI, weaponIndex: 0 },
        { tick: 120, playerIndex: AI, weaponIndex: 0 },
        { tick: 300, playerIndex: AI, weaponIndex: 0 }, // deagle(0) — same weaponIndex
      ]),
      kills: [kill(300, "deagle")]
    });

    const rows = derivePlayerMechanics(demo);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.weapon).toBe("ak47");
  });

  it("returns an empty list when shots are unavailable", () => {
    const noShots: DemoPackage = { ...pkg({}), shots: undefined as unknown as PackageShots };
    expect(derivePlayerMechanics(noShots)).toEqual([]);
  });
});

// ── duels.json 满 tick 窗口路径：急停 / 反应 / 预瞄 ──

function encodeDelta(values: number[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const value of values) { out.push(value - prev); prev = value; }
  return out;
}

function duelTrack(playerIndex: number, abs: { x: number[]; y: number[]; z: number[]; yaw: number[]; pitch: number[]; hp: number[]; flash: number[] }) {
  return {
    playerIndex,
    x: encodeDelta(abs.x),
    y: encodeDelta(abs.y),
    z: encodeDelta(abs.z),
    yaw: encodeDelta(abs.yaw.map((deg) => deg * 10)),
    pitch: encodeDelta(abs.pitch.map((deg) => deg * 10)),
    hp: abs.hp,
    flash: abs.flash
  };
}

describe("derivePlayerMechanics with duels window", () => {
  it("derives counter-strafe, reaction onset, and preaim from the full-tick track", () => {
    const N = 200; // 帧 i 对应 tick 100+i，覆盖 100..299
    const killerX: number[] = [];
    const killerFlash: number[] = [];
    for (let i = 0; i < N; i++) {
      const tick = 100 + i;
      // 击杀者在 tick 183..193 内移动（用于急停尝试），之后停稳
      killerX.push(tick <= 182 ? 0 : tick <= 193 ? (tick - 182) * 10 : 110);
      // 被闪到 tick 185，186 起恢复视野 → 反应 onset = tick 186
      killerFlash.push(tick <= 185 ? 10 : 0);
    }
    const constant = (value: number) => Array<number>(N).fill(value);
    const duels: Duels = {
      meta: { tickrate: 64, sampleRate: 64, coordScale: 1, angleScale: 10, windowBeforeMs: 2000, windowAfterMs: 1000 },
      windows: [{
        roundNumber: 1,
        startTick: 100,
        tickStep: 1,
        frameCount: N,
        anchors: [{ kind: "kill", tick: 200, attackerIndex: AI, victimIndex: 1 }],
        players: [
          duelTrack(AI, { x: killerX, y: constant(0), z: constant(0), yaw: constant(0), pitch: constant(0), hp: constant(100), flash: killerFlash }),
          duelTrack(1, { x: constant(2000), y: constant(0), z: constant(0), yaw: constant(0), pitch: constant(0), hp: constant(100), flash: constant(0) })
        ]
      }]
    };

    const demo = pkg({
      shots: buildShots([
        { tick: 196, playerIndex: AI, weaponIndex: 0 }, // 首发已停稳（vx/vy = 0）
        { tick: 198, playerIndex: AI, weaponIndex: 0 },
        { tick: 200, playerIndex: AI, weaponIndex: 0, vx: 30 } // 后续仍有移动 → 全局 velocity 非全零
      ]),
      damages: [damage(196), damage(200)],
      kills: [kill(200)],
      duels
    });

    const row = derivePlayerMechanics(demo)[0]!;
    // 急停：开枪前在移动（>100 u/s），开枪时停稳（≤ ak 阈值 73）→ 成功一次
    expect(row.counterStrafe).toEqual({ value: 100, successes: 1, attempts: 1 });
    // 反应：onset = tick 186（被闪恢复），首发 196 → (196-186)/64*1000 = 156.3ms
    expect(row.reaction.sampleSize).toBe(1);
    expect(row.reaction.value).toBe(156.3);
    // 预瞄：onset 前 3 帧准星对准敌人 → 中位误差极小，命中 ≤5°
    expect(row.preaim.sampleSize).toBe(1);
    expect(row.preaim.withinFiveCount).toBe(1);
    expect(row.preaim.medianDegrees).not.toBeNull();
    expect(row.preaim.medianDegrees!).toBeLessThan(5);
    // 首发命中（196 命中）+ TTK（196→200）
    expect(row.firstShotHit).toEqual({ value: 100, successes: 1, attempts: 1 });
    expect(row.ttk).toEqual({ value: 62.5, sampleSize: 1 });
  });

  it("uses the previous alive frame as reaction anchor for lethal first shots", () => {
    const N = 120; // 帧 i 对应 tick 100+i
    const constant = (value: number) => Array<number>(N).fill(value);
    const killerFlash = Array.from({ length: N }, (_, i) => (100 + i <= 170 ? 10 : 0));
    const victimHp = Array<number>(N).fill(100);
    victimHp[80] = 0; // shotTick == killTick == 180 时，窗口帧已记录受害者死亡
    const duels: Duels = {
      meta: { tickrate: 64, sampleRate: 64, coordScale: 1, angleScale: 10, windowBeforeMs: 2000, windowAfterMs: 1000 },
      windows: [{
        roundNumber: 1,
        startTick: 100,
        tickStep: 1,
        frameCount: N,
        anchors: [{ kind: "kill", tick: 180, attackerIndex: AI, victimIndex: 1 }],
        players: [
          duelTrack(AI, { x: constant(0), y: constant(0), z: constant(0), yaw: constant(0), pitch: constant(0), hp: constant(100), flash: killerFlash }),
          duelTrack(1, { x: constant(2000), y: constant(0), z: constant(0), yaw: constant(0), pitch: constant(0), hp: victimHp, flash: constant(0) })
        ]
      }]
    };

    const demo = pkg({
      shots: buildShots([{ tick: 180, playerIndex: AI, weaponIndex: 0 }]),
      damages: [damage(180)],
      kills: [kill(180)],
      duels
    });

    const row = derivePlayerMechanics(demo)[0]!;
    // onset = tick 171（闪光结束后的第一帧），首发/击杀 tick 180。
    expect(row.reaction).toEqual({ value: 140.6, sampleSize: 1 });
    expect(row.preaim.sampleSize).toBe(1);
    expect(row.oneTap).toEqual({ value: 100, successes: 1, attempts: 1 });
  });

  it("uses the full-tick track speed for counter-strafe success when shot velocity is noisy", () => {
    const N = 140;
    const killerX: number[] = [];
    for (let i = 0; i < N; i++) {
      const tick = 100 + i;
      killerX.push(tick <= 182 ? 0 : tick <= 193 ? (tick - 182) * 10 : 110);
    }
    const constant = (value: number) => Array<number>(N).fill(value);
    const duels: Duels = {
      meta: { tickrate: 64, sampleRate: 64, coordScale: 1, angleScale: 10, windowBeforeMs: 2000, windowAfterMs: 1000 },
      windows: [{
        roundNumber: 1,
        startTick: 100,
        tickStep: 1,
        frameCount: N,
        anchors: [{ kind: "kill", tick: 200, attackerIndex: AI, victimIndex: 1 }],
        players: [
          duelTrack(AI, { x: killerX, y: constant(0), z: constant(0), yaw: constant(0), pitch: constant(0), hp: constant(100), flash: constant(0) }),
          duelTrack(1, { x: constant(2000), y: constant(0), z: constant(0), yaw: constant(0), pitch: constant(0), hp: constant(100), flash: constant(0) })
        ]
      }]
    };
    const demo = pkg({
      shots: buildShots([
        { tick: 196, playerIndex: AI, weaponIndex: 0, vx: 450 },
        { tick: 200, playerIndex: AI, weaponIndex: 0, vx: 30 }
      ]),
      damages: [damage(196), damage(200)],
      kills: [kill(200)],
      duels
    });

    expect(derivePlayerMechanics(demo)[0]!.counterStrafe).toEqual({ value: 100, successes: 1, attempts: 1 });
  });

  it("excludes through-smoke and wallbang kills from clean TTK and one-tap samples", () => {
    const demo = pkg({
      shots: buildShots([
        { tick: 100, playerIndex: AI, weaponIndex: 0 },
        { tick: 220, playerIndex: AI, weaponIndex: 0 }
      ]),
      damages: [damage(100), damage(220)],
      kills: [
        { ...kill(100), throughSmoke: true },
        { ...kill(220), penetratedObjects: 1 }
      ]
    });
    const row = derivePlayerMechanics(demo)[0]!;

    expect(row.ttk).toEqual({ value: null, sampleSize: 0 });
    expect(row.oneTap).toEqual({ value: null, successes: 0, attempts: 0 });
  });
});
