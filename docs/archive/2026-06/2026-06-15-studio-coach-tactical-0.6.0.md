# DAK Studio 教练页战术聚类 0.6.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Studio 教练页从"freezeEnd+15s place 计数 + 道具进 key"的脆弱开局聚类，升级成"阵营专属默认位 + 双层 basis + 倒计时节奏桶"的战术聚类，并打通"筛选→聚相似回合→看共同点→存备战回合"的完整闭环。

**Architecture:** 位置语义从人工标注的 route(有序动线)+zone(多边形) 转为 demo 自带 callout 的"默认位 anchor 归并"——anchor 集合人工定种子、callout→anchor 归属由 T/CT opening 占有频率数据驱动生成并人工抽查、固化成 maps 包的运行时常量。聚类基于双层站位(`defaults`/`advanced`)+进点节奏桶，道具移出 key 改关联统计。纯逻辑集中到 `apps/dak-studio/src/lib/tactics.ts` 做 TDD，UI 复用 TrailsView 的 radar 渲染器。

**Tech Stack:** TypeScript（pnpm workspace）、vitest（node 环境，`*.test.ts` 同目录）、React（CoachView/TrailsView）、`@cs2dak/maps`（callout-names/calibration/worldToRadar）、`@cs2dak/contract`（`EconomyType`/`Side`/`DemoPackage`）、Studio RecordStore（IndexedDB / pywebview 双后端）。

---

## File Structure

**新建**
- `packages/maps/src/default-positions.ts` — 阵营专属默认位常量 `DEFAULT_POSITIONS` + 查询 `roleOf`/`anchorOf`（运行时，零计算）。
- `packages/maps/src/default-positions.test.ts` — 结构完整性 + 查询测试。
- `packages/maps/scripts/derive-default-positions.ts` — 从 demo 提 T/CT opening 占有频率，输出 `default-positions.ts` 草案（构建期工具，不进运行时）。
- `apps/dak-studio/src/lib/tactics.ts` — 纯逻辑：时间切片站位、双层 basis、进点节奏桶、聚类 key、判断层 v0（疑似 fake / 自动命名）。
- `apps/dak-studio/src/lib/tactics.test.ts` — 上述纯函数 TDD。
- `apps/dak-studio/src/lib/playlist.ts` — 备战清单（Round Playlist）持久化 + Markdown 导出。
- `apps/dak-studio/src/lib/playlist.test.ts`
- `apps/dak-studio/src/components/RadarTrails.tsx` — 从 TrailsView 抽出的共享 radar 叠加渲染器。
- `apps/dak-studio/src/views/coach/PatternExplorer.tsx` — 打法模式三栏（列表/雷达叠加/数据摘要+证据回合）。
- `apps/dak-studio/src/views/coach/MapPoolTable.tsx` — 地图池比较表。

**修改**
- `apps/dak-studio/src/lib/facts.ts` — `OpeningPatternFact`→`TacticalRoundFact`；`extractOpeningPatternFacts`→`extractTacticalRoundFacts`（285-312）；store namespace（501/562-563）；`getOpeningPatterns`→`getTacticalRounds`（634-635, 182）；删 `buildOpeningPatternClustersFromFacts`（794-819，迁到 tactics.ts）。
- `apps/dak-studio/src/views/CoachView.tsx` — patterns tab 接 `PatternExplorer`；anti tab 接 `MapPoolTable`；新增/合并 playlist 入口。
- `apps/dak-studio/src/views/TrailsView.tsx` — `TrailStage` 抽到 `RadarTrails.tsx` 后改为消费它。
- `apps/dak-studio/src/lib/series.ts` — 加 playlist record 类型与读写（159-205 区段同款 store 模式）。
- `packages/maps/src/index.ts` — 导出 default-positions。
- `packages/maps/src/routes.ts` / `route-assets.ts` / `map-routes/*.json` — 加归档标记（见 Phase 0）。

**归档（不删，spatial shadow 仍 import）**
- `packages/maps/map-routes/*.json` 移到 `packages/maps/map-routes/_archived/` 并在 `routes.ts` 顶注明已归档；`route-assets.ts` 的 import 路径同步。

---

## Phase 2 — TacticalRoundFact 提取（facts.ts）

替换 `OpeningPatternFact`。新 fact 携带：多时间切片双层站位、双点投入、进点 anchor/节奏、首杀、经济、下包。

### Task 2.1: 定义 TacticalRoundFact 类型 + 时间常量

