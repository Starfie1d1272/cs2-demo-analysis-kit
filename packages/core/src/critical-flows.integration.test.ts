import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { beforeAll, expect, it } from "vitest";
import { analyzeDemoPackage, buildPlayerRoundPerformanceFacts, deriveRRSignals, loadDemoPackageFromZip } from "./index.js";
import { extractMatchMapIntelligenceFacts } from "./map-intelligence/index.js";

let bytes: Uint8Array;
beforeAll(async () => {
  bytes = await readFile("fixtures/input/cologne-major-2026-stage3-smoke-de_nuke.zip");
});
const archive = () => JSZip.loadAsync(bytes);
const encoded = (zip: JSZip) => zip.generateAsync({ type: "uint8array" });

it("imports a real cs2df ZIP with exact identity, event counts and canonical analysis", async () => {
  const pkg = await loadDemoPackageFromZip(bytes);
  expect(pkg.manifest.exporter).toMatchObject({ name: "cs2df", version: "3.1.0" });
  expect(pkg.manifest.demo?.sourceFileName).toBe("aurora-vs-9z-m1-nuke.dem");
  expect(pkg.match).toMatchObject({ mapName: "de_nuke", teamA: { name: "9z", score: 1 }, teamB: { name: "Aurora Gaming", score: 13 } });
  expect(pkg.players).toHaveLength(10);
  expect(pkg.players[0]?.steamId64).toBe("76561198067722198");
  expect(pkg.rounds).toHaveLength(14);
  expect(pkg.kills).toHaveLength(94);
  expect(pkg.damages).toHaveLength(352);
  expect(pkg.bombs).toHaveLength(41);
  expect(pkg.grenades).toHaveLength(212);
  expect(pkg.replay?.rounds.length).toBeGreaterThan(0);
  expect(pkg.shots).toBeDefined();
  expect(pkg.duels).toBeDefined();
  const bundle = analyzeDemoPackage(pkg);
  expect(bundle.qa).toMatchObject({ ok: true, summary: { issueCount: 0 } });
  expect(bundle.scoreboard).toHaveLength(10);
  expect(bundle.scoreboard.find(row => row.steamId64 === "76561198067722198"))
    .toMatchObject({ kills: 10, deaths: 12 });
  expect(bundle.playerRoundFacts).toHaveLength(140);
  expect(bundle.provenance.sourceDemoHash).toBe(pkg.manifest.demo?.hash);
});

it("rejects an absent required event stream rather than manufacturing an empty one", async () => {
  const zip = await archive();
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  zip.remove(manifest.files.kills);
  await expect(loadDemoPackageFromZip(await encoded(zip))).rejects.toThrow("Missing");
});

it("rejects malformed required JSON and incompatible package versions", async () => {
  const zip = await archive();
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  zip.file(manifest.files.kills, "{broken json");
  await expect(loadDemoPackageFromZip(await encoded(zip))).rejects.toThrow();
  zip.file("manifest.json", JSON.stringify({ ...manifest, schemaVersion: "cs2-demo-format/2.0" }));
  await expect(loadDemoPackageFromZip(await encoded(zip))).rejects.toThrow("不支持的包版本");
});

it("downgrades optional replay failures while preserving required facts", async () => {
  const zip = await archive();
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  zip.remove(manifest.files.replay);
  const absent = await loadDemoPackageFromZip(await encoded(zip));
  expect(absent.replay).toBeUndefined();
  zip.file(manifest.files.replay, "{broken json");
  const malformed = await loadDemoPackageFromZip(await encoded(zip), {
    onDiagnostic: () => { throw new Error("diagnostic sink unavailable"); },
  });
  expect(malformed).toEqual(absent);
  expect(malformed.kills).toHaveLength(94);
});

it("does not credit a teamkill as an enemy opening", async () => {
  const pkg = await loadDemoPackageFromZip(bytes);
  const a = pkg.players.findIndex(player => player.teamKey === "teamA");
  const b = pkg.players.findIndex((player, index) => player.teamKey === "teamA" && index !== a);
  const enemy = pkg.players.findIndex(player => player.teamKey === "teamB");
  const round = pkg.rounds[0]!;
  const source = { ...pkg, rounds: [round], damages: [], blinds: [], grenades: [], bombs: [], clutches: [], playerEconomies: [], replay: undefined, shots: undefined, duels: undefined, kills: [
    { ...pkg.kills[0]!, roundNumber: round.roundNumber, tick: round.freezeEndTick + 1, killerIndex: a, victimIndex: b },
    { ...pkg.kills[0]!, roundNumber: round.roundNumber, tick: round.freezeEndTick + 2, killerIndex: enemy, victimIndex: a },
  ] };
  const facts = buildPlayerRoundPerformanceFacts(source);
  expect(facts.playerRounds.find(row => row.openingDuel === "won")?.steamId64).toBe(pkg.players[enemy]!.steamId64);
  expect(facts.playerRounds.filter(row => row.openingDuel !== "none")).toHaveLength(2);
});

it("preserves null context buckets when an optional scoring source is absent", async () => {
  const pkg = await loadDemoPackageFromZip(bytes);
  expect(deriveRRSignals({ ...pkg, playerEconomies: [] })[0]?.combat.killsByBuyDelta).toBeNull();
  expect(deriveRRSignals({ ...pkg, rounds: [] })[0]?.combat.killsByManState).toBeNull();
});

it("reusing the same Ancient package and real nav facade cannot mutate prior CT rotation facts", async () => {
  const ancient = await readFile("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip");
  const pkg = await loadDemoPackageFromZip(ancient);
  const first = extractMatchMapIntelligenceFacts(pkg, { matchId: "ancient" });
  expect(first.teamShapeRounds.every(row => row.availability.nav === "available")).toBe(true);
  expect(first.ctRotationRounds).toHaveLength(pkg.rounds.length * 5);
  expect(first.ctRotationRounds.some(row => row.initialResponsibilityResolved)).toBe(true);
  const snapshot = structuredClone(first.ctRotationRounds);
  const repeated = extractMatchMapIntelligenceFacts(pkg, { matchId: "ancient" });
  expect(repeated.ctRotationRounds).toEqual(snapshot);
});
