import JSZip from "jszip";
import type { DemoPackage } from "@cs2dak/contract";
import { manifestSchema } from "@cs2dak/contract";
import { normalizeDemoPackage, parsePackageJson } from "./normalize.js";

export type DemoManifest = ReturnType<typeof manifestSchema.parse>;

export type DemoPackageLoadProfile = "full" | "evidence";

export interface DemoPackageLoadOptions {
  /**
   * `full` preserves the normal workspace/replay package. `evidence` reads
   * only the manifest and fact files consumed by an evidence-oriented
   * matcher/producer; optional replay, shots, and duels are not read.
   */
  profile?: DemoPackageLoadProfile;
}

async function readManifest(bytes: ArrayBuffer | Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file("manifest.json");
  if (!file) throw new Error("Missing manifest.json in demo package");
  const rawManifest = parsePackageJson(await file.async("string")) as { schemaVersion?: string };
  const version = rawManifest?.schemaVersion ?? "unknown";
  if (!version.startsWith("cs2-demo-format/3.")) {
    throw new Error(
      `不支持的包版本 ${version}：本版本只读取 cs2-demo-format/3.x，请用 cs2df 重新导出该 demo`
    );
  }
  return { zip, manifest: manifestSchema.parse(rawManifest) };
}

/** 只读取并校验 manifest.json；不会解压 match、replay 或其它大文件。 */
export async function loadDemoManifestFromZip(bytes: ArrayBuffer | Uint8Array): Promise<DemoManifest> {
  return (await readManifest(bytes)).manifest;
}

export async function loadDemoPackageFromZip(
  bytes: ArrayBuffer | Uint8Array,
  options: DemoPackageLoadOptions = {},
): Promise<DemoPackage> {
  const { zip, manifest } = await readManifest(bytes);
  const readJson = async <T>(name: string): Promise<T> => {
    const file = zip.file(name);
    if (!file) {
      throw new Error(`Missing ${name} in demo package`);
    }
    return parsePackageJson(await file.async("string")) as T;
  };
  const files = manifest.files;

  const optional = async (name: string | undefined, enabled = true): Promise<unknown> =>
    enabled && name ? readJson<unknown>(name).catch(() => undefined) : undefined;
  const match = await readJson<unknown>(files.match);
  const players = await readJson<unknown>(files.players);
  const rounds = await readJson<unknown>(files.rounds);
  // cs2-demo-format/3.x requires these files. An empty, valid array means no
  // event occurred; a missing or invalid file is a malformed package, not [] .
  const playerEconomies = await readJson<unknown>(files.playerEconomies);
  const playerStats = await readJson<unknown>(files.playerStats);
  const kills = await readJson<unknown>(files.kills);
  const damages = await readJson<unknown>(files.damages);
  const blinds = await readJson<unknown>(files.blinds);
  const bombs = await readJson<unknown>(files.bombs);
  const grenades = await readJson<unknown>(files.grenades);
  const clutches = await readJson<unknown>(files.clutches);
  const evidenceProfile = options.profile === "evidence";
  const shots = await optional(files.shots, !evidenceProfile);
  const replay = await optional(files.replay, !evidenceProfile);
  const duels = await optional(files.duels, !evidenceProfile);

  return normalizeDemoPackage({
    manifest,
    match,
    players,
    rounds,
    playerEconomies,
    playerStats,
    kills,
    damages,
    blinds,
    bombs,
    grenades,
    clutches,
    shots,
    replay,
    duels
  });
}
