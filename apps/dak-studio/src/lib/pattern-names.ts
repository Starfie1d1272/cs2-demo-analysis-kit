import { getStorage } from "./storage";
const playbookStore = getStorage().records("playbook");
export async function listPatternNames(): Promise<Record<string, string>> {
  const entries = await playbookStore.entries<string>();
  return Object.fromEntries(entries.map(([key, value]) => [key, value ?? ""]));
}

export async function savePatternName(clusterId: string, name: string): Promise<void> {
  await playbookStore.put(clusterId, name.trim());
}
