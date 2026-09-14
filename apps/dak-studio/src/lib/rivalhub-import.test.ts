import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import type { DemoPackage } from "@cs2dak/contract";
import type { StudioDemoEntry } from "./library";
import type { RivalHubRemoteMap, RivalHubRemoteTeam } from "./rivalhub-contract";
import { rivalHubBatchCompletionMessage, runRivalHubBatch, type RivalHubBatchCallbacks, type RivalHubMatchCandidate } from "./rivalhub-import";
import { fileFromNativePath, nativePathForFile } from "./dem";

const demoSha256 = "a".repeat(64);
const fakePackage = {} as DemoPackage;

function remoteMap(id: string, options: { demoSha256?: string | null; demoStatus?: RivalHubRemoteMap["demoStatus"] } = {}): RivalHubRemoteMap {
  return {
    id,
    order: 1,
    mapName: "de_ancient",
    scoreA: 13,
    scoreB: 10,
    completedAt: "2026-09-13T00:00:00.000Z",
    evidenceRevision: "revision-1",
    target: {
      seasonId: "season",
      stageKey: "stage",
      stageRunId: null,
      matchId: "match",
      matchMapId: id,
      mapOrder: 1,
      entryAId: "entry-a",
      entryBId: "entry-b",
      expectedMapName: "de_ancient",
      evidenceRevision: "revision-1",
    },
    lineup: [],
    demoStatus: options.demoStatus ?? "finished_pending_demo",
    demoIssues: [],
    importId: null,
    demoSha256: options.demoSha256 ?? null,
  } as RivalHubRemoteMap;
}

function candidate(id: string, options: { demoSha256?: string | null; demoStatus?: RivalHubRemoteMap["demoStatus"] } = {}, eventTeams: RivalHubRemoteTeam[] = []): RivalHubMatchCandidate {
  return {
    series: { id: `series-${id}`, stageKey: "stage", teamAName: "A", teamBName: "B", completedAt: "2026-09-13T00:00:00.000Z", status: "finished" },
    map: remoteMap(id, options),
    eventTeams,
  };
}

function localEntry(fileName: string, duplicate = false): StudioDemoEntry {
  return {
    id: `entry:${fileName}`,
    fileName,
    importedAt: 1,
    demoSha256,
    tags: [],
    sourceDemPath: null,
    meta: {
      mapName: "de_ancient",
      teamAName: "A",
      teamBName: "B",
      teamAScore: 13,
      teamBScore: 10,
      roundCount: 23,
      durationSeconds: 1,
      playerCount: 10,
      hasReplay: true,
      source: "test",
      serverName: null,
      matchDate: null,
    },
    ...(duplicate ? { sizeBytes: 1 } : {}),
  };
}

type BatchDependencies = NonNullable<RivalHubBatchCallbacks["dependencies"]>;
type BatchImport = NonNullable<BatchDependencies["importDemo"]>;
type BatchMatch = NonNullable<BatchDependencies["matchMap"]>;
type BatchSubmit = NonNullable<BatchDependencies["submit"]>;

function baseDependencies(options: {
  importDemo?: BatchImport;
  matchMap?: BatchMatch;
  submit?: BatchSubmit;
  resolveParticipantsFromEventRoster?: NonNullable<BatchDependencies["resolveParticipantsFromEventRoster"]>;
} = {}) {
  const importDemo = options.importDemo ?? vi.fn(async (file: File) => ({ entry: localEntry(file.name), duplicate: false, replaced: false }));
  const matchMap = options.matchMap ?? vi.fn((): ReturnType<BatchMatch> => ({ status: "matched", candidate: candidate("target"), mode: "review_fallback" }));
  const submit = options.submit ?? vi.fn(async (): Promise<Awaited<ReturnType<BatchSubmit>>> => ({ status: "synced", importId: null, matchMapId: "target", demoSha256, issues: [] }));
  const loadPackage = vi.fn(async () => fakePackage);
  const linkMap = vi.fn(async () => undefined);
  const idempotencyKey = vi.fn(async () => "dak:test:key");
  const resolveParticipants = vi.fn(() => ({ identities: new Map(), orientation: "direct" as const }));
  const resolveParticipantsFromEventRoster = options.resolveParticipantsFromEventRoster ?? vi.fn(() => ({ identities: new Map(), orientation: "direct" as const }));
  const resolveParticipantsForReview = vi.fn(() => ({ identities: new Map(), orientation: "direct" as const }));
  const buildEvidence = vi.fn(() => ({ contract: "test" }));
  return { importDemo, matchMap, submit, loadPackage, linkMap, idempotencyKey, resolveParticipants, resolveParticipantsFromEventRoster, resolveParticipantsForReview, buildEvidence };
}