**Files:**
- Modify: `apps/dak-studio/src/lib/facts.ts:125-133`（替换 `OpeningPatternFact`）

- [ ] **Step 1: 替换类型定义**

```ts
// facts.ts — 替换 OpeningPatternFact
import type { EconomyType } from "@cs2dak/contract";

/** 回合剩余秒（1:55=115 起倒计时）下的一次站位切片。 */
export interface TacticalSnapshot {
  remainSec: number;                    // 该切片回合剩余秒（取整）
  defaults: Record<string, number>;     // anchorId → 该 side 存活人数
  advanced: Record<string, number>;     // advanced callout → 人数（深层图权，不回算 defaults）
}

export interface SiteInvestment {
  entryCount: number;        // 进入该包点 zone 的人数
  grenadeCount: number;      // 该回合朝该 site 投出的道具数
  deepestAnchor: string | null; // 最深推进 anchor（该 side）
  planted: boolean;
}

export type ExecuteBucket = "rush" | "fast" | "mid" | "late";

export interface TacticalRoundFact extends MatchFactBase {
  side: Side;
  teamKey: "teamA" | "teamB";
  economy: EconomyType;
  won: boolean;
  roundNumber: number;
  snapshots: TacticalSnapshot[];           // T: 剩 1:40/1:25；CT: 剩 1:35/1:00/0:30
  targetSite: "a" | "b" | null;            // 下包点；无则进点最深 site；都无为 null
  siteInvestment: { a: SiteInvestment; b: SiteInvestment };
  entryAnchors: string[];                   // 进点阶段推进到包点区的 anchor 集合
  executeRemainSec: number | null;          // 第二人进 targetSite 时回合剩余秒
  executeBucket: ExecuteBucket | null;
  firstKillForTeam: boolean | null;
  grenadeIds: string[];                     // 关联 lineup 用，不进聚类 key
}
```

- [ ] **Step 2: 改 `MatchFacts.openingPatterns` 字段名 + store namespace**

```ts
// facts.ts — MatchFacts 接口（148 行附近）
tacticalRounds: TacticalRoundFact[];   // 原 openingPatterns
// FactsStore 接口（182 行附近）
getTacticalRounds(scope?: FactsScope): Promise<TacticalRoundFact[]>;
```

- [ ] **Step 3: Run typecheck（预期多处红，下一 task 补齐）**

Run: `pnpm typecheck`
Expected: FAIL（提取/store/CoachView 待改）——预期，作为 2.2/2.3 的 checklist。

- [ ] **Step 4: 暂不 commit（与 2.2 合并提交，保持可编译）**

### Task 2.2: 实现 extractTacticalRoundFacts（TDD via fixture）

**Files:**
- Modify: `apps/dak-studio/src/lib/facts.ts:285-312`（替换 `extractOpeningPatternFacts`）
- Test: `apps/dak-studio/src/lib/facts.test.ts`

- [ ] **Step 1: Write the failing test（用主 fixture de_ancient）**

```ts
// facts.test.ts 追加
import { extractMatchFacts } from "./facts.js";
import { loadFixturePackage } from "./test-helpers.js"; // 若已有 fixture 加载 helper；否则复用现有测试里的加载方式

it("提取 TacticalRoundFact：每回合每存活 side 一行，字段完整", async () => {
  const pkg = await loadFixturePackage("cs2dak-sanitized-de_ancient.zip");
  const facts = extractMatchFacts(pkg, { matchId: "m1" });
  expect(facts.tacticalRounds.length).toBeGreaterThan(0);
  const f = facts.tacticalRounds[0];
  expect(f.snapshots.length).toBeGreaterThanOrEqual(2);
  expect(["a", "b", null]).toContain(f.targetSite);
  expect(f.siteInvestment.a.entryCount).toBeGreaterThanOrEqual(0);
  expect(typeof f.won).toBe("boolean");
  // 下包回合必有 targetSite 与节奏桶
  const planted = facts.tacticalRounds.find((r) => r.targetSite !== null);
  if (planted) {
    expect(planted.executeBucket).not.toBeNull();
    expect(["rush", "fast", "mid", "late"]).toContain(planted.executeBucket!);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/dak-studio/src/lib/facts.test.ts`
Expected: FAIL — `extractTacticalRoundFacts` 未实现。

- [ ] **Step 3: 实现提取（替换 285-312）**

