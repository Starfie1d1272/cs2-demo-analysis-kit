import { fileFromNativePath, pickDemPaths } from "./dem";
import type { RivalHubImportContext } from "./rivalhub-import";

export const RIVALHUB_DROP_ZONE_ATTRIBUTE = "data-rivalhub-drop-zone";

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

/** Root ordinary-import guard for drops handled by a RivalHub zone. */
export function isRivalHubDropTarget(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return typeof element?.closest === "function"
    && Boolean(element.closest(`[${RIVALHUB_DROP_ZONE_ATTRIBUTE}]`));
}

/** Decide whether the App-level ordinary Library drop handler may run. */
export function shouldHandleOrdinaryDrop(target: EventTarget | null, defaultPrevented: boolean): boolean {
  return !defaultPrevented && !isRivalHubDropTarget(target);
}
