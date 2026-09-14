import { getStorage } from "./storage";
import { markRivalHubEventsStale } from "./events";
import {
  RIVALHUB_EVENTS_CONTRACT,
  rivalHubEventsResponseSchema,
  type EvidenceSubmissionResponse,
  type RivalHubEventsResponse,
  type RivalHubEvidenceSubmission,
} from "./rivalhub-contract";

const CONNECTION_KEY = "connection";
export const OFFICIAL_RIVALHUB_URL = "https://match.starfie1d.top";
const CREDENTIAL_SERVICE = "com.starfie1d.dak-studio.rivalhub";
const CREDENTIAL_ACCOUNT = "access-token";
const POLL_INTERVAL_MS = 1000;
const connectionStore = getStorage().records("rivalhub");

export interface RivalHubConnectionRecord {
  baseUrl: string;
  pairingId: string | null;
  connectedAt: number;
  lastSyncAt: number | null;
}

export type RivalHubConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface RivalHubConnectionState extends RivalHubConnectionRecord {
  status: RivalHubConnectionStatus;
  error: string | null;
}

interface NativeRivalHubApi {
  rivalhub_open_external_url?: (url: string) => Promise<boolean>;
  rivalhub_credential_get?: (service: string, account: string) => Promise<string | null>;
  rivalhub_credential_set?: (service: string, account: string, value: string) => Promise<boolean>;
  rivalhub_credential_delete?: (service: string, account: string) => Promise<boolean>;
}

interface PairingStartResponse {
  pairingId: string;
  pollToken: string;
  authorizeUrl: string;
  expiresAt: string;
}

interface PairingPollResponse {
  status: "pending" | "authorized" | "expired";
  expiresAt: string;
  accessToken?: string;
}

let memoryCredential: { baseUrl: string; token: string } | null = null;

function nativeApi(): NativeRivalHubApi | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { pywebview?: { api?: NativeRivalHubApi } }).pywebview?.api) ?? null;
}

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

class RivalHubHttpError extends Error {
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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new RivalHubHttpError(response.status, messageFromResponse(body, `RivalHub 请求失败：HTTP ${response.status}`));
  return body as T;
}

async function readCredential(baseUrl: string): Promise<string | null> {
  const api = nativeApi();
  if (api?.rivalhub_credential_get) return await api.rivalhub_credential_get(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT);
  return memoryCredential?.baseUrl === baseUrl ? memoryCredential.token : null;
}

async function saveCredential(baseUrl: string, token: string): Promise<void> {
  const api = nativeApi();
  if (api?.rivalhub_credential_set) {
    if (!await api.rivalhub_credential_set(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT, token)) throw new Error("无法写入系统安全存储，连接未保存");
    return;
  }
  // 浏览器开发环境只保存在当前 JS 进程内；不写入 IndexedDB/localStorage。
  memoryCredential = { baseUrl, token };
}

async function deleteCredential(): Promise<void> {
  const api = nativeApi();
  if (api?.rivalhub_credential_delete) await api.rivalhub_credential_delete(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT);
  memoryCredential = null;
}

async function openExternalUrl(url: string): Promise<void> {
  const api = nativeApi();
  if (api?.rivalhub_open_external_url) {
    if (!await api.rivalhub_open_external_url(url)) throw new Error("无法打开系统浏览器");
    return;
  }
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) throw new Error("浏览器阻止了连接授权页面，请允许打开新窗口后重试");
}

async function saveConnection(baseUrl: string, pairingId: string | null, previous?: RivalHubConnectionRecord): Promise<RivalHubConnectionRecord> {
  const record: RivalHubConnectionRecord = {
    baseUrl,
    pairingId: pairingId ?? previous?.pairingId ?? null,
    connectedAt: previous?.connectedAt ?? Date.now(),
    lastSyncAt: previous?.lastSyncAt ?? null,
  };
  await connectionStore.put(CONNECTION_KEY, record);
  return record;
}

async function clearUnauthorizedConnection(state: RivalHubConnectionState, error: unknown): Promise<void> {
  if (!(error instanceof RivalHubHttpError) || error.status !== 401) return;
  await deleteCredential();
  await connectionStore.put(CONNECTION_KEY, { baseUrl: state.baseUrl, pairingId: state.pairingId, connectedAt: state.connectedAt, lastSyncAt: state.lastSyncAt });
}