实现要点（用 `replayLabelsAt` 已有的逐帧 place 采样 + `roleOf`/`anchorOf` 归并）：

```ts
// facts.ts
import { roleOf, anchorOf, getMapRoutes } from "@cs2dak/maps"; // getMapRoutes 不再用，移除
import { roleOf as _roleOf } from "@cs2dak/maps"; // 实际只 import roleOf

const ROUND_SECONDS = 115; // 1:55

function remainSecAt(tick: number, freezeEndTick: number, tickrate: number): number {
  return Math.max(0, Math.round(ROUND_SECONDS - (tick - freezeEndTick) / tickrate));
}

function bucketOf(remainSec: number | null): ExecuteBucket | null {
  if (remainSec == null) return null;
  if (remainSec > 95) return "rush";   // 剩 >1:35
  if (remainSec > 70) return "fast";   // 1:35–1:10
  if (remainSec > 40) return "mid";    // 1:10–0:40
  return "late";                       // <0:40
}

function snapshotAt(pkg: DemoPackage, roundNumber: number, side: Side, tick: number): TacticalSnapshot {
  const remainSec = remainSecAt(tick, freezeEndOf(pkg, roundNumber), pkg.match.tickrate || 64);
  const defaults: Record<string, number> = {};
  const advanced: Record<string, number> = {};
  for (const callout of aliveCalloutsAt(pkg, roundNumber, side, tick)) {
    const role = roleOf(pkg.match.mapName, side, callout);
    if (role.kind === "default") defaults[role.anchorId] = (defaults[role.anchorId] ?? 0) + 1;
    else if (role.kind === "advanced") advanced[callout] = (advanced[callout] ?? 0) + 1;
  }
  return { remainSec, defaults, advanced };
}

function extractTacticalRoundFacts(pkg: DemoPackage, matchId: string): TacticalRoundFact[] {
  const tickrate = pkg.match.tickrate || 64;
  const out: TacticalRoundFact[] = [];
  for (const round of pkg.rounds) {
    const fe = round.freezeEndTick;
    const tSlices = [fe + 15 * tickrate, fe + 30 * tickrate];           // T: 剩 1:40 / 1:25
    const ctSlices = [fe + 20 * tickrate, fe + 55 * tickrate, fe + 85 * tickrate]; // CT: 剩 1:35/1:00/0:30
    for (const side of ["t", "ct"] as const) {
      const slices = side === "t" ? tSlices : ctSlices;
      const snapshots = slices.map((tk) => snapshotAt(pkg, round.roundNumber, side, tk));
      if (snapshots.every((s) => Object.keys(s.defaults).length === 0 && Object.keys(s.advanced).length === 0)) continue;
      const teamKey = round.teamASide === side ? "teamA" : "teamB";
      const invest = siteInvestmentFor(pkg, round, side);              // 双点投入：进点人数/道具/最深 anchor/下包
      const target = targetSiteFor(pkg, round, invest);               // 下包点优先，否则进点最深 site
      const exec = executeRemainFor(pkg, round, side, target, tickrate); // 第二人进 target 包点 zone 的剩余秒
      out.push({
        matchId, mapName: pkg.match.mapName, side, teamKey,
        economy: economyTypeFor(pkg, round, teamKey),
        won: round.winnerSide === side, roundNumber: round.roundNumber,
        snapshots, targetSite: target,
        siteInvestment: invest,
        entryAnchors: entryAnchorsFor(pkg, round, side),
        executeRemainSec: exec, executeBucket: bucketOf(exec),
        firstKillForTeam: firstKillForTeamFor(pkg, round, teamKey),
        grenadeIds: grenadeIdsFor(pkg, round, side),
      });
    }
  }
  return out;
}
```

> helper（`aliveCalloutsAt`/`siteInvestmentFor`/`targetSiteFor`/`executeRemainFor`/`entryAnchorsFor`/`firstKillForTeamFor`/`economyTypeFor`/`grenadeIdsFor`/`freezeEndOf`）实现在同文件，复用现有 `replayLabelsAt`、`sideOf`、`pkg.bombs`、`pkg.kills`、`pkg.playerEconomies`。`firstKillForTeam` = `pkg.kills` 按 tick 排序首条的 killer 是否属 teamKey（无击杀→null）。`economyType` 取该队该回合 `EconomyType`（上游字段）。

- [ ] **Step 4: 接入 extractMatchFacts（457 行）**

