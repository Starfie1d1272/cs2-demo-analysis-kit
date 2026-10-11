import type { RecordStore } from "./types";

/** Row keys use an exact matchId or matchId + tab, never a filename prefix. */
export function isMatchRowKey(key: string, matchId: string): boolean {
  return key === matchId || key.startsWith(`${matchId}\t`);
}

/** Wait for every started write before reporting failure (rollback must not race it). */
export async function settleWrites(writes: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(writes);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
}

export async function deleteMatchRows(store: RecordStore, matchId: string): Promise<void> {
  const keys = (await store.keys()).filter((key) => isMatchRowKey(key, matchId));
  await settleWrites(keys.map((key) => store.delete(key)));
}
