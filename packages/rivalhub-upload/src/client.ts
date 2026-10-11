import { normalizeDiagnostic, sanitizeDiagnosticText } from "./diagnostics";
import type { RivalHubEvidenceSubmission } from "./contract";
export function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("RivalHub 地址必须使用 HTTPS；HTTP 仅允许本机开发地址");
  }
  if (!parsed.hostname || parsed.username || parsed.password) throw new Error("RivalHub 地址不能包含账号密码");
  const hostname = parsed.hostname.toLowerCase();
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  if (parsed.protocol === "http:" && !isLoopback) throw new Error("RivalHub 远程地址必须使用 HTTPS；HTTP 仅允许 localhost、127.0.0.1 或 ::1");
  return parsed.origin;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("Evidence payload 无法稳定序列化");
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
}

export async function rivalHubEvidenceIdempotencyKey(
  remoteMapId: string,
  evidence: RivalHubEvidenceSubmission,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableSerialize(evidence)));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `dak:${remoteMapId}:${hash}`;
}

export class RivalHubHttpError extends Error {
  readonly code: string;
  readonly requestId?: string;
  constructor(readonly status: number, message: string, code?: string, requestId?: string) {
    super(sanitizeDiagnosticText(message));
    this.name = "RivalHubHttpError";
    const diagnostic = normalizeDiagnostic({ code: code ?? (status === 0 ? "NETWORK" : `HTTP_${status}`), message, requestId });
    this.code = diagnostic.code;
    this.requestId = diagnostic.requestId;
  }
}

export function httpErrorFromResponse(status: number, body: unknown, requestId?: string): RivalHubHttpError {
  let error: unknown;
  try { error = body && typeof body === "object" ? (body as Record<string, unknown>).error : undefined; }
  catch { /* A malformed object must not replace the HTTP failure. */ }
  const diagnostic = normalizeDiagnostic(error);
  const envelope = normalizeDiagnostic(body);
  let hasCode = false;
  try { hasCode = error != null && typeof error === "object" && typeof (error as Record<string, unknown>).code === "string"; }
  catch { /* Ignore unsafe property access. */ }
  const failure = new RivalHubHttpError(status,
    error == null ? `RivalHub 请求失败：HTTP ${status}` : diagnostic.message,
    !hasCode && diagnostic.code === "UPLOAD_FAILED" ? undefined : diagnostic.code,
    requestId ?? diagnostic.requestId ?? envelope.requestId);
  if (diagnostic.cause) failure.cause = diagnostic.cause;
  return failure;
}

function jsonReadCause(error: unknown): string {
  // JSON parsers can embed response bytes in their exception messages. Extract
  // only parser grammar and numeric locations; never forward the message itself.
  if (error instanceof SyntaxError) {
    // Read only to extract finite grammar categories and terminal coordinates;
    // redaction may remove coordinates along with an embedded secret clause.
    let message = "";
    try { if (typeof error.message === "string") message = error.message; } catch { /* unsafe accessor */ }
    const reason = /^(Unexpected end of JSON input|Unexpected token|Unexpected non-whitespace character after JSON|Expected property name|Expected double-quoted property name|Unterminated string|Bad escaped character|Bad control character|Bad Unicode escape)/i.exec(message)?.[1] ?? "Invalid JSON syntax";
    const position = / at position (\d{1,12})(?: \(line \d{1,12} column \d{1,12}\))?$/i.exec(message)?.[1];
    const location = /\(line (\d{1,12}) column (\d{1,12})\)$/i.exec(message);
    return `SyntaxError: ${reason}${position ? `; position ${position}` : ""}${location ? `; line ${location[1]} column ${location[2]}` : ""}`;
  }
  if (error instanceof TypeError) return "TypeError: response body could not be read or decoded";
  if (error instanceof DOMException && error.name === "AbortError") return "AbortError: response body read was aborted";
  return "Response body read or JSON decoding failed";
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...init, cache: "no-store" }); }
  catch (error) {
    const diagnostic = normalizeDiagnostic(error);
    const failure = new RivalHubHttpError(0, diagnostic.message, "NETWORK");
    if (diagnostic.cause) failure.cause = diagnostic.cause;
    throw failure;
  }
  const requestId = response.headers.get("x-request-id") ?? undefined;
  let body: unknown;
  try { body = await response.json(); }
  catch (error) {
    const failure = new RivalHubHttpError(response.status, "网站返回了无法解析的 JSON 响应", response.ok ? "INVALID_RESPONSE" : undefined, requestId);
    failure.cause = jsonReadCause(error);
    throw failure;
  }
  if (!response.ok) throw httpErrorFromResponse(response.status, body, requestId);
  return body as T;
}


export interface PairingStartResponse { pairingId: string; pollToken: string; authorizeUrl: string; expiresAt: string }
export interface PairingPollResponse { status: "pending" | "authorized" | "expired"; expiresAt: string; accessToken?: string }
export type RivalHubTransport = <T>(path: string, method: "GET" | "POST", body?: unknown, idempotencyKey?: string) => Promise<T>;

/** Transport owns credentials; no token or storage is needed by the producer. */
export function createRivalHubClient(request: RivalHubTransport) {
  return {
    startPairing: () => request<PairingStartResponse>("/pairing/start", "POST"),
    pollPairing: (pairingId: string, pollToken: string) => request<PairingPollResponse>("/pairing/poll", "POST", { pairingId, pollToken }),
    async events() {
      // Old servers ignore the query and remain readable; new servers keep the
      // legacy strict response shape for clients that do not explicitly opt in.
      return rivalHubEventsResponseSchema.parse(await request("/events?seriesDisposition=1", "GET"));
    },
    async submit(evidence: RivalHubEvidenceSubmission, idempotencyKey: string) {
      return evidenceResponseSchema.parse(await request("/evidence", "POST", evidence, idempotencyKey));
    },
  };
}

import { z } from "zod";
import { rivalHubEventsResponseSchema } from "./contract";
const evidenceResponseSchema = z.object({
  status: z.enum(["synced", "needs_attention"]), importId: z.string().nullable(),
  matchMapId: z.string(), demoSha256: z.string(),
  issues: z.array(z.object({ code: z.string(), message: z.string(), path: z.string().optional() })),
});