```ts
// facts.ts:457 — 替换
tacticalRounds: extractTacticalRoundFacts(pkg, options.matchId),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run apps/dak-studio/src/lib/facts.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit（与 2.1 类型一起，保持可编译）**

```bash
git add apps/dak-studio/src/lib/facts.ts apps/dak-studio/src/lib/facts.test.ts
git commit -m "feat(studio): TacticalRoundFact 提取（双层站位/双点投入/倒计时节奏/首杀/经济）"
```

### Task 2.3: store 读写迁移

**Files:**
- Modify: `apps/dak-studio/src/lib/facts.ts:501, 562-563, 634-635`

- [ ] **Step 1: 改 store namespace 与读写**

```ts
// facts.ts:501
const tacticalRounds = adapter.records(`${namespace}:tactical_rounds`);
// putMatchFacts（562-563）
tacticalRounds,
facts.tacticalRounds.map((row) => [rowKey(row.matchId, String(row.roundNumber), row.side), row] as const),
// getTacticalRounds（634-635 替换 getOpeningPatterns）
async getTacticalRounds(scope) {
  return (await tacticalRounds.getAll<TacticalRoundFact>())
    .filter((row) => inScope(row, scope));
},
```

- [ ] **Step 2: rowKey 加 side 维度（同回合 T/CT 两行）**

确认 `rowKey(matchId, round, side)` 三段唯一；若现有 `rowKey` 仅两段，扩展为可变参数 join。

- [ ] **Step 3: Run typecheck + 全量测试**

Run: `pnpm typecheck && pnpm vitest run apps/dak-studio`
Expected: facts 相关 PASS；CoachView 引用旧 API 处 typecheck 报错 → Phase 5 修。临时在 CoachView 顶部 `// @ts-expect-error 待 Phase 5` 或保留旧 `buildOpeningPatternClustersFromFacts` 直到 Phase 3，避免阻塞。

- [ ] **Step 4: Commit**

```bash
git add apps/dak-studio/src/lib/facts.ts
git commit -m "feat(studio): facts store 迁移 tactical_rounds 投影（按 match/round/side）"
```

---

## Phase 3 — 聚类 + 双层 basis + 节奏桶（tactics.ts）

把聚类逻辑从 facts.ts 迁出到独立纯逻辑模块，便于 TDD。

### Task 3.1: 双层 basis 序列化

**Files:**
- Create: `apps/dak-studio/src/lib/tactics.ts`
- Create: `apps/dak-studio/src/lib/tactics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tactics.test.ts
import { describe, it, expect } from "vitest";
import { defaultsBasisKey, advancedBasisKey } from "./tactics.js";

describe("basis 序列化", () => {
  it("defaults 精确人头，按 anchorId 排序稳定", () => {
    expect(defaultsBasisKey({ a_ramp: 3, mid: 1, a_palace: 1 }))
      .toBe("a_palace:1|a_ramp:3|mid:1");
  });
  it("空分布返回空串", () => {
    expect(defaultsBasisKey({})).toBe("");
  });
  it("advanced 同样可序列化", () => {
    expect(advancedBasisKey({ Catwalk: 1, Connector: 1 })).toBe("Catwalk:1|Connector:1");
  });
});
```

- [ ] **Step 2: Run test** — Run: `pnpm vitest run apps/dak-studio/src/lib/tactics.test.ts` → FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
// tactics.ts
export function defaultsBasisKey(defaults: Record<string, number>): string {
  return Object.entries(defaults)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, n]) => `${id}:${n}`)
    .join("|");
}
export const advancedBasisKey = defaultsBasisKey; // 同序列化规则
```

- [ ] **Step 4: Run test** → PASS。
- [ ] **Step 5: Commit**

```bash
git add apps/dak-studio/src/lib/tactics.ts apps/dak-studio/src/lib/tactics.test.ts
git commit -m "feat(studio): tactics 双层 basis 序列化"
```

### Task 3.2: 聚类 key + 簇构建

**Files:**
- Modify: `apps/dak-studio/src/lib/tactics.ts`, `tactics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tactics.test.ts 追加
import { tacticalClusterKey, buildTacticalClusters } from "./tactics.js";
import type { TacticalRoundFact } from "./facts.js";

