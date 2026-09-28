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
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "RivalHubHttpError";
  }
}

function messageFromResponse(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return fallback;
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new RivalHubHttpError(response.status, messageFromResponse(body, `RivalHub 请求失败：HTTP ${response.status}`));
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
      return rivalHubEventsResponseSchema.parse(await request("/events", "GET"));
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
