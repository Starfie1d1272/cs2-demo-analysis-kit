import { describe, expect, it } from "vitest";
import { normalizeDiagnostic } from "./diagnostics";
describe("safe diagnostics", () => {
  it("projects object rejections and bounded nested causes without arbitrary data", () => {
    const detail = normalizeDiagnostic({ message: "Native failed", code: "FUTURE_CODE", cause: { message: "Permission denied /Users/alice/private.dem" }, token: "private" }, { stage: "export", fileId: "file-1", attempt: 2 });
    expect(detail).toMatchObject({ code: "FUTURE_CODE", message: "Native failed", cause: "Permission denied [path]", stage: "export", fileId: "file-1", attempt: 2 });
    expect(JSON.stringify(detail)).not.toContain("private");
  });
  it("redacts paths, credentials, URLs and control characters before truncating", () => {
    const detail = normalizeDiagnostic(new Error("Bearer abc token=def https://host/private?q=secret C:\\Users\\alice\\demo.dem /tmp/private\n" + "x".repeat(1000)));
    expect(detail.message.length).toBeLessThanOrEqual(500);
    for (const secret of ["abc", "def", "host", "alice", "private", "\n"]) expect(detail.message).not.toContain(secret);
  });
  it("sanitizes quoted credential fields and Python cause lists", () => {
    const detail = normalizeDiagnostic({ message: '\"accessToken\": \"private value\"', stage: "export:parse", causes: [{ message: "disk full /tmp/demo.zip" }] });
    expect(detail.message).not.toContain("private");
    expect(detail).toMatchObject({ cause: "disk full [path]", stage: "export:parse" });
  });
  it("handles null and cyclic object errors safely", () => {
    expect(normalizeDiagnostic(null).message).not.toContain("object Object");
    const error: { message: string; cause?: unknown } = { message: "failure" }; error.cause = error;
    expect(normalizeDiagnostic(error)).toEqual({ code: "UPLOAD_FAILED", message: "failure" });
  });
  it.each([
    'Cookie: session=private; refresh=hidden',
    'Authorization: Basic private',
    'authorization=Basic private',
    'deviceCode=private pairingCode=hidden',
    '\\\\server\\private\\hidden.dem',
    'cannot read /Users/private Person/hidden.dem',
    'cannot read \\\\server\\private Person\\hidden.dem',
    'cannot read C:\\Users\\private Person\\hidden.dem',
    'cannot read C:/Users/private Person/hidden.dem',
    'cannot read file:///Users/private Person/hidden.dem',
    'cannot read file://server/private/hidden.dem',
    '{"token":private}',
    '{"refresh_token":"private\\\"hidden"}',
    "{'password': 'private\nhidden'}",
    'open "C:\\Users\\Private Person\\hidden.dem" failed',
  ])("redacts credential and path variants: %s", message => {
    expect(normalizeDiagnostic({ message }).message.toLowerCase()).not.toMatch(/private|hidden/);
  });
  it("survives throwing getters without stringifying unknown rejection objects", () => {
    const error = Object.create(null);
    for (const key of ["message", "cause", "causes", "code", "requestId", "stage", "fileId", "attempt"]) {
      Object.defineProperty(error, key, { get() { throw new Error("private"); } });
    }
    expect(normalizeDiagnostic(error)).toEqual({ code: "UPLOAD_FAILED", message: "操作失败：未提供错误详情" });
    expect(normalizeDiagnostic({ token: "private", toString() { throw new Error("private"); } })).toEqual(normalizeDiagnostic(null));
  });
  it("bounds cyclic and hostile cause lists", () => {
    const causes = [new Error("known")];
    Object.defineProperty(causes, "1", { get() { throw new Error("private"); } });
    expect(normalizeDiagnostic({ message: "failed", causes }).cause).toBe("known");
    const first = { message: "one", cause: {} as unknown };
    const second = { message: "two", cause: first }; first.cause = second;
    expect(normalizeDiagnostic({ message: "failed", cause: first }).cause?.length).toBeLessThan(500);
  });
  it("rejects credential-like metadata even when it matches the identifier alphabet", () => {
    const result = normalizeDiagnostic({ message: "failed", code: "eyJabc.def.ghi", requestId: "eyJabc.def.ghi", fileId: "eyJabc.def.ghi" });
    expect(result).toEqual({ message: "failed", code: "UPLOAD_FAILED" });
  });
});
