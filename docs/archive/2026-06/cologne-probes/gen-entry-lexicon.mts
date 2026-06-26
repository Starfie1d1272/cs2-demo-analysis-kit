/**
 * 一次性生成进点路线词典骨架 packages/maps/src/site-entry-lexicon.ts。
 * 扫真实 ZIP，按 (map, site) 枚举 chokeId 组合（≥3 次），每条留空 cn 待手填，
 * 行尾注释给出频次与构成口子的中文名提示。
 *
 *   pnpm exec tsx scripts/cologne/gen-entry-lexicon.mts
 */
import { readFileSync, writeFileSync, globSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDemoPackageFromZip, extractTacticalRoundFacts, type TacticalRoundFact } from "../../packages/core/src/index.ts";
import { loadCalloutGrid } from "../../packages/maps/src/callout-grid-node.ts";
import { SITE_ENTRY_SEMANTICS } from "../../packages/maps/src/site-entry-chokes.ts";
import { calloutCn } from "../../packages/maps/src/callout-names.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "packages/maps/src/site-entry-lexicon.ts");
const GLOBS = [
  "fixtures/demos/pro/IEM-Cologne-Major-2026/_build/maps/*.zip",
  "fixtures/output/pro/*.zip",
  "fixtures/output/nju-rivals-2026/**/*.zip",
];
const THRESHOLD = 3; // 出现 ≥3 次的组合才进词典骨架

const gridCache = new Map<string, ReturnType<typeof loadCalloutGrid>>();
const gridFor = (m: string) => (gridCache.has(m) ? gridCache.get(m)! : (gridCache.set(m, loadCalloutGrid(m)), gridCache.get(m)!));

// chokeId → 构成 callout 的中文名提示，如 a_main → "A厅"
function chokeHint(mapName: string, chokeId: string): string {
  const def = SITE_ENTRY_SEMANTICS[mapName]?.entries.find((e) => e.id === chokeId);
  if (!def) return chokeId;
  const names = def.entryCallouts.map((c) => calloutCn(mapName, c)).filter(Boolean);
  return names.length ? names.join("/") : chokeId;
}
function comboHint(mapName: string, combo: string): string {
  return combo.split("+").map((id) => chokeHint(mapName, id)).join(" + ");
}

const files: string[] = [];
for (const g of GLOBS) for (const p of globSync(g, { cwd: ROOT })) files.push(resolve(ROOT, p));

const facts: TacticalRoundFact[] = [];
for (const path of files) {
  try {
    const pkg = await loadDemoPackageFromZip(readFileSync(path));
    facts.push(...extractTacticalRoundFacts(pkg, { matchId: basename(path, ".zip"), calloutGrid: gridFor(pkg.match.mapName) }));
  } catch { /* 跳过坏 ZIP */ }
}

// (map → site → combo → count)
const tree = new Map<string, Map<"a" | "b", Map<string, number>>>();
for (const f of facts) {
  if (f.side !== "t" || !f.targetSite) continue;
  const entry = f.siteEntries[f.targetSite];
  if (entry.entrants <= 0) continue;
  const ids = entry.distinctEntryChokeIds ?? [];
  if (ids.length === 0) continue;
  const combo = [...ids].sort().join("+");
  if (!tree.has(f.mapName)) tree.set(f.mapName, new Map());
  const sites = tree.get(f.mapName)!;
  if (!sites.has(f.targetSite)) sites.set(f.targetSite, new Map());
  const combos = sites.get(f.targetSite)!;
  combos.set(combo, (combos.get(combo) ?? 0) + 1);
}

const HEADER = `// 进点路线「地道叫法」词典（手填真相源）。
//
// 定位：把 (地图, 包点, 进点 chokeId 组合) 映射到队内/解说常用的中文战术叫法，
//       供 presentation 命名层消费。combo 的 chokeId 取自 site-entry-chokes.ts 的 entry id，
//       字母序、以 + 连接（与 SiteEntryFact.distinctEntryChokeIds 排序一致）。
// 来源：158 场真实 demo（科隆 Major Stage1 + pro + NJU）统计出的反复出现组合（≥${THRESHOLD} 次）。
// 填法：只填每条的 cn（地道叫法，如「走A大」「甜甜圈夹A」「交道打一波」），格式无需改动。
//       cn 留空的组合，命名层自动回退结构名（主口 + 口数），不会显示空白。

export interface EntryRouteName {
  /** 进点 chokeId 组合（字母序 + 连接）。 */
  combo: string;
  /** 地道叫法，留空待填。 */
  cn: string;
}

/** 取某组合的地道叫法；未收录或未填返回空串（由命名层兜底）。 */
export function entryRouteCn(mapName: string, site: "a" | "b", combo: string): string {
  return SITE_ENTRY_LEXICON[mapName]?.[site]?.find((row) => row.combo === combo)?.cn ?? "";
}

`;

const maps = [...tree.keys()].sort();
let body = "export const SITE_ENTRY_LEXICON: Record<string, Partial<Record<\"a\" | \"b\", EntryRouteName[]>>> = {\n";
for (const map of maps) {
  body += `  ${map}: {\n`;
  for (const site of ["a", "b"] as const) {
    const combos = tree.get(map)!.get(site);
    if (!combos) continue;
    const rows = [...combos.entries()].filter(([, n]) => n >= THRESHOLD).sort((a, b) => b[1] - a[1]);
    if (rows.length === 0) continue;
    body += `    ${site}: [\n`;
    for (const [combo, n] of rows) {
      const pad = combo.length;
      body += `      { combo: ${JSON.stringify(combo)}, cn: "" },${" ".repeat(Math.max(1, 38 - pad))}// ${String(n).padStart(3)}次 · ${comboHint(map, combo)}\n`;
    }
    body += `    ],\n`;
  }
  body += `  },\n`;
}
body += "};\n";

writeFileSync(OUT, HEADER + body);
const totalRows = maps.reduce((a, m) => a + [...tree.get(m)!.values()].reduce((b, c) => b + [...c.values()].filter((n) => n >= THRESHOLD).length, 0), 0);
console.log(`已生成 ${OUT}`);
console.log(`地图 ${maps.length} 个，待填组合 ${totalRows} 条（阈值 ≥${THRESHOLD} 次）`);
