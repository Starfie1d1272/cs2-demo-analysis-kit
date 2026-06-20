import { eventPackageSchema, type EventPackage, type EventStage, type SeriesFormat, type SeriesVeto } from "@cs2dak/contract";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import JSZip from "jszip";

export type EventPreset = "round_robin" | "swiss" | "single_elim" | "double_elim" | "major";

export interface MakerMapResource {
  file: File;
  mapName: string;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
}

export interface MakerSeriesDraft {
  key: string;
  stage: string;
  round: number | null;
  entryRound: string | null;
  status: "scheduled" | "in_progress" | "finished" | "cancelled";
  format: SeriesFormat;
  teamAName: string;
  teamBName: string;
  scheduledAt: string;
  veto: SeriesVeto | null;
  resources: MakerMapResource[];
}

export interface EventMakerDraft {
  slug: string;
  name: string;
  kind: string;
  stages: EventStage[];
  teams: string[];
  series: MakerSeriesDraft[];
}

export function stagesForPreset(preset: EventPreset): EventStage[] {
  if (preset === "major") return [
    { key: "stage1", name: "阶段一", type: "swiss", teamCount: 16, advanceCount: 8, matchFormat: "bo1" },
    { key: "stage2", name: "阶段二", type: "swiss", teamCount: 16, advanceCount: 8, matchFormat: "bo1" },
    { key: "stage3", name: "阶段三", type: "swiss", teamCount: 16, advanceCount: 8, matchFormat: "bo3" },
    { key: "playoff", name: "淘汰赛", type: "single_elim", teamCount: 8, advanceCount: 1, matchFormat: "bo3", finalFormat: "bo5" },
  ];
  const labels: Record<Exclude<EventPreset, "major">, string> = {
    round_robin: "单循环",
    swiss: "瑞士轮",
    single_elim: "单败淘汰",
    double_elim: "双败淘汰",
  };
  return [{ key: "main", name: labels[preset], type: preset, teamCount: preset === "swiss" ? 16 : 8, advanceCount: preset === "round_robin" ? 4 : 1, matchFormat: "bo3" }];
}

export function normalizeTeamNames(raw: string): string[] {
  return [...new Set(raw.split(/[,\n]/).map((name) => name.trim()).filter(Boolean))];
}

export async function resourceFromFile(file: File): Promise<MakerMapResource> {
  const pkg = await loadDemoPackageFromZip(await file.arrayBuffer());
  if (!pkg.match.teamA.name || !pkg.match.teamB.name) throw new Error(`${file.name} 缺少队伍名称，不能自动归入系列赛`);
  return {
    file,
    mapName: pkg.match.mapName,
    teamAName: pkg.match.teamA.name,
    teamBName: pkg.match.teamB.name,
    scoreA: pkg.match.teamA.score,
    scoreB: pkg.match.teamB.score,
  };
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assetName(seriesKey: string, order: number, fileName: string): string {
  const safe = `${seriesKey}-${order}-${fileName}`.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return safe.toLowerCase().endsWith(".zip") ? safe : `${safe}.zip`;
}

export async function buildEventPackage(draft: EventMakerDraft): Promise<{ eventPackage: EventPackage; blob: Blob }> {
  const teamKeyByName = new Map(draft.teams.map((name, index) => [name, `team-${index + 1}`]));
  const series = await Promise.all(draft.series.map(async (row) => {
    if (row.resources.length > 5) throw new Error(`${row.key} 超过 5 张地图`);
    const maps = await Promise.all(row.resources.map(async (resource, index) => {
      const direct = resource.teamAName === row.teamAName && resource.teamBName === row.teamBName;
      const reversed = resource.teamAName === row.teamBName && resource.teamBName === row.teamAName;
      if (!direct && !reversed) throw new Error(`${row.key} 的 ${resource.file.name} 对阵与系列赛队伍不一致`);
      const name = assetName(row.key, index + 1, resource.file.name);
      return {
        order: index + 1,
        mapName: resource.mapName,
        pickedBy: row.veto?.maps.picked.find((map) => map.mapName === resource.mapName)?.teamKey ?? null,
        scoreA: direct ? resource.scoreA : resource.scoreB,
        scoreB: direct ? resource.scoreB : resource.scoreA,
        demoHint: { fileName: name, sha256: await sha256(resource.file) },
      };
    }));
    return {
      key: row.key,
      stage: row.stage || null,
      round: row.round,
      entryRound: row.entryRound,
      status: row.status,
      format: row.format,
      teamAKey: teamKeyByName.get(row.teamAName) ?? "",
      teamBKey: teamKeyByName.get(row.teamBName) ?? "",
      scoreA: row.status === "finished" ? maps.filter((map) => map.scoreA > map.scoreB).length : null,
      scoreB: row.status === "finished" ? maps.filter((map) => map.scoreB > map.scoreA).length : null,
      scheduledAt: row.scheduledAt ? new Date(row.scheduledAt).toISOString() : null,
      veto: row.veto,
      maps,
    };
  }));
  const eventPackage = eventPackageSchema.parse({
    version: "cs2-demo-analysis-kit/event-package-1.0",
    source: "manual",
    exportedAt: new Date().toISOString(),
    event: { slug: draft.slug, name: draft.name, kind: draft.kind, stages: draft.stages },
    teams: draft.teams.map((name) => ({ key: teamKeyByName.get(name), name, players: [] })),
    series,
  });
  const archive = new JSZip();
  archive.file("event-package.json", `${JSON.stringify(eventPackage, null, 2)}\n`);
  for (const row of draft.series) {
    for (const [index, resource] of row.resources.entries()) {
      archive.file(`maps/${assetName(row.key, index + 1, resource.file.name)}`, await resource.file.arrayBuffer());
    }
  }
  return { eventPackage, blob: await archive.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } }) };
}