export async function loadRivalHubConnection(): Promise<RivalHubConnectionState> {
  const record = await connectionStore.get<RivalHubConnectionRecord>(CONNECTION_KEY);
  if (!record?.baseUrl) return { baseUrl: "", pairingId: null, connectedAt: 0, lastSyncAt: null, status: "disconnected", error: null };
  const baseUrl = normalizeBaseUrl(record.baseUrl);
  const pairingId = typeof record.pairingId === "string" && record.pairingId ? record.pairingId : null;
  const token = await readCredential(baseUrl);
  return { ...record, baseUrl, pairingId, status: token ? "connected" : "disconnected", error: null };
}

export async function connectRivalHub(
  inputBaseUrl: string,
  onProgress?: (message: string) => void,
): Promise<RivalHubConnectionState> {
  const baseUrl = normalizeBaseUrl(inputBaseUrl);
  const start = await requestJson<PairingStartResponse>(`${baseUrl}/api/integrations/dak/pairing/start`, { method: "POST" });
  onProgress?.("请在系统浏览器中确认 RivalHub 赛事权限…");
  await openExternalUrl(start.authorizeUrl);
  const expiresAt = new Date(start.expiresAt).getTime();
  for (;;) {
    const poll = await requestJson<PairingPollResponse>(`${baseUrl}/api/integrations/dak/pairing/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingId: start.pairingId, pollToken: start.pollToken }),
    });
    if (poll.status === "authorized" && poll.accessToken) {
      await saveCredential(baseUrl, poll.accessToken);
      const record = await saveConnection(baseUrl, start.pairingId);
      return { ...record, status: "connected", error: null };
    }
    if (poll.status === "expired" || Date.now() >= expiresAt) throw new Error("连接授权已过期，请重新发起");
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export async function fetchRivalHubEvents(): Promise<RivalHubEventsResponse> {
  const state = await loadRivalHubConnection();
  if (!state.baseUrl || state.status !== "connected") throw new Error("尚未连接 RivalHub");
  const token = await readCredential(state.baseUrl);
  if (!token) throw new Error("RivalHub 连接凭据不存在，请重新连接");
  try {
    const response = await requestJson<unknown>(`${state.baseUrl}/api/integrations/dak/events`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const parsed = rivalHubEventsResponseSchema.parse(response);
    await connectionStore.put(CONNECTION_KEY, { baseUrl: state.baseUrl, pairingId: state.pairingId, connectedAt: state.connectedAt, lastSyncAt: Date.now() });
    return parsed;
  } catch (error) {
    await clearUnauthorizedConnection(state, error);
    throw error;
  }
}

export async function submitRivalHubEvidence(
  evidence: RivalHubEvidenceSubmission,
  idempotencyKey: string,
): Promise<EvidenceSubmissionResponse> {
  const state = await loadRivalHubConnection();
  if (!state.baseUrl || state.status !== "connected") throw new Error("尚未连接 RivalHub");
  const token = await readCredential(state.baseUrl);
  if (!token) throw new Error("RivalHub 连接凭据不存在，请重新连接");
  try {
    return await requestJson<EvidenceSubmissionResponse>(`${state.baseUrl}/api/integrations/dak/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(evidence),
    });
  } catch (error) {
    await clearUnauthorizedConnection(state, error);
    throw error;
  }
}

export async function revokeRivalHubPairing(): Promise<void> {
  const state = await loadRivalHubConnection();
  if (!state.baseUrl || state.status !== "connected") throw new Error("尚未连接 RivalHub");
  if (!state.pairingId) throw new Error("当前连接缺少配对标识，请重新连接后再撤销此设备");
  const token = await readCredential(state.baseUrl);
  if (!token) throw new Error("RivalHub 连接凭据不存在，请重新连接");
  try {
    await requestJson<unknown>(`${state.baseUrl}/api/integrations/dak/pairings/${encodeURIComponent(state.pairingId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    await clearUnauthorizedConnection(state, error);
    throw error;
  }
  await markRivalHubEventsStale();
  await disconnectRivalHub();
}

export async function disconnectRivalHub(): Promise<void> {
  await deleteCredential();
  await connectionStore.delete(CONNECTION_KEY);
}

export { RIVALHUB_EVENTS_CONTRACT };
