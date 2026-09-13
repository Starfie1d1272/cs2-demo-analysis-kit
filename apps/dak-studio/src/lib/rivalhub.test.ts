import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordGet, recordPut, recordDelete, credentialGet, credentialDelete, fetchMock } = vi.hoisted(() => ({
  recordGet: vi.fn(),
  recordPut: vi.fn(),
  recordDelete: vi.fn(),
  credentialGet: vi.fn(),
  credentialDelete: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("./storage", () => ({
  getStorage: () => ({
    records: () => ({ get: recordGet, put: recordPut, delete: recordDelete }),
  }),
}));

import { revokeRivalHubPairing } from "./rivalhub";

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
  });
});
