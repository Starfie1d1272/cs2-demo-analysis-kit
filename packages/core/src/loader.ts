import JSZip from "jszip";
import type { DemoPackage } from "@cs2dak/contract";
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

  const manifest = await readJson<unknown>("manifest.json");
  const match = await readJson<unknown>("match.json");
  const players = await readJson<unknown>("players.json");
  const rounds = await readJson<unknown>("rounds.json");
  const playerEconomies = await readJson<unknown>("player-economies.json").catch(() => []);
  const playerStats = await readJson<unknown>("player-stats.json").catch(() => []);
  const kills = await readJson<unknown>("kills.json").catch(() => []);
  const damages = await readJson<unknown>("damages.json").catch(() => []);
  const blinds = await readJson<unknown>("blinds.json").catch(() => []);
  const bombs = await readJson<unknown>("bombs.json").catch(() => []);
  const grenades = await readJson<unknown>("grenades.json").catch(() => []);
  const clutches = await readJson<unknown>("clutches.json").catch(() => []);
  const shots = await readJson<unknown>("shots.json").catch(() => undefined);
  const positions1s = await readJson<unknown>("positions-1s.json").catch(() => undefined);
  const replay = await readJson<unknown>("replay.json").catch(() => undefined);

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
    positions1s,
    replay
  });
}
