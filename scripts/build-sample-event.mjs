#!/usr/bin/env node
// 组装内置「示例职业局」赛事包：把 _sample-reexport/ 下 7 个 3.1.0 重导 v3 ZIP + 内嵌 BP
// 拼成单个 event-package（含两场不同赛事的决赛），输出 fixtures/input/sample-pro-finals-2026.zip。
// 这是内置示例的唯一 BP 来源（取代旧 builtin-events.ts 里按队名匹配回填的 vetoPresets）。
//
//   node scripts/build-sample-event.mjs
//
// 校验：构建后用 @cs2dak/contract eventPackageSchema 解一遍（见末尾），不过再跑 dak-studio 导入冒烟。
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const REPO = resolve(fileURLToPath(import.meta.url), "../..");
const SRC = join(REPO, "fixtures/demos/pro/_sample-reexport");
const OUT = join(REPO, "fixtures/input/sample-pro-finals-2026.zip");

// BP 步骤（HLTV 真实 veto）。teamA/teamB 对应下方 series 的 teamAKey/teamBKey。
const KRAKOW_STEPS = [
  { stepOrder: 1, actionType: "ban", teamKey: "teamA", mapName: "de_dust2", side: null },
  { stepOrder: 2, actionType: "ban", teamKey: "teamB", mapName: "de_ancient", side: null },
  { stepOrder: 3, actionType: "pick", teamKey: "teamA", mapName: "de_mirage", side: "t" },
  { stepOrder: 4, actionType: "pick", teamKey: "teamB", mapName: "de_inferno", side: "t" },
  { stepOrder: 5, actionType: "pick", teamKey: "teamA", mapName: "de_nuke", side: "t" },
  { stepOrder: 6, actionType: "pick", teamKey: "teamB", mapName: "de_overpass", side: "t" },
  { stepOrder: 7, actionType: "decider", teamKey: null, mapName: "de_anubis", side: null },
];
const ASTANA_STEPS = [
  { stepOrder: 1, actionType: "ban", teamKey: "teamB", mapName: "de_inferno", side: null },
  { stepOrder: 2, actionType: "ban", teamKey: "teamA", mapName: "de_overpass", side: null },
  { stepOrder: 3, actionType: "pick", teamKey: "teamB", mapName: "de_dust2", side: "t" },
  { stepOrder: 4, actionType: "pick", teamKey: "teamA", mapName: "de_mirage", side: "t" },
  { stepOrder: 5, actionType: "pick", teamKey: "teamB", mapName: "de_ancient", side: "t" },
  { stepOrder: 6, actionType: "pick", teamKey: "teamA", mapName: "de_nuke", side: "t" },
  { stepOrder: 7, actionType: "decider", teamKey: null, mapName: "de_anubis", side: null },
];

// steps → 派生 maps/sideChoices（与 series.ts deriveVetoSummary 同口径）。
function deriveSummary(steps) {
  return {
    maps: {
      picked: steps.filter((s) => s.actionType === "pick").map((s) => ({ mapName: s.mapName, teamKey: s.teamKey })),
      banned: steps.filter((s) => s.actionType === "ban").map((s) => ({ mapName: s.mapName, teamKey: s.teamKey })),
      decider: steps.find((s) => s.actionType === "decider")?.mapName ?? null,
    },
    sideChoices: steps.filter((s) => s.side != null).map((s) => ({ mapName: s.mapName, teamKey: s.teamKey, side: s.side })),
  };
}
function veto(steps, pool) {
  return { version: "cs2-demo-analysis-kit/series-veto-0.1", seriesId: "", format: "bo5", teamAName: "", teamBName: "", mapPool: pool, ...deriveSummary(steps), steps };
}

