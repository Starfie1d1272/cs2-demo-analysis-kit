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

import { assertRivalHubConnected, rivalHubFailureMessage, fetchRivalHubEvents, submitRivalHubEvidence, connectRivalHub, loadRivalHubConnection, normalizeBaseUrl, revokeRivalHubPairing, rivalHubEvidenceIdempotencyKey } from "./rivalhub";

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

  it("keeps vault read failures visible without clearing connection metadata", async () => {
    credentialGet.mockRejectedValueOnce({ message: "CREDENTIAL_READ：钥匙串拒绝访问（退出码 36）" });
    const state = await loadRivalHubConnection();
    expect(state).toMatchObject({ status: "error", baseUrl: "https://rivalhub.test", connectedAt: 1, lastSyncAt: 2 });
    expect(state.error).toContain("CREDENTIAL_READ");
    expect(recordDelete).not.toHaveBeenCalled();
    expect(recordPut).not.toHaveBeenCalled();
    expect(credentialDelete).not.toHaveBeenCalled();
  });

  it("treats only an absent credential as disconnected", async () => {
    credentialGet.mockResolvedValueOnce(null);
    expect(await loadRivalHubConnection()).toMatchObject({ status: "disconnected", error: null });
  });

  it.each(["refresh", "upload", "revoke"])("preserves vault failure through %s without HTTP/metadata writes", async (operation) => {
    credentialGet.mockRejectedValue({ message: "[Errno 5] CREDENTIAL_READ：登录钥匙串拒绝访问，请解锁后重试 accessToken=synthetic-private https://private.test/?token=secret" });
    const action = operation === "refresh" ? fetchRivalHubEvents
      : operation === "revoke" ? revokeRivalHubPairing
      : () => submitRivalHubEvidence({} as Parameters<typeof submitRivalHubEvidence>[0], "key");
    let failure: unknown;
    try { await action(); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    const message = rivalHubFailureMessage(failure);
    expect(message).toContain("Errno 5");
    expect(message).toContain("CREDENTIAL_READ");
    expect(message).toContain("解锁后重试");
    expect(message).not.toContain("尚未连接");
    expect(message).not.toContain("synthetic-private");
    expect(message).not.toContain("private.test");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordPut).not.toHaveBeenCalled();
    expect(recordDelete).not.toHaveBeenCalled();
    expect(credentialDelete).not.toHaveBeenCalled();
  });

  it("keeps a second vault read failure safe after connection inspection succeeded", async () => {
    credentialGet.mockResolvedValueOnce("existing-token").mockRejectedValueOnce({ message: "CREDENTIAL_READ：退出码 36，请解锁 accessToken=synthetic-private" });
    await expect(fetchRivalHubEvents()).rejects.toThrow("退出码 36");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves the error state during post-refresh inspection and sanitizes UI fallback", () => {
    const state = { baseUrl: "https://rivalhub.test", pairingId: "pairing", connectedAt: 1, lastSyncAt: 2, status: "error" as const, error: "CREDENTIAL_READ：退出码 36，请解锁 password=synthetic-private" };
    expect(() => assertRivalHubConnected(state)).toThrow("退出码 36");
    expect(rivalHubFailureMessage(new Error("尚未连接 RivalHub"), state)).toContain("解锁");
    expect(rivalHubFailureMessage(new Error("尚未连接 RivalHub"), state)).not.toContain("synthetic-private");
    expect(rivalHubFailureMessage({ message: "CREDENTIAL_DELETE：系统错误 5 token=synthetic-private" })).toContain("系统错误 5");
    expect(rivalHubFailureMessage({ message: "CREDENTIAL_DELETE：系统错误 5 token=synthetic-private" })).not.toContain("synthetic-private");
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

  it("preopens exactly once during the click and navigates that same window after pairing/start", async () => {
    const order: string[] = [];
    const popup = {
      closed: false,
      opener: {} as unknown,
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
    expect(open).toHaveBeenCalledWith("about:blank", "dak-rivalhub-pairing");
    expect(popup.opener).toBeNull();
    const connected = await pending;

    expect(connected.status).toBe("connected");
    expect(popup.location.replace).toHaveBeenCalledOnce();
    expect(popup.location.replace).toHaveBeenCalledWith(startResponse().authorizeUrl);
    expect(order[1]).toBe("fetch:https://rivalhub.test/api/integrations/dak/pairing/start");
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("fails before pairing/start when the browser blocks the synchronous popup", async () => {
    const open = vi.fn(() => null);
    const fetch = vi.fn();
    vi.stubGlobal("window", { open });
    vi.stubGlobal("fetch", fetch);

    await expect(connectRivalHub("https://rivalhub.test")).rejects.toThrow(/浏览器阻止了连接授权页面/);
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith("about:blank", "dak-rivalhub-pairing");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("closes the preopened browser window when pairing/start fails", async () => {
    const popup = { closed: false, opener: {} as unknown, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.fn(() => popup);
    vi.stubGlobal("window", { open });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("pairing unavailable"); }));

    await expect(connectRivalHub("https://rivalhub.test")).rejects.toThrow("pairing unavailable");
    expect(popup.opener).toBeNull();
    expect(popup.close).toHaveBeenCalledOnce();
    expect(popup.location.replace).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
