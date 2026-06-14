import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadDemoPackageFromZip } from "../../core/src/index.ts";
import { FLAG_ALIVE, type DemoPackage } from "../../contract/src/index.ts";
import { CALLOUT_NAME_CN } from "../src/callout-names.js";

const WINDOW_SEC = 30;
const TERMINAL = new Set(["BombsiteA", "BombsiteB", "CTSpawn"]);

type Side = "t" | "ct";
type SideCount = Record<Side, number>;
type Occ = Map<string, SideCount>;
type Transitions = Map<string, SideCount>;

export interface MapEvidence {
  occupancy: Occ;
  transitions: Transitions;
  zipCount: number;
}

interface AnchorSeed {
  name: string;
  callouts: string[];
}

interface SideSeed {
  anchors: Record<string, AnchorSeed>;
}

const SEEDS: Record<string, Record<Side, SideSeed>> = {
  de_mirage: {
    t: {
      anchors: {
        a_ramp: { name: "A1", callouts: ["PalaceAlley", "TRamp"] },
        a_palace: { name: "A二楼", callouts: ["PalaceInterior", "Scaffolding"] },
        mid: { name: "中路", callouts: ["TopofMid", "SideAlley", "Middle"] },
        underpass: { name: "下水道", callouts: ["Underpass"] },
        b_apps: { name: "B二楼", callouts: ["House", "BackAlley", "Apartments"] },
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A点", callouts: ["BombsiteA", "Stairs", "Jungle"] },
        mid: { name: "中路", callouts: ["SnipersNest", "Connector", "Catwalk", "Ladder"] },
        b_site: { name: "B点", callouts: ["BombsiteB", "Shop", "Truck"] },
      },
    },
  },
  de_ancient: {
    t: {
      anchors: {
        a_hall: { name: "A厅", callouts: ["MainHall", "Outside"] },
        b_ramp: { name: "B坡/B外", callouts: ["Ruins", "Ramp"] },
        b_short: { name: "B小/跳台", callouts: ["TSideLower", "TSideUpper"] },
        tunnel_water: { name: "隧道/水路", callouts: ["Tunnel", "Water"] },
      },
    },
    ct: {
      anchors: {
        mid: { name: "中路", callouts: ["Middle", "TopofMid"] },
        a_site: { name: "A点", callouts: ["BombsiteA", "SideHall", "SideEntrance"] },
        b_site: { name: "B点", callouts: ["BombsiteB", "Alley", "House"] },
        ct_spawn: { name: "警家", callouts: ["CTSpawn"] },
      },
    },
  },
  de_anubis: {
    t: {
      anchors: {
        a_hall: { name: "A厅", callouts: ["Main"] },
        mid: { name: "中路", callouts: ["Bridge", "Middle", "MidDoors"] },
        canal: { name: "水下", callouts: ["Canal"] },
        b_long: { name: "B外", callouts: ["Ruins", "OutsideLong"] },
        t_spawn_route: { name: "匪路", callouts: ["Street", "TSideUpper", "TStairs"] },
      },
    },
    ct: {
      anchors: {
        b_site: { name: "B点", callouts: ["BombsiteB", "BackofB", "PalaceInterior", "Bricks"] },
        mid: { name: "中路", callouts: ["Middle", "Connector", "MidDoors"] },
        a_site: { name: "A点", callouts: ["BombsiteA", "Walkway", "Heaven"] },
        ct_spawn: { name: "警家", callouts: ["CTSideUpper", "Alley", "LowerTunnel", "CTSpawn", "SnipersNest"] },
      },
    },
  },
  de_dust2: {
    t: {
      anchors: {
        a_long: { name: "A大", callouts: ["OutsideLong", "LongDoors", "LongA"] },
        mid_b1: { name: "中路/B1", callouts: ["TopofMid", "Middle", "LowerTunnel"] },
        b_tunnels: { name: "B洞", callouts: ["OutsideTunnel", "UpperTunnel", "TunnelStairs"] },
      },
    },
    ct: {
      anchors: {
        a_long: { name: "A大", callouts: ["LongA", "Pit"] },
        a_short: { name: "A小", callouts: ["Catwalk", "ShortStairs", "ExtendedA"] },
        mid: { name: "中门/警家", callouts: ["MidDoors", "UnderA", "CTSpawn"] },
        b_site: { name: "B点", callouts: ["BombsiteB", "BDoors", "Hole"] },
      },
    },
  },
  de_inferno: {
    t: {
      anchors: {
        banana: { name: "香蕉道", callouts: ["Banana"] },
        mid: { name: "中路", callouts: ["TRamp", "LowerMid", "Middle", "TopofMid"] },
        second_mid_apps: {
          name: "侧道/二楼",
          callouts: ["SecondMid", "Apartments", "BackAlley", "Underpass", "Bridge", "Upstairs", "Deck"],
        },
      },
    },
    ct: {
      anchors: {
        b_site: { name: "B点", callouts: ["BombsiteB", "Banana", "Ruins"] },
        a_site: { name: "A点", callouts: ["BombsiteA", "Pit", "Quad", "Graveyard"] },
        arch_library: { name: "拱门/书房", callouts: ["Arch", "Library"] },
        ct_spawn: { name: "警家", callouts: ["CTSpawn"] },
      },
    },
  },
  de_nuke: {
    t: {
      anchors: {
        outside: { name: "外场", callouts: ["Outside", "Roof", "Silo"] },
        lobby_a: { name: "匪厅/A内", callouts: ["Lobby", "Squeaky", "Hut", "Trophy"] },
        ramp: { name: "铁板", callouts: ["Ramp"] },
        secret_b: { name: "K1/地下", callouts: ["Secret", "Tunnels", "Vending", "Control"] },
      },
    },
    ct: {
      anchors: {
        outside: { name: "外场", callouts: ["Outside", "Garage", "Catwalk", "Crane"] },
        a_site: { name: "A点", callouts: ["BombsiteA", "Rafters", "Mini", "HutRoof", "Heaven", "Hell"] },
        ramp: { name: "铁板", callouts: ["Ramp", "Admin"] },
        b_site: { name: "B点", callouts: ["BombsiteB", "Control", "Decon", "Observation"] },
        ct_spawn: { name: "警家", callouts: ["CTSpawn", "LockerRoom"] },
      },
    },
  },
  de_overpass: {
    t: {
      anchors: {
        a_upper: { name: "A区上路", callouts: ["Fountain", "Playground", "UpperPark", "LowerPark"] },
        underpass: { name: "下水道", callouts: ["Tunnels", "Connector"] },
        canal: { name: "长管", callouts: ["Canal"] },
        b_short: { name: "B短/工地", callouts: ["Pipe", "Water", "Construction"] },
        b_outer: { name: "B外", callouts: ["Alley", "TStairs"] },
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A点", callouts: ["BombsiteA", "LowerPark", "UpperPark", "BackofA", "UnderA", "Stairs", "Restroom"] },
        b_site: { name: "B点", callouts: ["BombsiteB", "Water", "Walkway", "SnipersNest", "Construction"] },
        connector: { name: "下水道", callouts: ["Connector"] },
        bank: { name: "银行", callouts: ["Lobby", "StorageRoom"] },
      },
    },
  },
};

function zipFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...zipFiles(path));
    else if (name.endsWith(".zip")) out.push(path);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

async function loadZip(path: string): Promise<DemoPackage> {
  return loadDemoPackageFromZip(readFileSync(path));
}

function add(occ: Occ, callout: string, side: Side): void {
  const current = occ.get(callout) ?? { t: 0, ct: 0 };
  current[side] += 1;
  occ.set(callout, current);
}

function transitionKey(from: string, to: string): string {
  return `${from}\t${to}`;
}

function addTransition(transitions: Transitions, from: string, to: string, side: Side): void {
  if (from === to) return;
  const key = transitionKey(from, to);
  const current = transitions.get(key) ?? { t: 0, ct: 0 };
  current[side] += 1;
  transitions.set(key, current);
}

function accumulate(pkg: DemoPackage, evidence: MapEvidence): void {
  const replay = pkg.replay;
  if (!replay) return;
  const rounds = new Map(pkg.rounds.map((round) => [round.roundNumber, round]));
  const placeDict = replay.placeDict ?? [];
  const tickrate = pkg.match.tickrate || 64;
  for (const replayRound of replay.rounds) {
    const round = rounds.get(replayRound.roundNumber);
    if (!round) continue;
    const endTick = Math.min(round.endTick, round.freezeEndTick + WINDOW_SEC * tickrate);
    for (const track of replayRound.players) {
      const player = pkg.players[track.playerIndex];
      if (!player) continue;
      const side = player.teamKey === "teamA" ? round.teamASide : round.teamBSide;
      let previousPlace: string | null = null;
      for (let frame = 0; frame < replayRound.frameCount; frame++) {
        const tick = replayRound.startTick + frame * replayRound.tickStep;
        if (tick < round.freezeEndTick || tick > endTick) continue;
        if (((track.flags[frame] ?? 0) & FLAG_ALIVE) === 0) continue;
        const place = placeDict[track.place[frame] ?? -1];
        if (!place) continue;
        add(evidence.occupancy, place, side);
        if (previousPlace && previousPlace !== place) addTransition(evidence.transitions, previousPlace, place, side);
        previousPlace = place;
      }
    }
  }
}

