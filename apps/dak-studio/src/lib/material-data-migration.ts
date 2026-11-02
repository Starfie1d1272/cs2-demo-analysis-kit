import { getStorage, type RecordStore } from "./storage";
import type { PrepItem } from "./prep-items";

const MARKER = "migration:prep-items:v1";

// Stable comparison also handles object key ordering in records restored from backups.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function sameItem(a: PrepItem, b: PrepItem): boolean {
  const withoutId = (item: PrepItem) => {
    const { id: _id, ...rest } = item;
    return canonical({ ...rest, source: rest.source ?? "tactical-pattern" });
  };
  return JSON.stringify(withoutId(a)) === JSON.stringify(withoutId(b));
}

/** Copy each legacy record before deleting it. A failed operation can be retried safely. */
export async function migrateLegacyPrepItems(
  current: RecordStore = getStorage().records("prep-items"),
  legacy: RecordStore = getStorage().records("playlist"),
  kv: RecordStore = getStorage().records("kv"),
): Promise<void> {
  if (await kv.get<boolean>(MARKER)) return;
  for (const [oldId, raw] of await legacy.entries<PrepItem>()) {
    const item: PrepItem = { ...raw, source: raw.source ?? "tactical-pattern" };
    let id = oldId;
    let existing = await current.get<PrepItem>(id);
    if (existing && !sameItem(existing, item)) {
      const base = `legacy-playlist:${oldId}`;
      id = base;
      let suffix = 2;
      while ((existing = await current.get<PrepItem>(id)) && !sameItem(existing, item)) {
        id = `${base}:${suffix++}`;
      }
    }
    if (!existing) await current.put(id, { ...item, id });
    await legacy.delete(oldId);
  }
  await kv.put(MARKER, true);
}
