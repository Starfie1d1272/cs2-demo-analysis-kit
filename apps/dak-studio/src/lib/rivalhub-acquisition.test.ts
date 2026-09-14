import { describe, expect, it, vi } from "vitest";
import { nativePathForFile } from "./dem";
import { importRivalHubFromNativePicker, isRivalHubDropTarget, RIVALHUB_DROP_ZONE_ATTRIBUTE, shouldHandleOrdinaryDrop } from "./rivalhub-acquisition";
import type { RivalHubImportContext } from "./rivalhub-import";

const context: RivalHubImportContext = {
  scope: "map",
  eventId: "event-1",
  candidates: [],
  fixedMatchMapId: "map-1",
};

describe("RivalHub desktop acquisition adapter", () => {
  it("forwards native picker paths as path-backed files with the same context", async () => {
    const onImport = vi.fn(async (_files: Iterable<File>, _context: RivalHubImportContext) => undefined);

    await expect(importRivalHubFromNativePicker(
      context,
      onImport,
      async () => ["/demos/match.dem", "/demos/match.zip"],
    )).resolves.toBe(true);

    expect(onImport).toHaveBeenCalledOnce();
    const [files, receivedContext] = onImport.mock.calls[0]!;
    const receivedFiles = [...files];
    expect(receivedContext).toBe(context);
    expect(receivedFiles.map((file) => file.name)).toEqual(["match.dem", "match.zip"]);
    expect(receivedFiles.map(nativePathForFile)).toEqual(["/demos/match.dem", "/demos/match.zip"]);
  });

  it("does not start the RivalHub batch when the native picker is cancelled", async () => {
    const onImport = vi.fn(async (_files: Iterable<File>, _context: RivalHubImportContext) => undefined);

    await expect(importRivalHubFromNativePicker(context, onImport, async () => [])).resolves.toBe(false);
    expect(onImport).not.toHaveBeenCalled();
  });

  it("identifies only descendants of a marked RivalHub drop zone", () => {
    const inside = { closest: vi.fn((selector: string) => selector === `[${RIVALHUB_DROP_ZONE_ATTRIBUTE}]` ? {} : null) };
    const outside = { closest: vi.fn(() => null) };

    expect(isRivalHubDropTarget(inside as unknown as EventTarget)).toBe(true);
    expect(isRivalHubDropTarget(outside as unknown as EventTarget)).toBe(false);
    expect(isRivalHubDropTarget(null)).toBe(false);
  });

  it("keeps the App ordinary Library importer out of a RivalHub drop", () => {
    const inside = { closest: vi.fn(() => ({})) };
    const outside = { closest: vi.fn(() => null) };

    expect(shouldHandleOrdinaryDrop(inside as unknown as EventTarget, false)).toBe(false);
    expect(shouldHandleOrdinaryDrop(outside as unknown as EventTarget, false)).toBe(true);
    expect(shouldHandleOrdinaryDrop(outside as unknown as EventTarget, true)).toBe(false);
  });
});
