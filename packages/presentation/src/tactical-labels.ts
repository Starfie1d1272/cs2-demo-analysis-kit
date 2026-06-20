import { DEFAULT_POSITIONS } from "@cs2dak/maps";

export interface TacticalClusterLabelInput {
  mapName: string;
  side: "t" | "ct";
  defaultsBasis: string;
  targetSite: "a" | "b" | null;
}

export function formatTacticalClusterName(cluster: TacticalClusterLabelInput): string {
  const anchors = DEFAULT_POSITIONS[cluster.mapName]?.[cluster.side].anchors ?? {};
  const parts = cluster.defaultsBasis
    .split("|")
    .filter((segment) => Boolean(segment) && segment !== "-")
    .map((segment) => {
      const [id, count] = segment.split(":");
      return `${anchors[id!]?.name ?? id}×${count ?? "1"}`;
    });
  const site = cluster.targetSite ? cluster.targetSite.toUpperCase() : "";
  const heading = cluster.side === "ct" ? "防守开局" : site ? `${site} 进点` : "进攻开局";
  if (parts.length === 0) return heading;
  return `${heading ? `${heading} ` : ""}· ${parts.join(" / ")}`;
}
