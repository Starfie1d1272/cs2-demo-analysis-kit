import JSZip from "jszip";
import type { DemoPackage } from "@cs2dak/contract";
import { manifestSchema } from "@cs2dak/contract";
import { normalizeDemoPackage, parsePackageJson } from "./normalize.js";

export async function loadDemoPackageFromZip(bytes: ArrayBuffer | Uint8Array): Promise<DemoPackage> {
  const zip = await JSZip.loadAsync(bytes);
  const readJson = async <T>(name: string): Promise<T> => {
    const file = zip.file(name);
    if (!file) {
      throw new Error(`Missing ${name} in demo package`);
    }
    return parsePackageJson(await file.async("string")) as T;
  };

  const rawManifest = await readJson<{ schemaVersion?: string }>("manifest.json");
  const version = rawManifest?.schemaVersion ?? "unknown";
  if (!version.startsWith("cs2-demo-format/3.")) {
    throw new Error(
      `不支持的包版本 ${version}：本版本只读取 cs2-demo-format/3.x，请用 cs2df 重新导出该 demo`
    );
  }
  const manifest = manifestSchema.parse(rawManifest);
  const files = manifest.files;

  const optional = async (name: string | undefined): Promise<unknown> =>
    name ? readJson<unknown>(name).catch(() => undefined) : undefined;
  const required = async (name: string, fallback: unknown): Promise<unknown> =>
    readJson<unknown>(name).catch(() => fallback);

  const match = await readJson<unknown>(files.match);
  const players = await readJson<unknown>(files.players);
  const rounds = await readJson<unknown>(files.rounds);
  const playerEconomies = await required(files.playerEconomies, []);
  const playerStats = await required(files.playerStats, []);
  const kills = await required(files.kills, []);
  const damages = await required(files.damages, []);
  const blinds = await required(files.blinds, []);
  const bombs = await required(files.bombs, []);
  const grenades = await required(files.grenades, []);
  const clutches = await required(files.clutches, []);
  const shots = await optional(files.shots);
  const replay = await optional(files.replay);
  const duels = await optional(files.duels);

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
