import type { AtomicStorageAdapter, RecordMutation } from './storage/types';

/** The editor's persisted baseline no longer describes the current record. */
export class MaterialConflict extends Error {}

export function materialBaseline<T extends { id: string }>(
  revision: string,
  id: string,
  valid: (value: unknown) => value is T,
): T {
  let value: unknown;
  try {
    value = JSON.parse(revision);
  } catch {
    throw new MaterialConflict();
  }
  if (!valid(value) || value.id !== id) throw new MaterialConflict();
  return value;
}

export async function commitMaterialRevision(
  storage: AtomicStorageAdapter,
  namespace: string,
  id: string,
  baseline: unknown,
  mutation: RecordMutation,
): Promise<void> {
  const expected = { namespace, key: id, exists: true, value: baseline };
  if (!(await storage.compareAndWriteRecords([expected], [mutation]))) throw new MaterialConflict();
}
