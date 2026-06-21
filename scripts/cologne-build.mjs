#!/usr/bin/env node
// 科隆 Major 赛事包增量装配器。
//
//   node scripts/cologne-build.mjs
//
// 读取 scripts/cologne/cologne-major-2026.spec.json + fixtures/demos/pro/IEM-Cologne-Major-2026/<Stage>/*.zip，
// 按队伍名归一化匹配每个系列赛的 demo，生成符合 event-package-1.0 合同的赛事包：
//   fixtures/demos/pro/IEM-Cologne-Major-2026/_build/{event-package.json, maps/*.zip} 并打成 <slug>.zip。
// 没有对应 demo 的系列自动跳过（增量）——下完一场重跑一次即可。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = join(ROOT, "scripts/cologne/cologne-major-2026.spec.json");
const DEMOS = join(ROOT, "fixtures/demos/pro/IEM-Cologne-Major-2026");
const OUT = join(DEMOS, "_build");
const STAGES = ["Stage1", "Stage2", "Stage3", "Playoff"];
const MAP_POOL = ["de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_overpass"];

// 队名归一化：小写 + 去非字母数字 + 去常见后缀，吸收 HLTV/demo 命名差异
// （"Lynn Vision Gaming" ↔ "Lynn Vision"、"B8 Esports" ↔ "B8"、"THUNDER dOWNUNDER" ↔ "THUNDERdOWNUNDER"）。
const normTeam = (s) => String(s).toLowerCase().replace(/\b(gaming|esports|team)\b/g, "").replace(/[^a-z0-9]/g, "");
// 地图显示名 → de_ 内部名（veto 用，需与 demo 的 mapName 同口径以便匹配 pickedBy）。
const deMap = (s) => (String(s).startsWith("de_") ? String(s) : "de_" + String(s).toLowerCase().replace(/[^a-z0-9]/g, ""));

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

// 1. 扫描各 Stage 子文件夹里的 ZIP，读出 demo 元数据
const demos = [];
for (const stage of STAGES) {
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

const spec = JSON.parse(readFileSync(SPEC, "utf8"));

// 2. 队伍表（按 series 出现顺序分配 team-N key）
const teamNames = [];
for (const s of spec.series) for (const n of [s.teamA, s.teamB]) if (!teamNames.includes(n)) teamNames.push(n);
const teamKeyByName = new Map(teamNames.map((n, i) => [n, `team-${i + 1}`]));
const normToKey = new Map(teamNames.map((n) => [normTeam(n), teamKeyByName.get(n)]));

// 3. 为某系列找到匹配的 demo（队伍对一致 + 若 bp 有 decider 则地图也要一致；BO3 取多张）
function matchDemos(s) {
  const wantA = normTeam(s.teamA), wantB = normTeam(s.teamB);
  const decider = s.bp?.find((b) => b[1] === "decider");
  const wantMap = decider ? deMap(decider[2]) : null;
  return demos.filter((d) => {
    const pair = (d.a.key === wantA && d.b.key === wantB) || (d.a.key === wantB && d.b.key === wantA);
    if (!pair) return false;
    if (s.format === "bo1" && wantMap) return d.mapName === wantMap;
    return true;
  });
}

// 4. 由 bp 构建 veto
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

// 5. 准备输出目录
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "maps"), { recursive: true });

const assembled = [];
const pending = [];
const builtSeries = [];
const splitNotes = [];

for (const s of spec.series) {
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
    copyFileSync(g.rep.path, join(OUT, "maps", assetName));
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
  event: { slug: spec.event.slug, name: spec.event.name, kind: spec.event.kind, stages: spec.stages },
  teams: teamNames.map((n) => ({ key: teamKeyByName.get(n), name: n, players: [] })),
  series: builtSeries,
};
writeFileSync(join(OUT, "event-package.json"), JSON.stringify(eventPackage, null, 2) + "\n");

// 6. 打成 <slug>.zip（event-package.json + maps/）
const zipPath = join(OUT, `${spec.event.slug}.zip`);
execFileSync("zip", ["-rq", zipPath, "event-package.json", "maps"], { cwd: OUT });

// 7. 摘要
console.log(`\n装配完成 → ${zipPath}`);
console.log(`系列赛：${assembled.length} 已装配 / ${pending.length} 待 demo`);
for (const { s, maps } of assembled) {
  const sc = maps.map((m) => `${m.mapName} ${m.scoreA}:${m.scoreB}`).join(", ");
  console.log(`  ✓ ${s.key} ${s.teamA} vs ${s.teamB} — ${sc}`);
}
for (const s of pending) console.log(`  · ${s.key} ${s.teamA} vs ${s.teamB} — 缺 demo`);
if (splitNotes.length) {
  console.log(`\n分段合并（GOTV 中断，比分已跨段相加）：`);
  for (const n of splitNotes) console.log(`  ⚠ ${n}`);
}
