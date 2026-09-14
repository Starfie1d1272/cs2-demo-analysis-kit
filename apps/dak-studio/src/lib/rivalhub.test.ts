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

import { connectRivalHub, normalizeBaseUrl, revokeRivalHubPairing, rivalHubEvidenceIdempotencyKey } from "./rivalhub";

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

describe("RivalHub browser pairing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function startResponse() {
    return {
      pairingId: "10000000-0000-4000-8000-000000000001",
      pollToken: "poll-token",
      authorizeUrl: "https://rivalhub.test/authorize?pairing=1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  it("preopens during the click call and navigates the same window after pairing/start", async () => {
    const order: string[] = [];
    const popup = {
      closed: false,
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    const open = vi.fn((url: string) => {
      order.push(`open:${url}`);
      return popup;
    });
    vi.stubGlobal("window", { open });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      order.push(`fetch:${url}`);
      return url.endsWith("/pairing/start")
        ? new Response(JSON.stringify(startResponse()), { status: 200 })
        : new Response(JSON.stringify({ status: "authorized", accessToken: "browser-token", expiresAt: startResponse().expiresAt }), { status: 200 });
    }));

    const pending = connectRivalHub("https://rivalhub.test");
    expect(order[0]).toBe("open:about:blank");
    const connected = await pending;

    expect(connected.status).toBe("connected");
    expect(popup.location.replace).toHaveBeenCalledWith(startResponse().authorizeUrl);
    expect(order[1]).toBe("fetch:https://rivalhub.test/api/integrations/dak/pairing/start");
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does not treat a null noopener return as proof that the preopened window failed", async () => {
    const open = vi.fn(() => null);
    vi.stubGlobal("window", { open });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/pairing/start")
      ? new Response(JSON.stringify(startResponse()), { status: 200 })
      : new Response(JSON.stringify({ status: "authorized", accessToken: "browser-token", expiresAt: startResponse().expiresAt }), { status: 200 })));

    await expect(connectRivalHub("https://rivalhub.test")).resolves.toMatchObject({ status: "connected" });
    expect(open).toHaveBeenNthCalledWith(1, "about:blank", "dak-rivalhub-pairing", "noopener,noreferrer");
    expect(open).toHaveBeenNthCalledWith(2, startResponse().authorizeUrl, "dak-rivalhub-pairing", "noopener,noreferrer");
  });

  it("closes the preopened browser window when pairing/start fails", async () => {
    const popup = { closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.fn(() => popup);
    vi.stubGlobal("window", { open });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("pairing unavailable"); }));

    await expect(connectRivalHub("https://rivalhub.test")).rejects.toThrow("pairing unavailable");
    expect(popup.close).toHaveBeenCalledOnce();
    expect(popup.location.replace).not.toHaveBeenCalled();
  });
});
