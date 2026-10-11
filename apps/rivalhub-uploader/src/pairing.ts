import type { NativeApi } from "./native";

/** Late bridge completions cannot publish a canceled attempt or erase a newer one. */
export async function completePairing(
  api: Pick<NativeApi, "save_connection" | "configure">,
  events: () => Promise<unknown>,
  current: () => boolean,
  baseUrl: string,
  pairingId: string,
  token: string,
): Promise<boolean> {
  let saved = false;
  try {
    if (!current()) return false;
    if (!await api.save_connection(pairingId, token, baseUrl)) throw new Error("CREDENTIAL_SAVE：系统安全存储未确认授权保存，请重新连接");
    saved = true;
    if (!current()) return false;
    await events();
    return current();
  } finally {
    if (saved && !current()) await api.configure(baseUrl, pairingId);
  }
}
