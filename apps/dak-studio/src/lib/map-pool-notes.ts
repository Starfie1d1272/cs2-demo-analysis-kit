import { getStorage } from "./storage";
const mapPoolNotesStore = getStorage().records("map-pool-notes");
export async function listMapPoolNotes(): Promise<Record<string, string>> {
  const entries = await mapPoolNotesStore.entries<string>();
  return Object.fromEntries(entries.map(([mapName, note]) => [mapName, note ?? ""]));
}

export async function saveMapPoolNote(mapName: string, note: string): Promise<void> {
  await mapPoolNotesStore.put(mapName, note);
}
