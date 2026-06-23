#!/usr/bin/env node
// BP 文本 → spec.series 片段转换器。
//
// 把 extract-bp.ts 爬下来的 veto 文本（bp-output.txt / stage3-bp-complete.txt）解析成
// cologne-major-2026.spec.json 的 series 形状：teamA/teamB + bp[[teamKey, action, 地图显示名]]。
// 这是「文本 → spec 手抄」断裂的那一环；爬取本身没问题，问题在转换。
//
// 用法：
//   node scripts/hltv/bp-to-spec.mjs scripts/hltv/bp-output.txt scripts/hltv/stage3-bp-complete.txt
//     → 打印 series 片段 JSON 到 stdout（人工核对后粘进 spec.series 覆盖预测对阵/BP）
//   node scripts/hltv/bp-to-spec.mjs <文件...> --merge scripts/cologne/cologne-major-2026.spec.json
//     → 按归一化对阵就地覆盖 spec.series[].bp（写回原文件），未匹配的片段告警列出
//   附 --matches scripts/hltv/matches.txt 时尽量回填 series.matchUrl
//
// 注意：本脚本只补 bp + 真实对阵 + entryRound + matchUrl；round/format/status 仍由人工
// 在 spec 里维护（format 决定 BO 张数，文本里没有这信息）。
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const mergeIdx = args.indexOf("--merge");
const specPath = mergeIdx >= 0 ? args[mergeIdx + 1] : null;
const matchesIdx = args.indexOf("--matches");
const matchesPath = matchesIdx >= 0 ? args[matchesIdx + 1] : null;
const valueIdx = new Set([mergeIdx >= 0 ? mergeIdx + 1 : -1, matchesIdx >= 0 ? matchesIdx + 1 : -1]);
const files = args.filter((a, i) => !a.startsWith("--") && !valueIdx.has(i));
if (files.length === 0) {
  console.error("用法：node scripts/hltv/bp-to-spec.mjs <bp.txt...> [--merge spec.json] [--matches matches.txt]");
  process.exit(2);
}

// 与 cologne-build.mjs 同口径，确保对阵能对齐。
const normTeam = (s) => String(s).toLowerCase().replace(/\b(gaming|esports|team)\b/g, "").replace(/[^a-z0-9]/g, "");
const pairKey = (a, b) => [normTeam(a), normTeam(b)].sort().join("|");
// 地图显示名规范化（首字母大写，Dust2 特例），与 spec 的显示名口径一致。
const MAP_DISPLAY = { ancient: "Ancient", anubis: "Anubis", dust2: "Dust2", inferno: "Inferno", mirage: "Mirage", nuke: "Nuke", overpass: "Overpass" };
const mapDisplay = (s) => MAP_DISPLAY[String(s).toLowerCase().replace(/[^a-z0-9]/g, "")] ?? s;

