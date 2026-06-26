#!/usr/bin/env node
// 通用赛事包增量装配器 —— per-stage 版。
//
//   node scripts/build-event-package.mjs <spec.json> [--demos-root <dir>] [--out <dir>] [--stage <stageKey>]
//
// 读取 event-package 制作 spec + <demos-root>/<Stage>/*.zip，
// 按队伍名归一化匹配每个系列赛的 demo，按 stage 产出独立 event-package（共享 group 供 Gallery 折叠）：
//   <out>/{slug}-stage1.zip … {slug}-playoff.zip。
// 没有对应 demo 的系列自动跳过（增量）——下完一场重跑一次即可。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(message);
  console.error("用法：node scripts/build-event-package.mjs <spec.json> [--demos-root <dir>] [--out <dir>] [--stage <stageKey>]");
  process.exit(2);
}

const args = process.argv.slice(2);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const specArg = positional[0];
if (!specArg) fail("缺少 spec.json");

const expandHome = (p) => p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
const resolveFromRoot = (p) => resolve(ROOT, expandHome(p));
const SPEC = resolveFromRoot(specArg);
const spec = JSON.parse(readFileSync(SPEC, "utf8"));
const DEMOS = valueOf("--demos-root")
  ? resolveFromRoot(valueOf("--demos-root"))
  : resolveFromRoot(spec.export?.outRoot ?? dirname(SPEC));
const OUT = valueOf("--out") ? resolveFromRoot(valueOf("--out")) : join(DEMOS, "_build");
const ONLY_STAGE = valueOf("--stage");

// 队名归一化：小写 + 去非字母数字 + 去常见后缀，吸收 HLTV/demo 命名差异
// （"Lynn Vision Gaming" ↔ "Lynn Vision"、"B8 Esports" ↔ "B8"、"THUNDER dOWNUNDER" ↔ "THUNDERdOWNUNDER"）。
const normTeam = (s) => String(s).toLowerCase().replace(/\b(gaming|esports|team)\b/g, "").replace(/[^a-z0-9]/g, "");
// 地图显示名 → de_ 内部名（veto 用，需与 demo 的 mapName 同口径以便匹配 pickedBy）。
const deMap = (s) => (String(s).startsWith("de_") ? String(s) : "de_" + String(s).toLowerCase().replace(/[^a-z0-9]/g, ""));
// spec stage key → 目录名：stage1→Stage1, playoff→Playoff
const stageDirName = (k) => k.startsWith("stage") ? "Stage" + k.slice(5) : k.charAt(0).toUpperCase() + k.slice(1);
const stageKeyFromDirName = (stage) => String(stage).toLowerCase();
const mapPool = () => {
  const fromSpec = Array.isArray(spec.mapPool) ? spec.mapPool : [];
  const fromBp = (spec.series ?? []).flatMap((s) => (s.bp ?? []).map((b) => b[2]));
  return [...new Set([...fromSpec, ...fromBp].filter(Boolean).map(deMap))].sort();
};
const MAP_POOL = mapPool();

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const readMatchJson = (zip) => JSON.parse(execFileSync("unzip", ["-p", zip, "match.json"]).toString());
const readRounds = (zip) => JSON.parse(execFileSync("unzip", ["-p", zip, "rounds.json"]).toString());
// 导出脚本把 .dem mtime（比赛结束时间）存为同 base 的 .date sidecar（ISO 8601 一行）。
const readDate = (zipPath) => { try { return readFileSync(zipPath.replace(/\.zip$/, ".date"), "utf8").trim() || null; } catch { return null; } };

// 分段图的真实终局：按全局 roundNumber 去重、数 winnerTeamKey（各段的 teamA/B 经 direct 对齐到 series）。
// 不裸加各段 match.json，从而对「技术暂停重开」造成的回合号重叠也安全（大段覆盖小段）。
function scoreFromRoundsUnion(segs, seriesTeamAKey) {
  const winnerByRound = new Map(); // 全局 roundNumber → "A" | "B"
  // 小段在前、大段在后处理，重叠回合由大段（真实那段）覆盖
  for (const { d, rounds } of [...segs].sort((x, y) => x.rounds.length - y.rounds.length)) {
    const direct = d.a.key === seriesTeamAKey; // 该段 teamA 是否即 series 的 teamA
    for (const r of rounds) {
      const w = r.winnerTeamKey;
      if (w !== "teamA" && w !== "teamB") continue;
      const side = direct ? (w === "teamA" ? "A" : "B") : (w === "teamA" ? "B" : "A");
      winnerByRound.set(r.roundNumber, side);
    }
  }
  let scoreA = 0, scoreB = 0;
  for (const side of winnerByRound.values()) (side === "A" ? scoreA++ : scoreB++);
  return { scoreA, scoreB };
}