function knownCallouts(mapName: string): Set<string> {
  return new Set(Object.keys((CALLOUT_NAME_CN as Record<string, Record<string, string>>)[mapName] ?? {}));
}

function anchorTokens(name: string): string[] {
  return name.split(/[\/、]/).map((token) => token.trim()).filter(Boolean);
}

function belongsByName(mapName: string, anchorName: string, callout: string): boolean {
  const cn = (CALLOUT_NAME_CN as Record<string, Record<string, string>>)[mapName]?.[callout] ?? "";
  if (!cn) return false;
  return anchorTokens(anchorName).some((token) => cn.startsWith(token) || token.startsWith(cn));
}

function renderAnchors(mapName: string, side: Side, occ: Occ): Record<string, AnchorSeed> {
  const seedAnchors = SEEDS[mapName]?.[side].anchors ?? {};
  const known = knownCallouts(mapName);
  const anchors = Object.fromEntries(
    Object.entries(seedAnchors)
      .map(([anchorId, anchor]) => [
        anchorId,
        { name: anchor.name, callouts: anchor.callouts.filter((callout) => known.has(callout)) },
      ] as const)
      .filter(([, anchor]) => anchor.callouts.length > 0),
  );
  const assigned = new Set(Object.values(anchors).flatMap((anchor) => anchor.callouts));
  for (const callout of [...known].sort((a, b) => a.localeCompare(b))) {
    if (assigned.has(callout) || TERMINAL.has(callout)) continue;
    const counts = occ.get(callout) ?? { t: 0, ct: 0 };
    const own = counts[side];
    const other = counts[side === "t" ? "ct" : "t"];
    if (own < 10 || own <= other * 1.2) continue;
    const match = Object.entries(anchors).find(([, anchor]) => belongsByName(mapName, anchor.name, callout));
    if (!match) continue;
    match[1].callouts.push(callout);
    assigned.add(callout);
  }
  return anchors;
}

function renderRoles(mapName: string, side: Side, occ: Occ, anchors: Record<string, AnchorSeed>): Record<string, string> {
  const known = knownCallouts(mapName);
  const anchored = new Set(Object.values(anchors).flatMap((anchor) => anchor.callouts));
  const roles: Record<string, string> = {};
  for (const callout of [...known].sort((a, b) => a.localeCompare(b))) {
    if (anchored.has(callout)) continue;
    if (side === "t" && TERMINAL.has(callout)) {
      roles[callout] = "terminal";
      continue;
    }
    if (side === "ct" && callout === "TSpawn") {
      roles[callout] = "terminal";
      continue;
    }
    const counts = occ.get(callout) ?? { t: 0, ct: 0 };
    const own = counts[side];
    const other = counts[side === "t" ? "ct" : "t"];
    if (side === "t" && other > own * 1.4 && other >= 25) roles[callout] = "ct";
    else if (own >= 10) roles[callout] = "advanced";
  }
  return roles;
}

function renderTsObject(mapName: string, occ: Occ): string {
  const seed = SEEDS[mapName];
  if (!seed) return "";
  const sides = (["t", "ct"] as const).map((side) => {
    const anchors = renderAnchors(mapName, side, occ);
    const roles = renderRoles(mapName, side, occ, anchors);
    return `${side}: {\n      anchors: ${JSON.stringify(anchors, null, 8).replace(/\n/g, "\n      ")},\n      roles: ${JSON.stringify(roles, null, 8).replace(/\n/g, "\n      ")},\n    }`;
  });
  return `${mapName}: {\n    ${sides.join(",\n    ")},\n  },`;
}

function formatCallout(mapName: string, callout: string): string {
  const cn = (CALLOUT_NAME_CN as Record<string, Record<string, string>>)[mapName]?.[callout] ?? "";
  return cn ? `${callout}(${cn})` : callout;
}