// 实际打进包的图（已重导的）。demoHint.fileName = maps/ 内层 zip 名（导入时按文件名优先匹配，
// 兜底按队伍+地图）。scoreA/scoreB 以该 series 的 teamA/teamB 朝向记。
const KRAKOW_MAPS = [
  { order: 1, mapName: "de_mirage", file: "furia-vs-vitality-m1-mirage.zip", pickedBy: "teamA", scoreA: 13, scoreB: 11 },
  { order: 2, mapName: "de_inferno", file: "furia-vs-vitality-m2-inferno.zip", pickedBy: "teamB", scoreA: 8, scoreB: 13 },
  { order: 3, mapName: "de_nuke", file: "furia-vs-vitality-m3-nuke.zip", pickedBy: "teamA", scoreA: 2, scoreB: 13 },
  { order: 4, mapName: "de_overpass", file: "furia-vs-vitality-m4-overpass.zip", pickedBy: "teamB", scoreA: 10, scoreB: 13 },
];
const ASTANA_MAPS = [
  { order: 1, mapName: "de_dust2", file: "spirit-vs-falcons-m1-dust2.zip", pickedBy: "teamB", scoreA: 12, scoreB: 16 },
  { order: 2, mapName: "de_mirage", file: "spirit-vs-falcons-m2-mirage.zip", pickedBy: "teamA", scoreA: 7, scoreB: 13 },
  { order: 3, mapName: "de_ancient", file: "spirit-vs-falcons-m3-ancient.zip", pickedBy: "teamB", scoreA: 10, scoreB: 13 },
];
const toEventMaps = (maps) => maps.map((m) => ({ order: m.order, mapName: m.mapName, pickedBy: m.pickedBy, scoreA: m.scoreA, scoreB: m.scoreB, demoHint: { fileName: m.file } }));

const pkg = {
  version: "cs2-demo-analysis-kit/event-package-1.0",
  source: "manual",
  exportedAt: new Date().toISOString(),
  event: {
    slug: "pro-samples-2026",
    name: "示例职业局",
    kind: "showcase",
    stages: [
      { key: "krakow", name: "IEM Kraków 2026 决赛", type: "single_elim", teamCount: 2, advanceCount: 0, matchFormat: "bo5" },
      { key: "astana", name: "PGL Astana 2026 决赛", type: "single_elim", teamCount: 2, advanceCount: 0, matchFormat: "bo5" },
    ],
  },
  teams: [
    { key: "furia", name: "FURIA", players: [] },
    { key: "vitality", name: "Team Vitality", players: [] },
    { key: "falcons", name: "Team Falcons", players: [] },
    { key: "spirit", name: "Team Spirit", players: [] },
  ],
  series: [
    {
      key: "krakow-final", stage: "krakow", status: "finished", format: "bo5",
      teamAKey: "furia", teamBKey: "vitality", scoreA: 1, scoreB: 3,
      completedAt: "2026-02-09T20:00:00Z", veto: veto(KRAKOW_STEPS, ["de_dust2", "de_ancient", "de_mirage", "de_inferno", "de_nuke", "de_overpass", "de_anubis"]),
      maps: toEventMaps(KRAKOW_MAPS),
    },
    {
      key: "astana-final", stage: "astana", status: "finished", format: "bo5",
      teamAKey: "falcons", teamBKey: "spirit", scoreA: 0, scoreB: 3,
      completedAt: "2026-05-17T20:00:00Z", veto: veto(ASTANA_STEPS, ["de_inferno", "de_overpass", "de_dust2", "de_mirage", "de_ancient", "de_nuke", "de_anubis"]),
      maps: toEventMaps(ASTANA_MAPS),
    },
  ],
};

const zip = new JSZip();
zip.file("event-package.json", JSON.stringify(pkg, null, 2));
for (const m of [...KRAKOW_MAPS, ...ASTANA_MAPS]) {
  zip.file(`maps/${m.file}`, readFileSync(join(SRC, m.file)));
}
const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
writeFileSync(OUT, bytes);
console.log(`wrote ${OUT} (${(bytes.length / 1024 / 1024).toFixed(2)} MB, ${KRAKOW_MAPS.length + ASTANA_MAPS.length} maps)`);