// 由 bp 构建 veto
function buildVeto(s) {
  const steps = s.bp.map((b, i) => ({
    stepOrder: i + 1,
    actionType: b[1],
    mapName: deMap(b[2]),
    teamKey: b[0],
    side: null,
  }));
  return {
    version: "cs2-demo-analysis-kit/series-veto-0.1",
    seriesId: s.key,
    format: s.format,
    teamAName: s.teamA,
    teamBName: s.teamB,
    mapPool: MAP_POOL,
    maps: {
      picked: steps.filter((x) => x.actionType === "pick").map((x) => ({ mapName: x.mapName, teamKey: x.teamKey })),
      banned: steps.filter((x) => x.actionType === "ban").map((x) => ({ mapName: x.mapName, teamKey: x.teamKey })),
      decider: steps.find((x) => x.actionType === "decider")?.mapName ?? null,
    },
    sideChoices: [],
    steps,
  };
}

// ── 1. 扫描各 Stage 子文件夹里的 ZIP，读出 demo 元数据 ──
const demos = [];
const scanStages = [...new Set([
  ...(spec.export?.stages ?? []).map((stage) => stage.stage),
  ...(spec.stages ?? []).map((stage) => stageDirName(stage.key)),
])];
for (const stage of scanStages) {
  const dir = join(DEMOS, stage);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".zip")) continue;
    const path = join(dir, f);
    try {
      const m = readMatchJson(path);
      demos.push({ path, file: f, stage,
        mapName: m.mapName,
        a: { name: m.teamA.name, score: m.teamA.score, key: normTeam(m.teamA.name) },
        b: { name: m.teamB.name, score: m.teamB.score, key: normTeam(m.teamB.name) } });
    } catch { console.warn(`! 跳过无法读取的 ZIP：${stage}/${f}`); }
  }
}

// ── 2. 按 stage 分组 series ──
const seriesByStage = new Map();
for (const s of spec.series) {
  const k = s.stage ?? "_unknown";
  if (ONLY_STAGE && k !== ONLY_STAGE) continue;
  if (!seriesByStage.has(k)) seriesByStage.set(k, []);
  seriesByStage.get(k).push(s);
}

// ── 3. 全局队伍表（按全量 series 顺序分配 team-N key，各 package 从全局键-名映射裁剪）───
const allTeamNames = [];
for (const s of spec.series) for (const n of [s.teamA, s.teamB]) if (!allTeamNames.includes(n)) allTeamNames.push(n);
const globalTeamKey = new Map(allTeamNames.map((n, i) => [n, `team-${i + 1}`]));
const specStageDefs = new Map((spec.stages ?? []).map((st) => [st.key, st]));

// ── 4. 每个 stage 独立装配 ──
rmSync(OUT, { recursive: true, force: true });

const summary = [];

