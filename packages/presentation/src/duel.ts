import type { DemoPackage, DuelInsightsModel, DuelFinderRow, MechanicsMetric, OpeningDuelRow, PlayerMechanicsRow } from "@cs2dak/contract";
import { duelInsightsModelSchema } from "@cs2dak/contract";
import { deriveDuels, deriveOpeningDuels, derivePlayerMechanics, type PlayerMechanicsFact, type RateSample } from "@cs2dak/core";
import type { TriangleBvh } from "@cs2dak/maps";

export interface DuelInsightsInput {
  matchId: string;
  pkg: DemoPackage;
}

export interface DuelInsightsOptions {
  /** 按地图名提供 .tri BVH；提供后分类、反应时间、预瞄与首发可见性走静态 LOS 精确口径。 */
  visibilityFor?: (mapName: string) => TriangleBvh | null;
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  contested_duel: "对枪胜出",
  suppressed_kill: "先手压制击杀",
  caught_off_guard: "侧背身击杀"
};

function nameFor(pkg: DemoPackage, steamId64: string): string {
  return pkg.players.find((player) => player.steamId64 === steamId64)?.name ?? steamId64;
}

function teamNameFor(pkg: DemoPackage, teamKey: string): string {
  return teamKey === "teamA" ? (pkg.match.teamA.name ?? "Team A") : (pkg.match.teamB.name ?? "Team B");
}

function duelRow(input: DuelInsightsInput, fact: ReturnType<typeof deriveDuels>[number]): DuelFinderRow {
  return {
    id: `${input.matchId}:${fact.id}`,
    matchId: input.matchId,
    mapName: input.pkg.match.mapName,
    roundNumber: fact.roundNumber,
    tick: fact.tick,
    killerSteamId64: fact.killerSteamId64,
    victimSteamId64: fact.victimSteamId64,
    killerName: nameFor(input.pkg, fact.killerSteamId64),
    victimName: nameFor(input.pkg, fact.victimSteamId64),
    weapon: fact.weapon,
    classification: fact.classification,
    hpBucket: fact.hpBucket,
    thirdParty: fact.thirdParty,
    fullHealth: fact.fullHealth,
    victimHealthBefore: fact.victimHealthBefore,
    killerHealthBefore: fact.killerHealthBefore,
    ttkMs: fact.ttkMs,
    oneShotKill: fact.oneShotKill,
    evidenceTicks: fact.evidenceTicks,
    killerPosition: fact.killerPosition,
    victimPosition: fact.victimPosition,
    evidence: { matchId: input.matchId, roundNumber: fact.roundNumber, tick: fact.tick }
  };
}

/** CS2 标准回合时长（秒，freeze 结束后）。CLOCK_START 用于倒计时显示。 */
const ROUND_DURATION = 115;

