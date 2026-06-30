import { calloutCn, entryRouteCn, SITE_ENTRY_SEMANTICS, DEFAULT_POSITIONS } from "@cs2dak/maps";

export type EconomyEntry = "pistol" | "gun" | "anti_eco" | "force" | "semi" | "eco";

export interface TacticalClusterLabelInput {
  mapName: string;
  side: "t" | "ct";
  economyEntry: EconomyEntry;
  openingIntent: {
    regionCounts: { a: number; b: number; mid: number; unknown: number };
    spread: string;
  };
  defaultAnchorCounts: Readonly<Record<string, number>>;
}

export const ECONOMY_ENTRY_CN: Record<EconomyEntry, string> = {
  pistol: "手枪局",
  gun: "长枪局",
  anti_eco: "Anti-eco",
  force: "强起",
  semi: "半起",
  eco: "Eco",
};

export function sideLabel(side: string): string {
  return side === "t" ? "进攻方" : "防守方";
}

function chokeCn(mapName: string, chokeId: string): string {
  const def = SITE_ENTRY_SEMANTICS[mapName]?.entries.find((entry) => entry.id === chokeId);
  for (const callout of def?.entryCallouts ?? []) {
    const cn = calloutCn(mapName, callout);
    if (cn) return cn;
  }
  return chokeId;
}

function structuralEntryName(mapName: string, combo: string): string {
  const ids = combo.split("+");
  const names = ids.map((id) => chokeCn(mapName, id));
  if (ids.length === 1) return names[0]!;
  return names.join(" + ");
}

/** 进点路线只用于 evidence 文案；词典不会参与主簇命名。 */
export function formatEntryEvidenceLabel(mapName: string, site: "a" | "b", combo: string): string {
  return entryRouteCn(mapName, site, combo) || structuralEntryName(mapName, combo);
}

/** 兼容旧展示调用；不得将此函数用于主簇名称。 */
export function formatEntryTacticName(mapName: string, site: "a" | "b", combo: string | null): string {
  return combo ? formatEntryEvidenceLabel(mapName, site, combo) : `${site.toUpperCase()} 点进点`;
}

function formationLabel(input: TacticalClusterLabelInput): string {
  const { a, mid, b } = input.openingIntent.regionCounts;
  return `${a}A-${mid}中-${b}B`;
}

function anchorLabels(input: TacticalClusterLabelInput): string[] {
  const anchors = DEFAULT_POSITIONS[input.mapName]?.[input.side].anchors ?? {};
  return Object.entries(input.defaultAnchorCounts)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => `${anchors[id]?.name ?? id}×${count}`);
}

/** 左栏短名显式保留 formation，禁止用字符串 regex 截断完整名称。 */
export function formatTacticalClusterShortName(cluster: TacticalClusterLabelInput): string {
  const anchors = anchorLabels(cluster);
  const structure = anchors.length > 0 ? anchors.join(" / ") : formationLabel(cluster);
  return `${formationLabel(cluster)} · ${structure}`;
}

/** 主簇名只描述已审核的默认位资产与真实开局人数结构。 */
export function formatTacticalClusterName(cluster: TacticalClusterLabelInput): string {
  const econ = ECONOMY_ENTRY_CN[cluster.economyEntry];
  const side = cluster.side === "ct" ? "CT " : "";
  return `${side}${econ} · ${formatTacticalClusterShortName(cluster)}`;
}
