import JSZip from "jszip";
import type { DemoPackage } from "@cs2dak/contract";
import { manifestSchema } from "@cs2dak/contract";
import { normalizeDemoPackage, parsePackageJson } from "./normalize.js";

export type DemoManifest = ReturnType<typeof manifestSchema.parse>;

export type DemoPackageLoadProfile = "full" | "evidence";

/** Runtime observation only; never part of DemoPackage or deterministic evidence. */
export interface OptionalInputDiagnostic {
  code: "OPTIONAL_INPUT_MISSING" | "OPTIONAL_INPUT_SKIPPED" | "OPTIONAL_INPUT_INVALID" | "OPTIONAL_INPUT_READ_FAILED";
  stage: string;
  message: string;
  cause?: unknown;
}

export interface DemoPackageLoadOptions {
  /** The consumer sanitizes causes before logging; observer failures cannot affect parsing. */
  onDiagnostic?: (diagnostic: OptionalInputDiagnostic) => void;
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

  const optional = async (slot: "shots" | "replay" | "duels", name: string | undefined, enabled = true): Promise<unknown> => {
    const emit = (code: OptionalInputDiagnostic["code"], message: string, phase: string, cause?: unknown) => {
      try { options.onDiagnostic?.({ code, message, stage: `package.optional.${slot}.${phase}`, ...(cause === undefined ? {} : { cause }) }); }
      catch { /* Diagnostics must not replace a valid optional downgrade. */ }
    };
    if (!enabled) { emit("OPTIONAL_INPUT_SKIPPED", "Evidence profile intentionally skips this optional stream", "skip"); return undefined; }
    const file = name ? zip.file(name) : null;
    if (!file) { emit("OPTIONAL_INPUT_MISSING", "Optional stream is absent", "read"); return undefined; }
    let content: string;
    try { content = await file.async("string"); }
    catch (error) { emit("OPTIONAL_INPUT_READ_FAILED", "Optional stream could not be read", "read", error); return undefined; }
    try { return parsePackageJson(content); }
    catch (error) { emit("OPTIONAL_INPUT_INVALID", "Optional stream contains invalid JSON", "parse", error); return undefined; }
  };
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
  const shots = await optional("shots", files.shots, !evidenceProfile);
  const replay = await optional("replay", files.replay, !evidenceProfile);
  const duels = await optional("duels", files.duels, !evidenceProfile);

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