function formatCounts(counts: SideCount | undefined): string {
  return `T=${counts?.t ?? 0} CT=${counts?.ct ?? 0}`;
}

function topOccupancy(occ: Occ, side: Side, limit = 8): string {
  return [...occ.entries()]
    .sort((a, b) => b[1][side] - a[1][side])
    .slice(0, limit)
    .map(([callout, counts]) => `${callout} ${formatCounts(counts)}`)
    .join("; ");
}

function renderAnchorReview(mapName: string, side: Side, evidence: MapEvidence): string[] {
  const anchors = renderAnchors(mapName, side, evidence.occupancy);
  const lines = [`### ${side === "t" ? "T" : "CT"} 默认位草案`];
  for (const [anchorId, anchor] of Object.entries(anchors)) {
    const callouts = anchor.callouts
      .map((callout) => `${formatCallout(mapName, callout)} ${formatCounts(evidence.occupancy.get(callout))}`)
      .join("; ");
    lines.push(`- ${anchorId} / ${anchor.name}: ${callouts}`);
  }
  return lines;
}

function renderAdjacency(mapName: string, transitions: Transitions, limit = 16): string[] {
  const rows = [...transitions.entries()]
    .sort((a, b) => b[1].t + b[1].ct - (a[1].t + a[1].ct))
    .slice(0, limit);
  const lines = ["### 相邻证据", "同一玩家在开局窗口内发生 callout 变化时记录一条有向边。"];
  for (const [key, counts] of rows) {
    const [from, to] = key.split("\t");
    lines.push(`- ${formatCallout(mapName, from)} -> ${formatCallout(mapName, to)}: ${formatCounts(counts)}`);
  }
  return lines;
}

function renderMapReview(mapName: string, evidence: MapEvidence): string {
  return [
    `## ${mapName}`,
    "",
    `样本 ZIP：${evidence.zipCount}`,
    "",
    "### 高频占有",
    `- T: ${topOccupancy(evidence.occupancy, "t")}`,
    `- CT: ${topOccupancy(evidence.occupancy, "ct")}`,
    "",
    ...renderAnchorReview(mapName, "t", evidence),
    "",
    ...renderAnchorReview(mapName, "ct", evidence),
    "",
    ...renderAdjacency(mapName, evidence.transitions),
    "",
    "### TS 草案",
    "```ts",
    renderTsObject(mapName, evidence.occupancy),
    "```",
  ].join("\n");
}

export function renderReviewReport(byMap: Map<string, MapEvidence>, scannedCount: number): string {
  return [
    "# Default Positions Review",
    "",
    `扫描 ZIP：${scannedCount}`,
    `统计窗口：freezeEnd + ${WINDOW_SEC}s`,
    "",
    ...[...byMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mapName, evidence]) => renderMapReview(mapName, evidence)),
  ].join("\n");
}

function renderStats(mapName: string, occ: Occ): string {
  const total = [...occ.values()].reduce((sum, counts) => sum + counts.t + counts.ct, 0);
  const rows = [...occ.entries()]
    .sort((a, b) => b[1].t + b[1].ct - (a[1].t + a[1].ct))
    .map(([callout, counts]) => {
      const t = total ? ((100 * counts.t) / total).toFixed(2) : "0.00";
      const ct = total ? ((100 * counts.ct) / total).toFixed(2) : "0.00";
      return `//   ${callout.padEnd(16)} T=${counts.t.toString().padStart(6)} (${t}%) CT=${counts.ct.toString().padStart(6)} (${ct}%)`;
    });
  return [`// ${mapName} opening occupancy`, ...rows].join("\n");
}

async function main(paths: string[]): Promise<void> {
  const roots = paths.length > 0 ? paths : ["fixtures/output"];
  const byMap = new Map<string, MapEvidence>();
  const files = roots.flatMap(zipFiles);
  for (const file of files) {
    const pkg = await loadZip(file);
    const evidence = byMap.get(pkg.match.mapName) ?? {
      occupancy: new Map(),
      transitions: new Map(),
      zipCount: 0,
    };
    evidence.zipCount += 1;
    accumulate(pkg, evidence);
    byMap.set(pkg.match.mapName, evidence);
  }
  console.log(renderReviewReport(byMap, files.length));
}

if (process.argv[1]?.endsWith("derive-default-positions.ts")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