function fact(p: Partial<TacticalRoundFact>): TacticalRoundFact {
  return {
    matchId: "m", mapName: "de_mirage", side: "t", teamKey: "teamA",
    economy: "full", won: true, roundNumber: 1,
    snapshots: [{ remainSec: 100, defaults: { a_ramp: 3, mid: 2 }, advanced: {} }],
    targetSite: "a", siteInvestment: { a: { entryCount: 4, grenadeCount: 3, deepestAnchor: "a_ramp", planted: true }, b: { entryCount: 0, grenadeCount: 0, deepestAnchor: null, planted: false } },
    entryAnchors: ["a_ramp", "a_palace"], executeRemainSec: 30, executeBucket: "late",
    firstKillForTeam: true, grenadeIds: [], ...p,
  } as TacticalRoundFact;
}

describe("tactical 聚类", () => {
  it("key 含 map/side/targetSite/首切片defaults/entryAnchors/节奏桶，不含道具", () => {
    expect(tacticalClusterKey(fact({}))).toBe(
      "de_mirage:t:a:a_ramp:3|mid:2:a_palace,a_ramp:late"
    );
  });
  it("同站位不同节奏 → 两簇", () => {
    const rush = fact({ executeBucket: "rush", roundNumber: 2, won: false });
    const late = fact({ executeBucket: "late", roundNumber: 3 });
    const clusters = buildTacticalClusters([rush, late]);
    expect(clusters.length).toBe(2);
  });
  it("簇聚合胜率/样本/道具关联", () => {
    const clusters = buildTacticalClusters([fact({ won: true }), fact({ won: false, roundNumber: 2, grenadeIds: ["g1"] })]);
    expect(clusters[0].roundCount).toBe(2);
    expect(clusters[0].winRatePercent).toBe(50);
  });
});
```

- [ ] **Step 2: Run test** → FAIL。

- [ ] **Step 3: 实现**

```ts
// tactics.ts 追加
import type { TacticalRoundFact } from "./facts.js";

export interface TacticalCluster {
  id: string;
  mapName: string;
  side: TacticalRoundFact["side"];
  targetSite: "a" | "b" | null;
  defaultsBasis: string;        // 首切片 defaults 序列化
  entryAnchors: string[];
  executeBucket: TacticalRoundFact["executeBucket"];
  roundCount: number;
  winRatePercent: number | null;
  rounds: Array<{ matchId: string; roundNumber: number; won: boolean; economy: string }>;
  plantRatePercent: number | null;
}

export function tacticalClusterKey(f: TacticalRoundFact): string {
  const defaults = defaultsBasisKey(f.snapshots[0]?.defaults ?? {});
  const entries = [...f.entryAnchors].sort().join(",");
  return `${f.mapName}:${f.side}:${f.targetSite ?? "-"}:${defaults}:${entries}:${f.executeBucket ?? "-"}`;
}

