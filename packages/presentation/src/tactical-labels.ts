import { DEFAULT_POSITIONS } from "@cs2dak/maps";

const BUCKET_CN: Record<string, string> = { rush: "提速", fast: "速爆", mid: "默认", late: "后打" };

export interface TacticalClusterLabelInput {
  mapName: string;
  side: "t" | "ct";
  defaultsBasis: string;
  executeBucket: "rush" | "fast" | "mid" | "late" | null;
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
  const bucket = cluster.executeBucket ? BUCKET_CN[cluster.executeBucket] ?? cluster.executeBucket : "";
  const site = cluster.targetSite ? cluster.targetSite.toUpperCase() : "";
  const heading = [bucket, site].filter(Boolean).join(" ");
  if (parts.length === 0) return heading;
  return `${heading ? `${heading} ` : ""}· ${parts.join(" / ")}`;
}
