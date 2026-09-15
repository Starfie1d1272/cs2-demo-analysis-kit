import { fileFromNativePath, pickDemPaths } from "./dem";
import type { RivalHubImportContext } from "./rivalhub-import";

/**
 * Adapter only: reuse the existing native pick_dems() path and hand path-backed
 * File handles to the existing RivalHub batch workflow. No picker or exporter
 * is implemented here.
 */
export async function importRivalHubFromNativePicker(
  context: RivalHubImportContext,
  onImport: (files: Iterable<File>, context: RivalHubImportContext) => Promise<void>,
  pickPaths: () => Promise<string[]> = pickDemPaths,
): Promise<boolean> {
  const paths = await pickPaths();
  if (paths.length === 0) return false;
  await onImport(paths.map(fileFromNativePath), context);
  return true;
}
