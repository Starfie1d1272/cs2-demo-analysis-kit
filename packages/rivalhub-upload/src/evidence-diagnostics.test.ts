import { describe, expect, it } from "vitest";
import { safeQaDiagnostics, RivalHubEvidenceQaError } from "./evidence-diagnostics";
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
    expect(sanitizeDiagnosticMessage(result.issues[0]!.message)).toBe(result.issues[0]!.message);
  });
  it.each([
    ["Read /Users/private/demo.dem failed", "Read [redacted] failed"],
    ["Read C:\\private\\demo.dem failed", "Read [redacted] failed"],
    ["Read \"/Users/private person/demo.dem\" failed", "Read [redacted] failed"],
    ["Read ../secret/file.txt failed", "Read [redacted] failed"],
    ["Expected 2 rows from https://user:pass@private.example/path?token=abc but found 1.", "Expected 2 rows from [redacted] but found 1."],
    ["Expected 2 rows; Bearer abc", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows; password=abc", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows; password=two words", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows; password=\"two; words\"; actual=1", "Expected 2 rows; [redacted]; actual=1"],
    ["Expected 2 rows; password=\"two; words", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows; password='two\nwords'; actual=1", "Expected 2 rows; [redacted]; actual=1"],
    ["Expected 2 rows; accessToken=abc", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows; API key = abc", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows; api\nkey=abc", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows; attempt=2", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows; requestId=123", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows; Cookie: session=abc; other=private", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows; Authorization: Bearer abc", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows at 2026-10-11T12:00:00Z", "Expected 2 rows at [redacted]"],
    ["Expected 2 rows for user@example.com", "Expected 2 rows for [redacted]"],
    ["Expected 2 rows for 76561198000000001", "Expected 2 rows for [redacted]"],
    ["Expected 2 rows; eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.abc_signature", "Expected 2 rows; [redacted]"],
    ["Expected 2 rows; " + "x".repeat(60), "Expected 2 rows; [redacted]"],
  ])("redacts only unsafe fragments in %s idempotently", (message, expected) => {
    const safe = sanitizeDiagnosticMessage(message);
    expect(safe).toBe(expected);
    expect(sanitizeDiagnosticMessage(safe)).toBe(safe);
  });
  it.each([
    "Expected 2 player economy rows, found 1.",
    "Frozen playerStats deaths disagrees for [player] (playerIndex=2): expected=1, actual=2.",
    "Kills exist, but no non-origin victim positions were found.",
    "Token coverage is 1/2 because playerStats/kills includes 1 attempt count.",
    "The tokenizer has incomplete coverage; attemptCount=2.",
    "A secret field is absent; no password was supplied.",
    "Round 1 has exploded before any planted event.",
    "At most 2 players (round 1) should be present.",
  ])("preserves safe QA prose %s", (message) => {
    expect(sanitizeDiagnosticMessage(message)).toBe(message);
  });
  it.each(["raw log: oops", "Traceback (most recent call last): private", "Error: failed\n  at load (/private/file.ts:1:2)"])("explains suppression of raw runtime output", (message) => {
    const issue = safeQaDiagnostics([{ code: "future.warning", severity: "warning", path: "kills", message }]).issues[0]!;
    expect(issue).toEqual({ code: "future.warning", severity: "warning", path: "kills", message: "[redacted: raw diagnostic]" });
    expect(sanitizeDiagnosticMessage(issue.message)).toBe(issue.message);
  });
  it("sanitizes controls, dangerous identifiers, absent paths and remains idempotent", () => {
    expect(sanitizeDiagnosticMessage("Rows\nexpected\u202e 2")).toBe("Rows expected 2");
    expect(sanitizeDiagnosticCode("future.warning")).toBe("future.warning");
    expect(sanitizeDiagnosticCode("future.tokenCount")).toBe("future.tokenCount");
    expect(sanitizeDiagnosticCode("attempts.coverage")).toBe("attempts.coverage");
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
