import { afterEach, describe, expect, it, vi } from "vitest";
import { httpErrorFromResponse, requestJson } from "./client";
afterEach(() => vi.unstubAllGlobals());
describe("HTTP diagnostic boundary", () => {
  it("returns successful JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
    expect(await requestJson("https://example.test")).toEqual({ ok: true });
  });
  it("preserves unknown server codes, status and request ID without raw body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "NEW_SERVER_CODE", message: "Rejected token=secret" }, private: "raw" }, { status: 422, headers: { "x-request-id": "req-123" } })));
    await expect(requestJson("https://example.test")).rejects.toMatchObject({ status: 422, code: "NEW_SERVER_CODE", requestId: "req-123", message: "Rejected token=[redacted]" });
  });
  it.each([200, 502])("rejects nonJSON status %i without leaking response text", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private gateway body", { status, headers: { "x-request-id": "req-1" } })));
    await expect(requestJson("https://example.test")).rejects.toMatchObject({ status, code: status === 200 ? "INVALID_RESPONSE" : "HTTP_502", requestId: "req-1" });
  });
  it("retains a sanitized concrete network cause", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Fetch failed", { cause: new Error("ECONNRESET https://secret.test?token=hidden") }); }));
    await expect(requestJson("https://example.test")).rejects.toMatchObject({ status: 0, code: "NETWORK", message: "Fetch failed", cause: "ECONNRESET [url]" });
  });
  it("retains explicit server codes and safe causes without attaching the body", () => {
    const failure = httpErrorFromResponse(422, { error: { code: "UPLOAD_FAILED", message: "Rejected", cause: "Token invalid token=private", requestId: "body-request" }, raw: "private body" });
    expect(failure).toMatchObject({ code: "UPLOAD_FAILED", status: 422, requestId: "body-request", cause: "Token invalid token=[redacted]" });
    expect(JSON.stringify(failure)).not.toContain("private");
  });
  it("does not replace HTTP failures with object getter failures", () => {
    const body = Object.defineProperty({}, "error", { get() { throw new Error("private"); } });
    expect(httpErrorFromResponse(500, body)).toMatchObject({ status: 500, code: "HTTP_500" });
  });
});