// matchUrl 回填：matches.txt 的 /matches/{id}/{teamA-vs-teamB-event} → slug 尾段 → url
const slugToUrl = new Map();
if (matchesPath) {
  for (const line of readFileSync(matchesPath, "utf8").split(/\r?\n/)) {
    const m = line.trim().match(/\/matches\/\d+\/([^/?#]+)/);
    if (m) slugToUrl.set(m[1], line.trim());
  }
}

// 从 block 头解析两队显示名。支持 "# 9z vs PARIVISION" 与 "# the-mongolz-vs-b8-iem-cologne-major-2026"。
function parseHeader(header) {
  const raw = header.replace(/^#\s*/, "").trim();
  if (/ vs /i.test(raw)) {
    const [a, b] = raw.split(/ vs /i);
    return { teamA: a.trim(), teamB: b.trim(), slug: null };
  }
  // slug 形态：去掉末尾的 -iem-cologne-major-2026，再按 -vs- 切
  const slug = raw;
  const core = raw.replace(/-iem-cologne-major-2026.*$/i, "");
  const parts = core.split("-vs-");
  if (parts.length === 2) return { teamA: parts[0], teamB: parts[1], slug };
  return null;
}

// 把 veto 行解析成 bp 步骤。teamKey 用 teamA/teamB 的归一化名匹配行内队名。
function parseVeto(lines, teamA, teamB) {
  const keyA = normTeam(teamA), keyB = normTeam(teamB);
  const bp = [];
  for (const line of lines) {
    const left = line.match(/^[1-7]\.\s+(.+?)\s+(removed|picked)\s+(\w+)/i);
    if (left) {
      const who = normTeam(left[1]);
      const teamKey = who === keyA ? "teamA" : who === keyB ? "teamB" : null;
      bp.push([teamKey, left[2].toLowerCase() === "removed" ? "ban" : "pick", mapDisplay(left[3])]);
      continue;
    }
    const dec = line.match(/^[1-7]\.\s+(\w+)\s+was left over/i);
    if (dec) bp.push([null, "decider", mapDisplay(dec[1])]);
  }
  return bp;
}

// 解析一个文件：按 "阶段：X" 头维护 entryRound，按 "# 队 vs 队" 切 block。
function parseFile(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const out = [];
  let entryRound = null;
  let cur = null;
  const flush = () => { if (cur && cur.veto.length) out.push(cur); cur = null; };
  for (const line of lines) {
    const stage = line.match(/^阶段：\s*(.+?)\s*（/);
    if (stage) { flush(); entryRound = stage[1].trim(); continue; }
    if (line.startsWith("#")) {
      flush();
      const h = parseHeader(line);
      if (!h) continue;
      cur = { ...h, entryRound, veto: [] };
      continue;
    }
    if (cur && /^[1-7]\.\s/.test(line.trim())) cur.veto.push(line.trim());
  }
  flush();
  return out;
}

const blocks = files.flatMap(parseFile);
const fragments = blocks.map((b) => {
  const frag = {
    entryRound: /^[0-2]-[0-2]$/.test(b.entryRound ?? "") ? b.entryRound : null,
    teamA: b.teamA,
    teamB: b.teamB,
    bp: parseVeto(b.veto, b.teamA, b.teamB),
  };
  const url = b.slug ? slugToUrl.get(b.slug) : null;
  if (url) frag.matchUrl = url;
  return frag;
});

// teamKey 没对上的行（行内队名既非 teamA 也非 teamB）—— 提醒人工查
const bad = fragments.filter((f) => f.bp.some((s) => s[1] !== "decider" && s[0] === null));
if (bad.length) {
  console.error(`⚠ ${bad.length} 个系列有 veto 行未能归属到 teamA/teamB（队名拼写差异？）：`);
  for (const f of bad) console.error(`  - ${f.teamA} vs ${f.teamB}`);
}

if (!specPath) {
  process.stdout.write(JSON.stringify(fragments, null, 2) + "\n");
  console.error(`\n共 ${fragments.length} 个系列片段。核对后覆盖 spec.series 的对应对阵。`);
} else {
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const byPair = new Map(fragments.map((f) => [pairKey(f.teamA, f.teamB), f]));
  let merged = 0;
  const usedPairs = new Set();
  for (const s of spec.series) {
    const f = byPair.get(pairKey(s.teamA, s.teamB));
    if (!f) continue;
    s.bp = f.bp;
    if (f.entryRound) s.entryRound = f.entryRound;
    if (f.matchUrl) s.matchUrl = f.matchUrl;
    usedPairs.add(pairKey(s.teamA, s.teamB));
    merged += 1;
  }
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n");
  const unmatched = fragments.filter((f) => !usedPairs.has(pairKey(f.teamA, f.teamB)));
  console.error(`✓ 覆盖 ${merged} 个 series 的 bp（写回 ${specPath}）`);
  if (unmatched.length) {
    console.error(`⚠ ${unmatched.length} 个 BP 片段在 spec 里找不到对应对阵（spec 预测有误或缺 series）：`);
    for (const f of unmatched) console.error(`  - ${f.teamA} vs ${f.teamB}（${f.entryRound ?? "?"}）`);
  }
}