function openingRow(input: DuelInsightsInput, fact: ReturnType<typeof deriveDuels>[number]): OpeningDuelRow {
  const tickrate = input.pkg.match.tickrate || input.pkg.manifest.tickrate || 64;
  const roundRow = input.pkg.rounds.find((r) => r.roundNumber === fact.roundNumber);
  let roundTimeLabel: string | null = null;
  if (roundRow && roundRow.freezeEndTick != null && tickrate > 0) {
    const elapsed = (fact.tick - roundRow.freezeEndTick) / tickrate;
    const remaining = Math.max(0, ROUND_DURATION - elapsed);
    const min = Math.floor(remaining / 60);
    const sec = Math.round(remaining % 60);
    roundTimeLabel = `${min}:${String(sec).padStart(2, "0")}`;
  }
  return {
    ...duelRow(input, fact),
    attackerCallout: null,
    victimCallout: null,
    roundTimeLabel
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? round1((sorted[mid - 1]! + sorted[mid]!) / 2) : round1(sorted[mid]!);
}

function rate(successes: number, attempts: number): RateSample {
  return { value: attempts > 0 ? round1((successes / attempts) * 100) : null, successes, attempts };
}

function sumRate(a: RateSample, b: RateSample): RateSample {
  return rate(a.successes + b.successes, a.attempts + b.attempts);
}

function rankLabel(value: number | null, values: number[], higherIsBetter = true): string | null {
  if (value == null || values.length < 1) return null;
  const sorted = [...values].sort((a, b) => higherIsBetter ? b - a : a - b);
  const rank = sorted.findIndex((candidate) => candidate === value) + 1;
  return rank > 0 ? `当前范围前 ${Math.max(1, Math.round((rank / values.length) * 100))}%` : null;
}

// ── 武器分类 → 定制展示指标集（参考 5E「武器分析」：每类武器只展示有意义的特征）──
export type MechanicsMetricKey = "firstShotHit" | "sprayHit" | "counterStrafe" | "oneTap" | "ttk" | "reaction" | "preaim" | "headshot" | "killsPerMatch";
type MetricKey = MechanicsMetricKey;
export type WeaponCategory = "rifle" | "sniper" | "pistol" | "smg" | "shotgun_lmg" | "other";

const RIFLES = new Set(["ak47", "m4a1", "m4a4", "m4a1_silencer", "aug", "sg556", "sg553", "famas", "galilar", "galil"]);
const SNIPERS = new Set(["awp", "ssg08", "scar20", "g3sg1"]);
const PISTOLS = new Set(["deagle", "revolver", "glock", "usp_silencer", "usp", "hkp2000", "p2000", "p250", "fiveseven", "tec9", "cz75a", "cz75", "elite"]);
const SMGS = new Set(["mp9", "mp7", "mp5sd", "ump45", "p90", "bizon", "mac10"]);
const SHOTGUNS_LMG = new Set(["nova", "xm1014", "mag7", "sawedoff", "m249", "negev"]);
const ONE_TAP_CAPABLE = new Set(["ak47", "sg556", "sg553", "deagle", "revolver", "awp", "ssg08", "scar20", "g3sg1"]);

export function weaponCategory(weapon: string): WeaponCategory {
  const w = weapon.toLowerCase();
  if (RIFLES.has(w)) return "rifle";
  if (SNIPERS.has(w)) return "sniper";
  if (PISTOLS.has(w)) return "pistol";
  if (SMGS.has(w)) return "smg";
  if (SHOTGUNS_LMG.has(w)) return "shotgun_lmg";
  return "other";
}

// 狙击：去 TTK(≈0)/扫射/one tap(恒满)/预瞄(多为架枪)；手枪：去扫射；冲锋枪：弱化预瞄。
export const CATEGORY_METRICS: Record<WeaponCategory, MetricKey[]> = {
  rifle: ["firstShotHit", "sprayHit", "counterStrafe", "ttk", "oneTap", "reaction", "preaim", "headshot", "killsPerMatch"],
  sniper: ["firstShotHit", "counterStrafe", "reaction", "headshot", "killsPerMatch"],
  pistol: ["firstShotHit", "counterStrafe", "ttk", "oneTap", "reaction", "headshot", "killsPerMatch"],
  smg: ["firstShotHit", "sprayHit", "counterStrafe", "ttk", "reaction", "headshot", "killsPerMatch"],
  shotgun_lmg: ["firstShotHit", "counterStrafe", "ttk", "reaction", "headshot", "killsPerMatch"],
  other: ["firstShotHit", "counterStrafe", "reaction", "headshot", "killsPerMatch"]
};

export function mechanicsMetricsForWeapon(weapon: string): MetricKey[] {
  const category = weaponCategory(weapon);
  const keys = CATEGORY_METRICS[category];
  if (ONE_TAP_CAPABLE.has(weapon.toLowerCase())) return keys;
  return keys.filter((key) => key !== "oneTap");
}

const LOWER_IS_BETTER = new Set<MetricKey>(["ttk", "reaction", "preaim"]);

/** 跨场按 (steamId64, weapon) 聚合后的枪法事实。 */
interface AggMechanics {
  steamId64: string;
  playerName: string;
  teamName: string;
  weapon: string;
  killCount: number;
  cleanKillCount: number;
  headshotKills: number;
  cleanHeadshotKills: number;
  shotCount: number;
  burstCount: number;
  firstShotHit: RateSample;
  sprayHit: RateSample | null;
  counterStrafe: RateSample;
  oneTap: RateSample;
  ttkSamples: number[];
  reactionSamples: number[];
  preaimSamples: number[];
  burstLengthBuckets: PlayerMechanicsFact["burstLengthBuckets"];
}

/** 取某指标的标量值（用于该 agg 展示 + 跨 agg 百分位）。 */
function metricValueOf(agg: AggMechanics, key: MetricKey, matchesPlayed: number): number | null {
  switch (key) {
    case "firstShotHit": return agg.firstShotHit.value;
    case "sprayHit": return agg.sprayHit?.value ?? null;
    case "counterStrafe": return agg.counterStrafe.value;
    case "oneTap": return agg.oneTap.value;
    case "ttk": return median(agg.ttkSamples);
    case "reaction": return median(agg.reactionSamples);
    case "preaim": return median(agg.preaimSamples);
    case "headshot": return agg.cleanKillCount > 0 ? round1((agg.cleanHeadshotKills / agg.cleanKillCount) * 100) : null;
    case "killsPerMatch": return matchesPlayed > 0 ? round1(agg.killCount / matchesPlayed) : null;
  }
}

function buildMetric(key: MetricKey, agg: AggMechanics, allAggs: AggMechanics[], matchesByPlayer: Map<string, number>): MechanicsMetric {
  const matchesPlayed = matchesByPlayer.get(agg.steamId64) ?? 1;
  const value = metricValueOf(agg, key, matchesPlayed);
  const peers = allAggs
    .map((other) => metricValueOf(other, key, matchesByPlayer.get(other.steamId64) ?? 1))
    .filter((candidate): candidate is number => candidate != null);
  const percentileLabel = rankLabel(value, peers, !LOWER_IS_BETTER.has(key));
  const base = { key, value, percentileLabel };
  switch (key) {
    case "firstShotHit": return { ...base, label: "首发命中率", unit: "%", successes: agg.firstShotHit.successes, attempts: agg.firstShotHit.attempts };
    case "sprayHit": return { ...base, label: "扫射命中率", unit: "%", successes: agg.sprayHit?.successes, attempts: agg.sprayHit?.attempts };
    case "counterStrafe": return { ...base, label: "急停成功率", unit: "%", successes: agg.counterStrafe.successes, attempts: agg.counterStrafe.attempts };
    case "oneTap": return { ...base, label: "one tap 率", unit: "%", successes: agg.oneTap.successes, attempts: agg.oneTap.attempts };
    case "ttk": return { ...base, label: "TTK", unit: "ms", sampleSize: agg.ttkSamples.length };
    case "reaction": return { ...base, label: "反应时间", unit: "ms", sampleSize: agg.reactionSamples.length };
    case "preaim": {
      const withinFive = agg.preaimSamples.filter((value) => value <= 5).length;
      return {
        ...base,
        label: "预瞄误差",
        unit: "°",
        sampleSize: agg.preaimSamples.length,
        detail: agg.preaimSamples.length > 0 ? `${withinFive}/${agg.preaimSamples.length} ≤5°` : undefined
      };
    }
    case "headshot": return { ...base, label: "爆头率", unit: "%", successes: agg.cleanHeadshotKills, attempts: agg.cleanKillCount };
    case "killsPerMatch": return { ...base, label: "场均击杀", unit: "", detail: `${agg.killCount} 杀 / ${matchesPlayed} 场` };
  }
}

/**
 * 单条武器画像：按武器类别只展示有意义的指标。命中率类带分子/分母，中位类带样本数；
 * TTK / 反应时间 / 预瞄误差 越低越好。
 */
function mechanicsRow(agg: AggMechanics, allAggs: AggMechanics[], matchesByPlayer: Map<string, number>): PlayerMechanicsRow {
  const metrics: MechanicsMetric[] = mechanicsMetricsForWeapon(agg.weapon).map((key) => buildMetric(key, agg, allAggs, matchesByPlayer));
  const buckets = agg.burstLengthBuckets;
  const total = buckets.single + buckets.short + buckets.medium + buckets.long;
  return {
    steamId64: agg.steamId64,
    playerName: agg.playerName,
    teamName: agg.teamName,
    weapon: agg.weapon,
    killCount: agg.killCount,
    shotCount: agg.shotCount,
    burstCount: agg.burstCount,
    metrics,
    burstLengthBuckets: buckets,
    firingPatternRatio: total > 0
      ? { tap: round1((buckets.single / total) * 100), burst: round1(((buckets.short + buckets.medium) / total) * 100), spray: round1((buckets.long / total) * 100) }
      : { tap: 0, burst: 0, spray: 0 }
  };
}

export function duelClassificationLabel(classification: string): string {
  return CLASSIFICATION_LABEL[classification] ?? classification;
}

export function buildDuelInsights(inputs: DuelInsightsInput[], options: DuelInsightsOptions = {}): DuelInsightsModel {
  const duelRows: DuelFinderRow[] = [];
  const openingRows: OpeningDuelRow[] = [];
  // 跨场按 (steamId64, weapon) 聚合，避免同一选手同把武器在多场各出一行。
  const aggByKey = new Map<string, AggMechanics>();
  const matchesByPlayer = new Map<string, Set<string>>();

  for (const input of inputs) {
    const visibility = options.visibilityFor?.(input.pkg.match.mapName) ?? null;
    duelRows.push(...deriveDuels(input.pkg, { visibility }).map((fact) => duelRow(input, fact)));
    openingRows.push(...deriveOpeningDuels(input.pkg, { visibility }).map((fact) => openingRow(input, fact)));
    for (const fact of derivePlayerMechanics(input.pkg, { visibility })) {
      const playerMatches = matchesByPlayer.get(fact.steamId64) ?? new Set<string>();
      playerMatches.add(input.matchId);
      matchesByPlayer.set(fact.steamId64, playerMatches);
      const key = `${fact.steamId64}:${fact.weapon}`;
      const teamName = teamNameFor(input.pkg, fact.teamKey);
      const prev = aggByKey.get(key);
      if (!prev) {
        aggByKey.set(key, {
          steamId64: fact.steamId64,
          playerName: fact.playerName,
          teamName,
          weapon: fact.weapon,
          killCount: fact.killCount,
          cleanKillCount: fact.cleanKillCount,
          headshotKills: fact.headshotKills,
          cleanHeadshotKills: fact.cleanHeadshotKills,
          shotCount: fact.shotCount,
          burstCount: fact.burstCount,
          firstShotHit: fact.firstShotHit,
          sprayHit: fact.sprayHit,
          counterStrafe: fact.counterStrafe,
          oneTap: fact.oneTap,
          ttkSamples: [...fact.ttkSamplesMs],
          reactionSamples: [...fact.reactionSamplesMs],
          preaimSamples: [...fact.preaimSamplesDeg],
          burstLengthBuckets: { ...fact.burstLengthBuckets }
        });
      } else {
        prev.teamName = teamName;
        prev.killCount += fact.killCount;
        prev.cleanKillCount += fact.cleanKillCount;
        prev.headshotKills += fact.headshotKills;
        prev.cleanHeadshotKills += fact.cleanHeadshotKills;
        prev.shotCount += fact.shotCount;
        prev.burstCount += fact.burstCount;
        prev.firstShotHit = sumRate(prev.firstShotHit, fact.firstShotHit);
        prev.sprayHit = fact.sprayHit == null ? prev.sprayHit : prev.sprayHit == null ? fact.sprayHit : sumRate(prev.sprayHit, fact.sprayHit);
        prev.counterStrafe = sumRate(prev.counterStrafe, fact.counterStrafe);
        prev.oneTap = sumRate(prev.oneTap, fact.oneTap);
        prev.ttkSamples.push(...fact.ttkSamplesMs);
        prev.reactionSamples.push(...fact.reactionSamplesMs);
        prev.preaimSamples.push(...fact.preaimSamplesDeg);
        prev.burstLengthBuckets.single += fact.burstLengthBuckets.single;
        prev.burstLengthBuckets.short += fact.burstLengthBuckets.short;
        prev.burstLengthBuckets.medium += fact.burstLengthBuckets.medium;
        prev.burstLengthBuckets.long += fact.burstLengthBuckets.long;
      }
    }
  }

  const aggs = [...aggByKey.values()];
  const matchCountByPlayer = new Map([...matchesByPlayer].map(([steamId64, set]) => [steamId64, set.size]));
  const mechanicsRows = aggs
    .map((agg) => mechanicsRow(agg, aggs, matchCountByPlayer))
    .sort((a, b) => b.killCount - a.killCount || b.shotCount - a.shotCount || a.playerName.localeCompare(b.playerName));

  return duelInsightsModelSchema.parse({
    version: "cs2-demo-analysis-kit/duel-insights-0.1",
    matchCount: inputs.length,
    duelRows,
    openingRows,
    mechanicsRows,
    notes: [
      "枪法质量指标使用 clean gunfight gate：排除第三方伤害、穿烟击杀和穿墙击杀；标题击杀数仍保留真实武器产出。",
      "首发命中率只统计 clean combat burst（造成敌方伤害，或首发开枪时视野锥+LOS 内有活敌）的第一发，排除打门/预开枪。",
      "扫射命中率仅对 clean 全自动武器、长度≥5 的 burst 从第 4 发起统计；手枪/狙击/霰弹显示 —。",
      "急停成功率为 clean「移动后停稳」口径：用 duels 连续轨迹判断开枪前 200ms 是否在移动，只把移动样本计入分母，开枪时速度低于武器站立精准阈值记为成功；ZIP 无按键输入，不区分反向键。",
      "one tap 率仅对可一枪满血终结的武器展示，分母为 clean 满血(100HP)击杀。",
      "TTK 取 clean 满血击杀中 lethal burst 第一枪到击杀的中位，AK 一枪头可接近 0ms。",
      "反应时间从 clean 击杀者首发反向找当前连续可见段 onset（需 hp>0、未被闪、视野锥内、静态LOS通透、无烟）；首发即击杀时用上一帧仍存活的可见状态作为 anchor；窗口首帧已可见(左截断)、prefire、可见>1s(跟踪) 均剔除。",
      "预瞄误差取 clean onset 前 1~3 帧准星与目标的三维(yaw+pitch)夹角中位，并给出 ≤5° 比例。",
      "百分位标签基于当前聚合范围；未接入固定联赛基线时不输出 A/B/C。"
    ]
  });
}