function runWith(
  files: File[],
  dependencies: ReturnType<typeof baseDependencies>,
  contextCandidates: RivalHubMatchCandidate[] = [candidate("target")],
  extra: Partial<Parameters<typeof runRivalHubBatch>[2]> = {},
) {
  return runRivalHubBatch(files, { scope: "event", eventId: "event-1", candidates: contextCandidates }, {
    exportDem: vi.fn(async (file: File) => ({ file: new File(["zip"], file.name.replace(/\.dem$/i, ".zip"), { type: "application/zip" }), sourceDemPath: "/tmp/source.dem" })),
    dependencies,
    ...extra,
  });
}

describe("RivalHub serial batch import", () => {
  it("routes a path-backed native selection through the existing export owner", async () => {
    const dependencies = baseDependencies();
    const exportDem = vi.fn(async (file: File) => ({
      file: new File(["zip"], "native.zip", { type: "application/zip" }),
      sourceDemPath: null,
    }));
    const nativeFile = fileFromNativePath("/demos/native.zip");

    await runRivalHubBatch([nativeFile], { scope: "event", eventId: "event-1", candidates: [candidate("target")] }, {
      exportDem,
      dependencies,
    });

    expect(nativePathForFile(nativeFile)).toBe("/demos/native.zip");
    expect(exportDem).toHaveBeenCalledOnce();
    expect(exportDem.mock.calls[0]?.[0]).toBe(nativeFile);
  });

  it("processes files in order and keeps local duplicate non-terminal", async () => {
    const phases: string[] = [];
    const dependencies = baseDependencies({
      importDemo: vi.fn(async (file: File) => ({ entry: localEntry(file.name, file.name === "2.zip"), duplicate: file.name === "2.zip", replaced: false })),
    });
    const files = [new File(["dem"], "1.dem"), ...[2, 3, 4, 5].map((n) => new File(["zip"], `${n}.zip`))];
    const session = await runWith(files, dependencies, [candidate("target")], {
      onUpdate: (next) => {
        const item = next.items[next.currentIndex];
        if (item) phases.push(`${item.fileName}:${item.phase}`);
      },
    });

    expect(session.status).toBe("completed");
    expect(session.counts.synced).toBe(5);
    expect(session.counts.reusedLocal).toBe(1);
    expect(dependencies.importDemo).toHaveBeenCalledTimes(5);
    expect(dependencies.loadPackage).toHaveBeenCalledTimes(5);
    expect(dependencies.linkMap).toHaveBeenCalledTimes(5);
    expect(phases).toEqual(expect.arrayContaining(["1.dem:exporting", "1.dem:importing", "1.dem:matching", "1.dem:building_evidence", "1.dem:submitting", "1.dem:synced", "2.zip:synced"]));
  });

  it("continues after one item fails", async () => {
    const importDemo = vi.fn(async (file: File) => {
      if (file.name === "2.zip") throw new Error("bad zip");
      return { entry: localEntry(file.name), duplicate: false, replaced: false };
    });
    const dependencies = baseDependencies({ importDemo });
    const session = await runWith([1, 2, 3, 4, 5].map((n) => new File(["zip"], `${n}.zip`)), dependencies);

    expect(session.counts.failed).toBe(1);
    expect(session.counts.synced).toBe(4);
    expect(importDemo).toHaveBeenCalledTimes(5);
    expect(dependencies.submit).toHaveBeenCalledTimes(4);
  });

  it("marks an already synced raw hash without loading or submitting evidence", async () => {
    const synced = candidate("synced", { demoSha256, demoStatus: "synced" });
    const dependencies = baseDependencies();
    const session = await runWith([new File(["zip"], "synced.zip")], dependencies, [synced]);

    expect(session.items[0]).toMatchObject({ phase: "already_synced", matchedMapId: "synced" });
    expect(dependencies.loadPackage).not.toHaveBeenCalled();
    expect(dependencies.submit).not.toHaveBeenCalled();
    expect(dependencies.linkMap).toHaveBeenCalledOnce();
  });

  it("keeps a unique target reviewable when MatchRoster is missing", async () => {
    const dependencies = baseDependencies({
      submit: vi.fn(async (): Promise<Awaited<ReturnType<BatchSubmit>>> => ({
        status: "needs_attention",
        importId: null,
        matchMapId: "target",
        demoSha256,
        issues: [{ code: "ROSTER_NOT_COMPLETE", message: "缺少本场 roster" }],
      })),
    });
    dependencies.resolveParticipants = vi.fn(() => { throw new Error("缺少本场 MatchRoster"); });
    dependencies.resolveParticipantsForReview = vi.fn(() => ({ identities: new Map(), orientation: "direct" as const }));

    const session = await runWith([new File(["zip"], "missing-roster.zip")], dependencies);

    expect(session.items[0]).toMatchObject({ phase: "needs_attention", matchedMapId: "target" });
    expect(dependencies.submit).toHaveBeenCalledOnce();
  });

  it("records a server submission error as failed and never links locally", async () => {
    const dependencies = baseDependencies({
      submit: vi.fn(async () => { throw new Error("server unavailable"); }),
    });

    const session = await runWith([new File(["zip"], "server-error.zip")], dependencies);

    expect(session.items[0]).toMatchObject({ phase: "failed", detail: "server unavailable" });
    expect(dependencies.submit).toHaveBeenCalledOnce();
    expect(dependencies.linkMap).not.toHaveBeenCalled();
    expect(rivalHubBatchCompletionMessage(session)).toContain("失败 1");
  });

  it("does not report success or create a local link when matching stops before submit", async () => {
    const dependencies = baseDependencies({
      matchMap: vi.fn(() => ({ status: "not_found" as const, reason: "no official target" })),
    });

    const session = await runWith([new File(["zip"], "not-found.zip")], dependencies);

    expect(session.items[0]).toMatchObject({ phase: "failed", detail: "no official target" });
    expect(dependencies.submit).not.toHaveBeenCalled();
    expect(dependencies.linkMap).not.toHaveBeenCalled();
    expect(session.counts.synced).toBe(0);
  });

  it("links only after the server returns its terminal needs_attention result", async () => {
    const order: string[] = [];
    const dependencies = baseDependencies({
      submit: vi.fn(async (): Promise<Awaited<ReturnType<BatchSubmit>>> => {
        order.push("submit");
        return {
          status: "needs_attention",
          importId: null,
          matchMapId: "target",
          demoSha256,
          issues: [{ code: "REVIEW", message: "人工复核" }],
        };
      }),
    });
    dependencies.linkMap = vi.fn(async () => { order.push("link"); });

    const session = await runWith([new File(["zip"], "needs-attention.zip")], dependencies);

    expect(session.items[0]).toMatchObject({ phase: "needs_attention", detail: "人工复核" });
    expect(order).toEqual(["submit", "link"]);
  });

  it("resumes after a target picker without repeating export or local import", async () => {
    const first = candidate("target-a");
    const second = candidate("target-b");
    const matchMap = vi.fn(() => ({ status: "needs_target" as const, candidates: [first, second], reason: "ambiguous" }));
    const dependencies = baseDependencies({ matchMap });
    const exportDem = vi.fn(async (file: File) => ({ file: new File(["zip"], "target.zip", { type: "application/zip" }), sourceDemPath: "/tmp/target.dem" }));
    const resolveTarget = vi.fn(async () => "target-b");
    const session = await runRivalHubBatch([new File(["dem"], "target.dem")], { scope: "event", eventId: "event-1", candidates: [first, second] }, {
      exportDem,
      resolveTarget,
      dependencies,
    });

    expect(session.items[0]).toMatchObject({ phase: "synced", matchedMapId: "target-b" });
    expect(exportDem).toHaveBeenCalledOnce();
    expect(dependencies.importDemo).toHaveBeenCalledOnce();
    expect(dependencies.loadPackage).toHaveBeenCalledOnce();
    expect(resolveTarget).toHaveBeenCalledOnce();
  });

  it("closes a skipped target as a stable terminal item and advances the session", async () => {
    const first = candidate("target-a");
    const second = candidate("target-b");
    const matchMap = vi.fn(() => matchMap.mock.calls.length === 1
      ? { status: "needs_target" as const, candidates: [first, second], reason: "ambiguous" }
      : { status: "matched" as const, candidate: second, mode: "review_fallback" as const });
    const dependencies = baseDependencies({ matchMap });
    const awaiting: Array<string | null> = [];
    const session = await runWith([new File(["zip"], "first.zip"), new File(["zip"], "second.zip")], dependencies, [first, second], {
      resolveTarget: vi.fn(async () => null),
      onUpdate: (next) => awaiting.push(next.awaitingTargetItemId),
    });

    expect(session.items[0]).toMatchObject({ phase: "skipped", targetCandidates: undefined, detail: "用户跳过目标，保留待后续处理" });
    expect(session.items[1]).toMatchObject({ phase: "synced", matchedMapId: "target-b" });
    expect(session.counts).toMatchObject({ skipped: 1, needsTarget: 0, synced: 1 });
    expect(awaiting).toContain("item-0-first.zip");
    expect(awaiting.at(-1)).toBeNull();
  });

  it("uses EventRoster identities and orientation for evidence while MatchRoster stays validation-only", async () => {
    const eventTeams = [{ key: "event-team", name: "Canonical", players: [] }] as RivalHubRemoteTeam[];
    const target = candidate("event-roster-target", {}, eventTeams);
    const identities = new Map([["steam", { steamId64: "steam", nameSnapshot: "Player", userId: "user", eventRosterMemberId: "member", entryId: "entry-b" }]]);
    const resolveParticipantsFromEventRoster = vi.fn(() => ({ identities, orientation: "reversed" as const }));
    const matchMap = vi.fn(() => ({ status: "matched" as const, candidate: target, mode: "event_roster" as const }));
    const dependencies = baseDependencies({ matchMap, resolveParticipantsFromEventRoster });

    await runWith([new File(["zip"], "event-roster.zip")], dependencies, [target]);

    expect(resolveParticipantsFromEventRoster).toHaveBeenCalledWith(fakePackage, expect.objectContaining({ matchMapId: "event-roster-target" }), eventTeams);
    expect(dependencies.resolveParticipants).not.toHaveBeenCalled();
    expect(dependencies.buildEvidence).toHaveBeenCalledWith(fakePackage, expect.objectContaining({ matchMapId: "event-roster-target" }), identities, "reversed");
  });

  it("stops dispatching after the current item", async () => {
    let stop = false;
    const dependencies = baseDependencies({
      submit: vi.fn(async () => { stop = true; return { status: "synced" as const, importId: null, matchMapId: "target", demoSha256, issues: [] as [] }; }),
    });
    const states: string[] = [];
    const session = await runWith([1, 2, 3].map((n) => new File(["zip"], `${n}.zip`)), dependencies, [candidate("target")], {
      shouldStop: () => stop,
      onUpdate: (next) => states.push(next.status),
    });

    expect(dependencies.importDemo).toHaveBeenCalledOnce();
    expect(session.items[0]?.phase).toBe("synced");
    expect(session.items.slice(1).every((item) => item.phase === "skipped")).toBe(true);
    expect(states).toContain("stopping");
    expect(session.status).toBe("completed");
  });
});
