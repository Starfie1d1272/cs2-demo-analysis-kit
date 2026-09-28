import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import { rivalHubEventsResponseSchema, type RivalHubEventsResponse } from "./contract";
import { uploadDemo, type UploadDependencies, type UploadUpdate } from "./pipeline";
import { createRivalHubClient, rivalHubEvidenceIdempotencyKey } from "./client";

let zip: Uint8Array;
let fixture: RivalHubEventsResponse;
let hash: string;
beforeAll(async () => {
  zip = await readFile("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip");
  const pkg = await loadDemoPackageFromZip(zip, { profile: "evidence" });
  hash = pkg.manifest.demo!.hash!;
  fixture = rivalHubEventsResponseSchema.parse(JSON.parse(await readFile("fixtures/contracts/rivalhub-dak-events-1.json", "utf8")));
  const event = fixture.events[0]!;
  const map = event.series[0]!.maps[0]!;
  map.demoStatus = "finished_pending_demo"; map.demoSha256 = null;
  map.mapName = pkg.match.mapName; map.target.expectedMapName = pkg.match.mapName;
  map.scoreA = pkg.match.teamA.score; map.scoreB = pkg.match.teamB.score;
  const players = event.teams.flatMap(team => team.players);
  pkg.players.forEach((player, i) => {
    players[i]!.steamId64 = player.steamId64;
    players[i]!.entryId = player.teamKey === "teamA" ? map.target.entryAId : map.target.entryBId;
  });
  map.lineup = structuredClone(players);
});
function setup() {
  const data = structuredClone(fixture);
  const updates: UploadUpdate[] = [];
  const requests: Array<{ path: string; body: unknown; key?: string }> = [];
  let attention = false;
  const client = createRivalHubClient(async <T,>(path: string, _method: string, body?: unknown, key?: string): Promise<T> => {
    if (path === "/events") return structuredClone(data) as T;
    requests.push({ path, body, key });
    const target = (body as { target: { matchMapId: string } }).target;
    const map = data.events[0]!.series[0]!.maps.find(m => m.id === target.matchMapId)!;
    map.demoStatus = attention ? "needs_attention" : "synced"; map.demoSha256 = hash;
    map.demoIssues = attention ? [{ code: "ROSTER_MISMATCH", message: "请核对选手名单" }] : [];
    return { status: map.demoStatus, importId: "import", matchMapId: map.id, demoSha256: hash, issues: map.demoIssues } as T;
  });
  const deps: UploadDependencies = {
    hash: vi.fn(async () => hash), exportZip: vi.fn(async () => zip), cleanup: vi.fn(async () => {}),
    events: client.events, submit: client.submit, choose: vi.fn(async c => c[0]!), update: u => updates.push(u),
  };
  return { data, deps, updates, requests, attention: () => { attention = true; } };
}
describe("standalone upload pipeline with real Demo + events contract", () => {
  it("matches and submits Evidence V1 through the HTTP client; second upload skips export", async () => {
    const s = setup(); await uploadDemo(s.deps);
    expect(s.requests[0]!.path).toBe("/evidence");
    expect(s.requests[0]!.body).toMatchObject({ contract: { contractVersion: "rivalhub-demo-evidence/1" }, source: { demoSha256: hash } });
    expect(s.requests[0]!.key).toBe(await rivalHubEvidenceIdempotencyKey(s.data.events[0]!.series[0]!.maps[0]!.id, s.requests[0]!.body));
    expect(s.updates.at(-1)?.phase).toBe("done");
    await uploadDemo(s.deps);
    expect(s.deps.exportZip).toHaveBeenCalledTimes(1); expect(s.requests).toHaveLength(1);
    expect(s.deps.cleanup).toHaveBeenCalledTimes(2);
  });
  it("pauses for a user-selected ambiguous target", async () => {
    const s = setup(); const maps = s.data.events[0]!.series[0]!.maps;
    const second = structuredClone(maps[0]!); second.id = "10000000-0000-4000-8000-000000000099"; second.target.matchMapId = second.id;
    maps.push(second); s.deps.choose = vi.fn(async c => c[1]!);
    await uploadDemo(s.deps);
    expect(s.deps.choose).toHaveBeenCalledOnce();
    expect(s.requests[0]!.body).toMatchObject({ target: { matchMapId: second.id } });
  });
  it("falls back from partial EventRoster and surfaces server needs_attention", async () => {
    const s = setup(); s.data.events[0]!.teams = []; s.attention(); await uploadDemo(s.deps);
    expect(s.updates.at(-1)).toMatchObject({ phase: "needs_attention", message: "ROSTER_MISMATCH：请核对选手名单" });
  });
  it("cleans up after a failed POST; retry uses identical idempotency key", async () => {
    const s = setup(); const submit = s.deps.submit; let firstKey = "";
    s.deps.submit = async (_body, key) => { firstKey = key; throw new Error("NETWORK"); };
    await expect(uploadDemo(s.deps)).rejects.toThrow("NETWORK");
    expect(s.deps.cleanup).toHaveBeenCalledOnce();
    s.deps.submit = submit; await uploadDemo(s.deps); expect(s.requests[0]!.key).toBe(firstKey);
  });
  it("rejects changed raw files before upload", async () => {
    const s = setup(); s.deps.hash = async () => "0".repeat(64);
    await expect(uploadDemo(s.deps)).rejects.toThrow("DEMO_CHANGED");
    expect(s.requests).toHaveLength(0); expect(s.deps.cleanup).toHaveBeenCalledOnce();
  });
});
