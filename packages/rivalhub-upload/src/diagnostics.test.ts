import { describe, expect, it } from "vitest";
import { safeQaDiagnostics, RivalHubEvidenceQaError } from "./diagnostics";
import { sanitizeDiagnosticCode, sanitizeDiagnosticPath, sanitizeDiagnosticMessage } from "./diagnostic-safety";

describe("safe evidence diagnostics", () => {
  it("preserves no issues, multiple warnings and unknown future codes", () => {
    expect(safeQaDiagnostics([])).toEqual({ issues: [], omittedIssueCount: 0 });
    const issues = ["future.new_warning", "economy.coverage_incomplete"].map((code) => ({ code, severity: "warning" as const, path: "players[12].stats", message: "Expected 12 rows, found 10." }));
    expect(safeQaDiagnostics(issues)).toEqual({ issues, omittedIssueCount: 0 });
  });
  it("bounds issues and each field, keeping an explicit omitted count", () => {
    const issue = { code: "x".repeat(97), severity: "warning" as const, path: "p".repeat(129), message: "Expected rows. ".repeat(100) };
    const result = safeQaDiagnostics(Array.from({ length: 70 }, () => issue));
    expect(result.issues).toHaveLength(64);
    expect(result.omittedIssueCount).toBe(6);
    expect(result.issues[0]).toMatchObject({ code: "diagnostic.redacted", path: "diagnostic.redacted" });
    expect(result.issues[0]!.message.length).toBeLessThanOrEqual(320);
  });
  it.each([
    "Read /Users/private/demo.dem failed", "Read C:\\private\\demo.dem failed", "../secret/file.txt",
    "https://private.example/path?token=abc", "Bearer abc", "password=abc", "accessToken=abc", "API key abc", "api\nkey abc", "attempt=2", "requestId=123",
    "raw log: oops", "2026-10-11T12:00:00Z", "player user@example.com", "player 76561198000000001", "x".repeat(60),
  ])("redacts unsafe message %s idempotently", (message) => {
    const safe = sanitizeDiagnosticMessage(message);
    expect(safe).toBe("[redacted]");
    expect(sanitizeDiagnosticMessage(safe)).toBe(safe);
  });
  it("sanitizes controls, dangerous identifiers, absent paths and remains idempotent", () => {
    expect(sanitizeDiagnosticMessage("Rows\nexpected\u202e 2")).toBe("Rows expected 2");
    expect(sanitizeDiagnosticCode("future.warning")).toBe("future.warning");
    expect(sanitizeDiagnosticCode("accessToken.abc")).toBe("diagnostic.redacted");
    expect(sanitizeDiagnosticPath("players.password")).toBe("diagnostic.redacted");
    expect(sanitizeDiagnosticPath("/tmp/demo")).toBe("diagnostic.redacted");
    expect(sanitizeDiagnosticPath("demo.dem")).toBe("diagnostic.redacted");
    expect(sanitizeDiagnosticCode("x".repeat(60))).toBe("diagnostic.redacted");
    expect(sanitizeDiagnosticPath(undefined)).toBeNull();
    expect(sanitizeDiagnosticPath(sanitizeDiagnosticPath("/tmp/demo"))).toBe("diagnostic.redacted");
  });
  it("removes player names at Core parity locations without corrupting short-name prose", () => {
    const issues = [
      { code: "performance.parity_mismatch", severity: "error" as const, path: "playerStats.deaths", message: "Frozen playerStats deaths disagrees for a (playerIndex=2): expected=1, actual=2." },
      { code: "future.warning", severity: "warning" as const, path: "kills", message: "Expected a named active weapon." },
    ];
    const safe = safeQaDiagnostics(issues, ["a", "e"]);
    expect(safe.issues[0]!.message).toBe("Frozen playerStats deaths disagrees for [player] (playerIndex=2): expected=1, actual=2.");
    expect(safe.issues[1]!.message).toBe(issues[1]!.message);
    expect(sanitizeDiagnosticMessage(" \n \t")).toBe("[redacted]");
  });
  it("retains safe QA error code, location and message when upload is blocked", () => {
    const error = new RivalHubEvidenceQaError([{ code: "future.error", severity: "error", path: "playerStats.deaths", message: "Expected 2, actual 3." }]);
    expect(error.message).toContain("future.error (playerStats.deaths): Expected 2, actual 3.");
    expect(error.diagnostics.issues[0]?.severity).toBe("error");
  });
});
