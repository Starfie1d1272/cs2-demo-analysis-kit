import type { QaIssue } from "@cs2dak/contract";
import { DIAGNOSTIC_LIMITS, sanitizeDiagnosticCode, sanitizeDiagnosticMessage, sanitizeDiagnosticPath } from "./diagnostic-safety";

export function safeQaDiagnostics(issues: readonly QaIssue[], playerNames: readonly string[] = []) {
  return {
    issues: issues.slice(0, DIAGNOSTIC_LIMITS.issues).map((issue) => ({
      code: sanitizeDiagnosticCode(issue.code),
      severity: issue.severity,
      path: sanitizeDiagnosticPath(issue.path),
      message: sanitizeDiagnosticMessage(playerNames.filter(Boolean).sort((a, b) => b.length - a.length)
        .reduce((message, name) => message.split(`for ${name} (playerIndex=`).join("for [player] (playerIndex="), issue.message)),
    })),
    omittedIssueCount: Math.max(0, issues.length - DIAGNOSTIC_LIMITS.issues),
  };
}

/** Bounded safe details are retained locally even when QA blocks submission. */
export class RivalHubEvidenceQaError extends Error {
  readonly diagnostics: ReturnType<typeof safeQaDiagnostics>;
  constructor(issues: readonly QaIssue[], playerNames: readonly string[] = []) {
    const diagnostics = safeQaDiagnostics(issues, playerNames);
    super(`Evidence blocked by Core QA: ${diagnostics.issues.map((issue) => `${issue.code} (${issue.path ?? "unknown"}): ${issue.message}`).join("; ")}${diagnostics.omittedIssueCount ? `; omitted=${diagnostics.omittedIssueCount}` : ""}`);
    this.name = "RivalHubEvidenceQaError";
    this.diagnostics = diagnostics;
  }
}
