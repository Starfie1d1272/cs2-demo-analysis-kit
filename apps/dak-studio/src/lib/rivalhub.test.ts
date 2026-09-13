import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordGet, recordGetAll, recordPut, recordDelete, credentialGet, credentialDelete, fetchMock } = vi.hoisted(() => ({
  recordGet: vi.fn(),
  recordGetAll: vi.fn(),
  recordPut: vi.fn(),
  recordDelete: vi.fn(),
  credentialGet: vi.fn(),
  credentialDelete: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("./storage", () => ({
  getStorage: () => ({
    records: () => ({ get: recordGet, getAll: recordGetAll, put: recordPut, delete: recordDelete }),
    blobs: () => ({}),
  }),
}));

import { normalizeBaseUrl, revokeRivalHubPairing, rivalHubEvidenceIdempotencyKey } from "./rivalhub";

describe("RivalHub pairing revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordGet.mockResolvedValue({
      baseUrl: "https://rivalhub.test",
      pairingId: "10000000-0000-4000-8000-000000000001",
      connectedAt: 1,
      lastSyncAt: 2,
    });
    credentialGet.mockResolvedValue("rh_dak_access-token");
    credentialDelete.mockResolvedValue(true);
    recordGetAll.mockResolvedValue([
      {
        id: "event:rivalhub:season-1",
        source: "rivalhub",
        rivalHub: { seasonId: "season-1", revision: "revision-1", lastSyncedAt: 3, stale: false },
      },
      { id: "event:local", source: "manual" },
    ]);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ revoked: true }), { status: 200 }));
    vi.stubGlobal("window", {
      pywebview: {
        api: {
          rivalhub_credential_get: credentialGet,
          rivalhub_credential_delete: credentialDelete,
        },
      },
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("revokes the current server pairing before clearing local credential and record", async () => {
    await revokeRivalHubPairing();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://rivalhub.test/api/integrations/dak/pairings/10000000-0000-4000-8000-000000000001",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer rh_dak_access-token" },
      }),
    );
    expect(credentialDelete).toHaveBeenCalledOnce();
    expect(recordDelete).toHaveBeenCalledWith("connection");
    expect(recordPut).toHaveBeenCalledWith("event:rivalhub:season-1", expect.objectContaining({ rivalHub: expect.objectContaining({ stale: true }) }));
  });

  it("only permits cleartext RivalHub URLs for loopback development hosts", () => {
    expect(normalizeBaseUrl("https://rivalhub.test/path")).toBe("https://rivalhub.test");
    expect(normalizeBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeBaseUrl("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(normalizeBaseUrl("http://[::1]:3000")).toBe("http://[::1]:3000");
    expect(() => normalizeBaseUrl("http://rivalhub.test")).toThrow(/HTTPS/);
  });

  it("derives idempotency from the stable exact Evidence payload", async () => {
    const evidence = {
      target: { matchMapId: "map-1", evidenceRevision: "revision-1" },
      source: { demoSha256: "a".repeat(64) },
    };
    const samePayloadWithDifferentKeyOrder = {
      source: { demoSha256: "a".repeat(64) },
      target: { evidenceRevision: "revision-1", matchMapId: "map-1" },
    };
    const changedPayload = {
      ...evidence,
      target: { ...evidence.target, evidenceRevision: "revision-2" },
    };

    const first = await rivalHubEvidenceIdempotencyKey("map-1", evidence);
    expect(await rivalHubEvidenceIdempotencyKey("map-1", samePayloadWithDifferentKeyOrder)).toBe(first);
    expect(await rivalHubEvidenceIdempotencyKey("map-1", changedPayload)).not.toBe(first);
    expect(first).toMatch(/^dak:map-1:[a-f0-9]{64}$/);
  });
});
