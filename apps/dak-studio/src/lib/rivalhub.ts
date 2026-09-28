import { createRivalHubClient, normalizeBaseUrl, requestJson, RivalHubHttpError } from "@cs2dak/rivalhub-upload";
export { normalizeBaseUrl, rivalHubEvidenceIdempotencyKey } from "@cs2dak/rivalhub-upload";
import { getStorage } from "./storage";
import { markRivalHubEventsStale } from "./events";
import {
  RIVALHUB_EVENTS_CONTRACT,
  type EvidenceSubmissionResponse,
  type RivalHubEventsResponse,
  type RivalHubEvidenceSubmission,
} from "./rivalhub-contract";

const CONNECTION_KEY = "connection";
export const OFFICIAL_RIVALHUB_URL = "https://match.starfie1d.top";
const CREDENTIAL_SERVICE = "com.starfie1d.dak-studio.rivalhub";
const CREDENTIAL_ACCOUNT = "access-token";
const POLL_INTERVAL_MS = 1000;
const BROWSER_PAIRING_WINDOW_NAME = "dak-rivalhub-pairing";
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


let memoryCredential: { baseUrl: string; token: string } | null = null;

function nativeApi(): NativeRivalHubApi | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { pywebview?: { api?: NativeRivalHubApi } }).pywebview?.api) ?? null;
}

function createConnectionClient(baseUrl: string, token?: string) {
  return createRivalHubClient(async <T,>(path: string, method: "GET" | "POST", body?: unknown, key?: string): Promise<T> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (key) headers["Idempotency-Key"] = key;
    return requestJson<T>(`${baseUrl}/api/integrations/dak${path}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  });
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

function preopenBrowserPairingWindow(): Window {
  let popup: Window | null = null;
  try {
    // Must run synchronously while the click activation is live. Do not pass
    // noopener/noreferrer here: those features can intentionally discard the
    // WindowProxy that we need to navigate after pairing/start returns.
    popup = window.open("about:blank", BROWSER_PAIRING_WINDOW_NAME);
  } catch {
    popup = null;
  }
  if (!popup) throw new Error("浏览器阻止了连接授权页面，请允许打开新窗口后重试");
  try {
    // about:blank is still same-origin here. Remove the child page's opener
    // capability while retaining our WindowProxy for the later navigation.
    popup.opener = null;
  } catch {
    // Some browser implementations expose opener as non-writable; retaining a
    // single user-activated WindowProxy is still safer than an async re-open.
  }
  return popup;
}

function closeBrowserPairingWindow(popup: Window | null): void {
  if (!popup) return;
  try {
    if (!popup.closed) popup.close();
  } catch {
    // The browser may have discarded the opener reference already.
  }
}

function navigateBrowserPairingWindow(url: string, preopened: Window | null): void {
  if (!preopened || preopened.closed) {
    throw new Error("RivalHub 授权窗口已关闭，请重新发起连接");
  }
  try {
    preopened.location.replace(url);
  } catch {
    throw new Error("无法打开 RivalHub 授权页面，请重新发起连接");
  }
}

async function openExternalUrl(url: string, preopenedBrowserWindow: Window | null = null): Promise<void> {
  const api = nativeApi();
  if (api?.rivalhub_open_external_url) {
    if (!await api.rivalhub_open_external_url(url)) throw new Error("无法打开系统浏览器");
    return;
  }
  navigateBrowserPairingWindow(url, preopenedBrowserWindow);
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
  const native = nativeApi();
  const preopenedBrowserWindow = native?.rivalhub_open_external_url ? null : preopenBrowserPairingWindow();
  try {
    const client = createConnectionClient(baseUrl);
    const start = await client.startPairing();
    onProgress?.("请在系统浏览器中确认 RivalHub 赛事权限…");
    await openExternalUrl(start.authorizeUrl, preopenedBrowserWindow);
    const expiresAt = new Date(start.expiresAt).getTime();
    for (;;) {
      const poll = await client.pollPairing(start.pairingId, start.pollToken);
      if (poll.status === "authorized" && poll.accessToken) {
        await saveCredential(baseUrl, poll.accessToken);
        const record = await saveConnection(baseUrl, start.pairingId);
        return { ...record, status: "connected", error: null };
      }
      if (poll.status === "expired" || Date.now() >= expiresAt) throw new Error("连接授权已过期，请重新发起");
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } catch (error) {
    closeBrowserPairingWindow(preopenedBrowserWindow);
    throw error;
  }
}

export async function fetchRivalHubEvents(): Promise<RivalHubEventsResponse> {
  const state = await loadRivalHubConnection();
  if (!state.baseUrl || state.status !== "connected") throw new Error("尚未连接 RivalHub");
  const token = await readCredential(state.baseUrl);
  if (!token) throw new Error("RivalHub 连接凭据不存在，请重新连接");
  try {
    const parsed = await createConnectionClient(state.baseUrl, token).events();
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
    return await createConnectionClient(state.baseUrl, token).submit(evidence, idempotencyKey);
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