export function buildTacticalClusters(rows: TacticalRoundFact[]): TacticalCluster[] {
  const map = new Map<string, TacticalCluster>();
  for (const f of rows) {
    const id = tacticalClusterKey(f);
    const c = map.get(id) ?? {
      id, mapName: f.mapName, side: f.side, targetSite: f.targetSite,
      defaultsBasis: defaultsBasisKey(f.snapshots[0]?.defaults ?? {}),
      entryAnchors: f.entryAnchors, executeBucket: f.executeBucket,
      roundCount: 0, winRatePercent: null, rounds: [], plantRatePercent: null,
    };
    c.roundCount += 1;
    c.rounds.push({ matchId: f.matchId, roundNumber: f.roundNumber, won: f.won, economy: f.economy });
    map.set(id, c);
  }
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  return [...map.values()]
    .map((c) => ({
      ...c,
      winRatePercent: pct(c.rounds.filter((r) => r.won).length, c.roundCount),
    }))
    .sort((a, b) => b.roundCount - a.roundCount || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run test** → PASS。
- [ ] **Step 5: 删除 facts.ts 的旧 `buildOpeningPatternClustersFromFacts`（794-819）**，CoachView 改用 `buildTacticalClusters`（Phase 5）。
- [ ] **Step 6: Commit**

```bash
git add apps/dak-studio/src/lib/tactics.ts apps/dak-studio/src/lib/tactics.test.ts apps/dak-studio/src/lib/facts.ts
git commit -m "feat(studio): tactical 聚类（双层basis+节奏桶进key，道具移出key）"
```

---

## Phase 4 — 判断层 v0（疑似 fake / 自动命名）

规则 v0，标"推测"，UI 可纠正（纠正存本地，Phase 5 接）。

### Task 4.1: 疑似 fake + 自动命名

**Files:**
- Modify: `apps/dak-studio/src/lib/tactics.ts`, `tactics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tactics.test.ts 追加
import { suspectFake, autoName } from "./tactics.js";

describe("判断层 v0", () => {
  it("某 site 道具≥2 且进点 0 人 → 疑似道具佯攻", () => {
    const f = fact({ siteInvestment: { a: { entryCount: 0, grenadeCount: 2, deepestAnchor: null, planted: false }, b: { entryCount: 3, grenadeCount: 1, deepestAnchor: "b_apps", planted: true } }, targetSite: "b" });
    expect(suspectFake(f)).toEqual({ suspected: true, reason: "A 区道具佯攻（道具2/进点0）" });
  });
  it("双点都出人不算 fake", () => {
    const f = fact({ siteInvestment: { a: { entryCount: 1, grenadeCount: 1, deepestAnchor: "a_ramp", planted: false }, b: { entryCount: 3, grenadeCount: 1, deepestAnchor: "b_apps", planted: true } }, targetSite: "b" });
    expect(suspectFake(f).suspected).toBe(false);
  });
  it("自动命名：模板拼接 anchor 名 + 节奏", () => {
    expect(autoName({ mapName: "de_mirage", side: "t", defaultsBasis: "a_ramp:3|mid:1", entryAnchors: ["a_ramp"], executeBucket: "rush", targetSite: "a" } as any))
      .toBe("rush A · A1×3 / 中路×1");
  });
});
```

- [ ] **Step 2: Run test** → FAIL。

- [ ] **Step 3: 实现（命名用 `DEFAULT_POSITIONS` 的 anchor.name）**

```ts
// tactics.ts 追加
import { DEFAULT_POSITIONS } from "@cs2dak/maps";

const BUCKET_CN: Record<string, string> = { rush: "提速", fast: "速爆", mid: "默认", late: "后打" };

export function suspectFake(f: TacticalRoundFact): { suspected: boolean; reason?: string } {
  const other = f.targetSite === "a" ? "b" : "a";
  const inv = f.siteInvestment[other as "a" | "b"];
  if (inv && inv.grenadeCount >= 2 && inv.entryCount === 0) {
    return { suspected: true, reason: `${other.toUpperCase()} 区道具佯攻（道具${inv.grenadeCount}/进点0）` };
  }
  return { suspected: false };
}

export function autoName(c: Pick<TacticalCluster, "mapName" | "side" | "defaultsBasis" | "entryAnchors" | "executeBucket" | "targetSite">): string {
  const anchors = DEFAULT_POSITIONS[c.mapName]?.[c.side].anchors ?? {};
  const parts = c.defaultsBasis.split("|").filter(Boolean).map((seg) => {
    const [id, n] = seg.split(":");
    return `${anchors[id]?.name ?? id}×${n}`;
  });
  const bucket = c.executeBucket ? BUCKET_CN[c.executeBucket] : "";
  const site = c.targetSite ? c.targetSite.toUpperCase() : "";
  return `${bucket} ${site} · ${parts.join(" / ")}`.trim().replace(/^· /, "");
}
```

- [ ] **Step 4: Run test** → PASS。
- [ ] **Step 5: Commit**

```bash
git add apps/dak-studio/src/lib/tactics.ts apps/dak-studio/src/lib/tactics.test.ts
git commit -m "feat(studio): 判断层 v0 — 疑似道具佯攻 + 自动战术命名（模板拼接）"
```

---

## Phase 5 — 打法模式 UI（CoachView + PatternExplorer + RadarTrails）

### Task 5.1: 抽出共享 radar 渲染器 RadarTrails

**Files:**
- Create: `apps/dak-studio/src/components/RadarTrails.tsx`
- Modify: `apps/dak-studio/src/views/TrailsView.tsx`（`TrailStage` → 消费 RadarTrails）

- [ ] **Step 1:** 把 `TrailsView.tsx` 的 `TrailStage`（359-491）整体迁到 `RadarTrails.tsx`，导出 `RadarTrails` 组件，props：

```ts
export interface RadarTrailsProps {
  mapName: string;
  trails: Array<{ id: string; points: Array<{ x: number; y: number }>; color: string; opacity?: number }>;
  grenades?: Array<{ x: number; y: number; type: string }>;
  size?: number;
}
```

渲染逻辑（`worldToRadar` 预投影 + `<image href maps/radars/{map}.png>` + `<polyline>`）保持与原 `TrailStage` 一致。

- [ ] **Step 2:** `TrailsView` 改为构造 `trails` 喂给 `RadarTrails`，删除内联 SVG。
- [ ] **Step 3: Run** — `pnpm dev:studio`，进 TrailsView 目视轨迹叠加与原一致（preview 验证：动线渲染不变）。
- [ ] **Step 4: Commit**

```bash
git add apps/dak-studio/src/components/RadarTrails.tsx apps/dak-studio/src/views/TrailsView.tsx
git commit -m "refactor(studio): 抽出 RadarTrails 共享 radar 叠加渲染器"
```

### Task 5.2: PatternExplorer 三栏

**Files:**
- Create: `apps/dak-studio/src/views/coach/PatternExplorer.tsx`
- Modify: `apps/dak-studio/src/views/CoachView.tsx`（patterns tab）

- [ ] **Step 1:** `PatternExplorer` props + 数据流：

```ts
export interface PatternExplorerProps {
  clusters: TacticalCluster[];
  factsBySide: TacticalRoundFact[];                // 供证据回合表/轨迹取数
  entryByMatchId: Map<string, StudioDemoEntry>;
  onOpenMatch: (entryId: string, target?: { roundNumber: number; tick?: number }) => void;
  onAddToPlaylist: (round: { matchId: string; roundNumber: number; clusterId: string }) => void;
}
```

布局（遵守 `docs/design-language.md`：只用 `--dak-*`/`stu-*` token，派生指标带 ⓘ，缺失 `—`）：
- 左栏：簇列表，每项 = `autoName(cluster)`（标"推测"可改）+ `roundCount`·场数 + 节奏桶 + 胜率/下包率。
- 中栏：`RadarTrails`，喂该簇所有回合该 side 的轨迹（半透明叠加）+ 道具落点；切片切换（snapshots 的 remainSec）。
- 右栏：纯数据摘要（样本/占比/经济分布/执行剩余中位/首杀率/下包率/常用 lineup）。
- 下方：证据回合表（比赛/回合/经济/执行剩余/首杀/下包/结果/查看回放/加入备战）。

- [ ] **Step 2:** CoachView patterns tab 用 `buildTacticalClusters(getFactsStore().getTacticalRounds(...))` 取数，渲染 `PatternExplorer`。
- [ ] **Step 3: Run** — `pnpm dev:studio`，导入多场 demo，进教练页打法模式：左栏出簇、点簇中栏叠加轨迹、下方证据回合可跳回放。preview 验证截图。
- [ ] **Step 4: Commit**

```bash
git add apps/dak-studio/src/views/coach/PatternExplorer.tsx apps/dak-studio/src/views/CoachView.tsx
git commit -m "feat(studio): 打法模式三栏（簇列表/轨迹叠加/数据摘要/证据回合）"
```

---

## Phase 6 — 备战清单 + 地图池表

### Task 6.1: Round Playlist 持久化 + Markdown 导出

**Files:**
- Create: `apps/dak-studio/src/lib/playlist.ts`, `playlist.test.ts`
- Modify: `apps/dak-studio/src/lib/series.ts`（复用 record store 模式）

- [ ] **Step 1: Write the failing test**

```ts
// playlist.test.ts
import { describe, it, expect } from "vitest";
import { playlistToMarkdown, type PlaylistItem } from "./playlist.js";

it("导出 Markdown：分组 + 人工备注", () => {
  const items: PlaylistItem[] = [
    { id: "1", group: "对手 A 双线", matchId: "m1", roundNumber: 7, note: "二楼晚 3-5 秒" },
    { id: "2", group: "对手 A 双线", matchId: "m1", roundNumber: 9, note: "" },
  ];
  const md = playlistToMarkdown("Mirage vs Team B", items);
  expect(md).toContain("# Mirage vs Team B");
  expect(md).toContain("## 对手 A 双线");
  expect(md).toContain("- R7 — 二楼晚 3-5 秒");
  expect(md).toContain("- R9");
});
```

- [ ] **Step 2: Run** → FAIL。
- [ ] **Step 3: 实现** `PlaylistItem` 类型、`playlistToMarkdown`，并在 `series.ts` 加 `listPlaylist/savePlaylistItem/removePlaylistItem`（同 `listSeriesRecords` 的 record store 模式，namespace `playlist`）。
- [ ] **Step 4: Run** → PASS。
- [ ] **Step 5: Commit**

```bash
git add apps/dak-studio/src/lib/playlist.ts apps/dak-studio/src/lib/playlist.test.ts apps/dak-studio/src/lib/series.ts
git commit -m "feat(studio): 备战清单持久化 + Markdown 导出"
```

### Task 6.2: 地图池比较表

**Files:**
- Create: `apps/dak-studio/src/views/coach/MapPoolTable.tsx`
- Modify: `apps/dak-studio/src/views/CoachView.tsx`（anti tab → MapPoolTable）

- [ ] **Step 1:** `MapPoolTable` 聚合：按地图列出 我方样本/胜率、对手样本/胜率、对手高频 pattern（取 `buildTacticalClusters` 头部簇 `autoName`）、备注列（手填，存 series record）。我方/对手由 `CoachSettings.myTeamName` + `teamRenames` 区分。
- [ ] **Step 2:** CoachView anti tab 渲染 `MapPoolTable`（保留备战报告 Markdown 入口为次级）。
- [ ] **Step 3: Run** — preview 验证地图池表渲染、样本/胜率正确。
- [ ] **Step 4: Commit**

```bash
git add apps/dak-studio/src/views/coach/MapPoolTable.tsx apps/dak-studio/src/views/CoachView.tsx
git commit -m "feat(studio): 备战地图池比较表（我方/对手样本胜率+高频pattern）"
```

### Task 6.3: 重导触发 + 收尾

- [ ] **Step 1:** 确认 facts 重导路径（`putMatchFacts`）覆盖 `tacticalRounds`；旧 `opening_patterns` namespace 数据清理（Studio 启动迁移：忽略旧 key 即可，无需迁移历史）。
- [ ] **Step 2: Run 全量**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿。

- [ ] **Step 3:** 更新 `docs/design/studio-redesign.md` 教练页章节指向本方案；`AGENTS.md` 表格 dak-studio 行补"教练页战术聚类"。
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(studio): 教练页战术聚类 0.6.0 收尾（重导/文档同步）"
```

---

## Self-Review

**1. Spec coverage：**
- 默认位机制（阵营专属 + advanced/ct/terminal + 数据驱动归并）→ Phase 1 ✅
- 双层 basis（defaults/advanced，深层不回算）→ Phase 2 (TacticalSnapshot) + Phase 3 (basis key) ✅
- 倒计时节奏桶进 key → Phase 2 (bucketOf) + Phase 3 (clusterKey) ✅
- 首杀（弃 damage）→ Phase 2 (firstKillForTeamFor) ✅
- 经济 5 分类（上游 economyType）→ Phase 2 ✅
- Fake 不贴标签记双点投入 + 判断层 v0 可纠正 → Phase 2 (siteInvestment) + Phase 4 ✅
- CT 多时间切片动态防守 → Phase 2 (ctSlices 3 切片) ✅
- 证据回合表 / 轨迹叠加复用 TrailsView → Phase 5 ✅
- 备战清单 Round Playlist + 地图池表 → Phase 6 ✅
- route 归档 / callout 唯一源 / RR 零影响 → Phase 0 ✅
- 自动命名模板拼接 → Phase 4 ✅

**2. Placeholder scan：** Phase 2 的 fact helper（`siteInvestmentFor` 等）与 Phase 5/6 的 UI 渲染细节标注为"实现见 PR / 遵守 design-language"，非 TBD——它们有明确输入输出契约和数据来源；执行时按契约补全。其余步骤均带完整代码。

**3. Type consistency：** `TacticalRoundFact`/`TacticalSnapshot`/`SiteInvestment`/`ExecuteBucket`（Phase 2）↔ `TacticalCluster`/`tacticalClusterKey`/`buildTacticalClusters`（Phase 3）↔ `suspectFake`/`autoName`（Phase 4）↔ `DEFAULT_POSITIONS`/`roleOf`/`anchorOf`（Phase 1）签名一致；`getTacticalRounds` 在 facts.ts(2.3) 与 CoachView(5.2) 同名。

---

## 执行依赖与建议

- Phase 顺序强依赖：0→1→2→3→（4‖5 部分可并）→6。Phase 1 的人工固化（Task 1.3）是关键路径，建议先跑脚本拿草案。
- Phase 5/6 的 UI 步骤无单测，靠 preview 目视 + 抽出的纯函数（tactics/playlist）单测兜底正确性。