for (const [stageKey, stageSeries] of seriesByStage) {
  const stageDir = stageDirName(stageKey);
  const stageSlug = `${spec.event.slug}-${stageKey}`;

  // 该 stage 的队伍（只出现在该 stage series 中的队伍）
  const stageTeamNames = [];
  for (const s of stageSeries) for (const n of [s.teamA, s.teamB]) if (!stageTeamNames.includes(n)) stageTeamNames.push(n);
  const teamKeyByName = new Map(stageTeamNames.map((n) => [n, globalTeamKey.get(n)]));

  // 该 stage 的 spec.stages 条目
  const stageDef = specStageDefs.get(stageKey);
  const pkgStages = stageDef ? [stageDef] : [];

  // matchDemos（闭包复用阶段 demos）
  const matchDemos = (s) => {
    const wantA = normTeam(s.teamA), wantB = normTeam(s.teamB);
    const decider = s.bp?.find((b) => b[1] === "decider");
    const wantMap = decider ? deMap(decider[2]) : null;

    const match = (d) => {
      const pair = (d.a.key === wantA && d.b.key === wantB) || (d.a.key === wantB && d.b.key === wantA);
      if (!pair) return false;
      if (s.format === "bo1" && wantMap) return d.mapName === wantMap;
      return true;
    };

    const sameStage = demos.filter((d) => stageKeyFromDirName(d.stage) === stageKeyFromDirName(stageDir));
    const hits = sameStage.filter(match);
    if (hits.length > 0) return hits;
    return demos.filter(match);
  };

  // 输出子目录
  const pkgOut = join(OUT, stageKey);
  mkdirSync(join(pkgOut, "maps"), { recursive: true });

  const assembled = [];
  const pending = [];
  const builtSeries = [];
  const splitNotes = [];

  for (const s of stageSeries) {
    const matched = matchDemos(s);
    if (matched.length === 0) { pending.push(s); continue; }
    // 按 mapName 分组：同图多段是 GOTV 分段（-pN，各文件本地计分但 roundNumber 全局不重叠），
    // 不同图是 BO3 各张图。一个系列里同一张图不会打两次，故按 mapName 分组安全。
    const byMap = new Map();
    for (const d of matched) {
      if (!byMap.has(d.mapName)) byMap.set(d.mapName, []);
      byMap.get(d.mapName).push(d);
    }
    // 每组：单段图直接用 match.json 终局；分段图按全局回合去重数胜方（防重开重叠）。分析载荷取回合最多的一段。
    const groups = [...byMap.values()].map((segs) => {
      const seriesAKey = normTeam(s.teamA);
      let rep = segs[0], repRounds = -1;
      for (const d of segs) {
        const rounds = (d.a.score ?? 0) + (d.b.score ?? 0);
        if (rounds > repRounds) { repRounds = rounds; rep = d; }
      }
      let scoreA, scoreB;
      if (segs.length === 1) {
        const direct = rep.a.key === seriesAKey;
        scoreA = direct ? rep.a.score : rep.b.score;
        scoreB = direct ? rep.b.score : rep.a.score;
      } else {
        const withRounds = segs.map((d) => ({ d, rounds: readRounds(d.path) }));
        ({ scoreA, scoreB } = scoreFromRoundsUnion(withRounds, seriesAKey));
      }
      return { mapName: segs[0].mapName, scoreA, scoreB, rep, repRounds, parts: segs.length };
    });
    // 多张图按代表段文件名稳定排序（BO3 的 m1/m2/m3）
    groups.sort((x, y) => x.rep.file.localeCompare(y.rep.file));
    const maps = groups.map((g, idx) => {
      const assetName = `${s.key}-m${idx + 1}-${g.mapName}.zip`;
      copyFileSync(g.rep.path, join(pkgOut, "maps", assetName));
      if (g.parts > 1) {
        const missing = (g.scoreA + g.scoreB) - g.repRounds;
        splitNotes.push(`${s.key} ${g.mapName}: ${g.parts} 段合并 → 终局 ${g.scoreA}:${g.scoreB}，分析载荷取最长段（缺 ${missing} 回合）`);
      }
      return {
        order: idx + 1,
        mapName: g.mapName,
        pickedBy: null,
        scoreA: g.scoreA,
        scoreB: g.scoreB,
        demoHint: { fileName: assetName, sha256: sha256(readFileSync(g.rep.path)) },
      };
    });
    const finished = s.status === "finished";
    builtSeries.push({
      key: s.key,
      stage: s.stage ?? null,
      round: s.round ?? null,
      entryRound: s.entryRound ?? null,
      status: s.status,
      format: s.format,
      matchUrl: s.matchUrl ?? null,
      teamAKey: teamKeyByName.get(s.teamA),
      teamBKey: teamKeyByName.get(s.teamB),
      scoreA: finished ? maps.filter((m) => m.scoreA > m.scoreB).length : null,
      scoreB: finished ? maps.filter((m) => m.scoreB > m.scoreA).length : null,
      scheduledAt: s.scheduledAt ?? null,
      completedAt: groups[0] ? (readDate(groups[0].rep.path) || null) : null,
      veto: buildVeto(s),
      maps,
    });
    assembled.push({ s, maps });
  }

  const eventPackage = {
    version: "cs2-demo-analysis-kit/event-package-1.0",
    source: "manual",
    exportedAt: new Date().toISOString(),
    event: {
      slug: stageSlug,
      name: stageDef ? `${spec.event.name} — ${stageDef.name}` : spec.event.name,
      kind: spec.event.kind,
      ...(spec.event.sourceUrl ? { sourceUrl: spec.event.sourceUrl } : {}),
      group: spec.event.slug,
      stages: pkgStages,
    },
    teams: stageTeamNames.map((n) => ({ key: teamKeyByName.get(n), name: n, players: [] })),
    series: builtSeries,
  };
  writeFileSync(join(pkgOut, "event-package.json"), JSON.stringify(eventPackage, null, 2) + "\n");

  // 打成 ${slug}-${stageKey}.zip
  const zipPath = join(OUT, `${stageSlug}.zip`);
  execFileSync("zip", ["-rq", zipPath, "event-package.json", "maps"], { cwd: pkgOut });

  summary.push({ stageKey, stageSlug, zipPath, assembled: assembled.length, pending: pending.length, splitNotes });
  console.log(`\n═══ ${stageDef?.name ?? stageKey} ═══`);
  console.log(`  包：${zipPath}`);
  console.log(`  系列赛：${assembled.length} 已装配 / ${pending.length} 待 demo`);
  for (const { s, maps } of assembled) {
    const sc = maps.map((m) => `${m.mapName} ${m.scoreA}:${m.scoreB}`).join(", ");
    console.log(`    ✓ ${s.key} ${s.teamA} vs ${s.teamB} — ${sc}`);
  }
  for (const s of pending) console.log(`    · ${s.key} ${s.teamA} vs ${s.teamB} — 缺 demo`);
  if (splitNotes.length) {
    console.log(`  分段合并（GOTV 中断，比分已跨段相加）：`);
    for (const n of splitNotes) console.log(`    ⚠ ${n}`);
  }
}

// ── 5. 总摘要 ──
const totalAssembled = summary.reduce((a, x) => a + x.assembled, 0);
const totalPending = summary.reduce((a, x) => a + x.pending, 0);
console.log(`\n🎉 全部阶段装配完成（${summary.length} 包）`);
console.log(`系列赛：${totalAssembled} 已装配 / ${totalPending} 待 demo`);
