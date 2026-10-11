import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTriBvh, fetchTriBuffer } from "./tri-loading";
import type { SafeDiagnostic } from "@cs2dak/rivalhub-upload";

afterEach(() => vi.unstubAllGlobals());
describe("optional tri transport", () => {
  it.each([
    [404, "application/octet-stream", "TRI_MISSING"],
    [503, "application/octet-stream", "TRI_FETCH_FAILED"],
    [200, "text/html", "TRI_MISSING"],
    [200, "application/octet-stream", "TRI_INVALID"],
  ])("classifies HTTP %i / %s as %s", async (status, contentType, code) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status, headers: { "content-type": contentType } })));
    const sink = vi.fn();
    await expect(fetchTriBuffer("de_nuke", "https://private.test?token=private/", sink)).resolves.toBeNull();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ code, fileId: "de_nuke" }));
    expect(JSON.stringify(sink.mock.calls)).not.toContain("private");
  });
  it("retains sanitized network and response-read causes separately", async () => {
    const diagnostics: SafeDiagnostic[] = [];
    const sink = (diagnostic: SafeDiagnostic) => { diagnostics.push(diagnostic); };
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("TLS failed accessToken=synthetic-secret /home/synthetic/demo.tri"); }));
    await expect(fetchTriBuffer("de_nuke", "./tris/", sink)).resolves.toBeNull();
    // Unquoted credential clauses are conservatively removed in full; the TLS cause survives.
    expect(JSON.stringify(diagnostics[0])).not.toMatch(/synthetic-secret|\/home\/synthetic/);
    expect(diagnostics[0]).toMatchObject({ code: "TRI_FETCH_FAILED", stage: "tri.fetch", cause: "TLS failed accessToken=[redacted]" });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => { throw new Error("body read failed"); } })));
    await expect(fetchTriBuffer("de_nuke", "./tris/", sink)).resolves.toBeNull();
    expect(diagnostics[1]).toMatchObject({ code: "TRI_READ_FAILED", stage: "tri.read", cause: "body read failed" });
  });
  it("retains parse failure, keeps valid BVH output, and tolerates a failing diagnostic sink", async () => {
    const sink = vi.fn();
    expect(buildTriBvh(new ArrayBuffer(0), "de_nuke", sink)).toBeNull();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ code: "TRI_INVALID", stage: "tri.parse" }));
    expect(buildTriBvh(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer, "de_nuke", sink)).not.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect(fetchTriBuffer("de_nuke", "./tris/", () => { throw new Error("sink failed"); })).resolves.toBeNull();
  });
});
