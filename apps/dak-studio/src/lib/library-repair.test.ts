import "fake-indexeddb/auto";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getFactsStore } from "./facts-store";
import { getStorage } from "./storage";
import { deleteSeriesRecord, listSeriesRecords, saveSeriesRecord } from "./series";
import { importDemoFile, listDemoEntries, matchIdForEntry, backfillDemoIdentities } from "./library";
import { repairDemoIdentityAndDuplicates } from "./library-repair";

const fixturePath = fileURLToPath(new URL("../../../../fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip", import.meta.url));
let sampleBytes: Uint8Array;

async function variantBytes(demoSha256: string, exportedAt: string): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(sampleBytes);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("fixture manifest missing");
  const manifest = JSON.parse(await manifestFile.async("string")) as Record<string, unknown>;
  manifest.demo = { ...(manifest.demo as Record<string, unknown>), hash: demoSha256 };
  manifest.exportedAt = exportedAt;
  zip.file("manifest.json", JSON.stringify(manifest));
  return zip.generateAsync({ type: "uint8array" });
}

function file(bytes: Uint8Array, name: string): File {
  return new File([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], name, { type: "application/zip" });
}

describe("Demo raw identity", () => {
  beforeAll(async () => {
    sampleBytes = new Uint8Array(await readFile(fixturePath));
  });

  it("dedupes different ZIP bytes with the same manifest raw Demo hash", async () => {
    const demoSha256 = "b".repeat(64);
    const firstBytes = await variantBytes(demoSha256, "2026-09-01T00:00:00Z");
    const secondBytes = await variantBytes(demoSha256, "2026-09-02T00:00:00Z");
    expect(Buffer.from(firstBytes).equals(Buffer.from(secondBytes))).toBe(false);

    const first = await importDemoFile(file(firstBytes, "raw-identity-a.zip"));
    const second = await importDemoFile(file(secondBytes, "raw-identity-b.zip"), { tags: ["re-export"] });

    expect(second.duplicate).toBe(true);
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.entry.tags).toContain("re-export");
    expect((await listDemoEntries()).filter((entry) => entry.demoSha256 === demoSha256)).toHaveLength(1);
  });

  it("keeps same map, score and teams when raw hashes differ", async () => {
    const first = await importDemoFile(file(await variantBytes("c".repeat(64), "2026-09-03T00:00:00Z"), "same-match-a.zip"));
    const second = await importDemoFile(file(await variantBytes("d".repeat(64), "2026-09-04T00:00:00Z"), "same-match-b.zip"));

    expect(second.duplicate).toBe(false);
    expect(second.entry.id).not.toBe(first.entry.id);
    expect((await listDemoEntries()).filter((entry) => [first.entry.id, second.entry.id].includes(entry.id))).toHaveLength(2);
  });

  it("backfills a historic entry with manifest-only parsing", async () => {
    const imported = await importDemoFile(file(await variantBytes("e".repeat(64), "2026-09-05T00:00:00Z"), "backfill.zip"));
    const meta = getStorage().records("demos");
    const { demoSha256: _demoSha256, ...historic } = imported.entry;
    await meta.put(imported.entry.id, historic);

    const result = await backfillDemoIdentities();

    expect(result.backfilled).toBe(1);
    expect(result.entries.find((entry) => entry.id === imported.entry.id)?.demoSha256).toBe("e".repeat(64));
  });

  it("rewires duplicate references and preserves facts when fileName is shared", async () => {
    const imported = await importDemoFile(file(await variantBytes("f".repeat(64), "2026-09-06T00:00:00Z"), "same-file-name.zip"));
    const storage = getStorage();
    const duplicateId = "repair-duplicate";
    const duplicate = { ...imported.entry, id: duplicateId, importedAt: imported.entry.importedAt + 1, demoSha256: null };
    const blob = await storage.blobs("demos").get(imported.entry.id);
    if (!blob) throw new Error("fixture blob missing");
    await Promise.all([
      storage.records("demos").put(duplicateId, duplicate),
      storage.blobs("demos").put(duplicateId, blob.slice(0)),
    ]);
    const seriesId = "repair-series";
    await saveSeriesRecord({
      id: seriesId,
      name: "repair",
      entryIds: [imported.entry.id, duplicateId],
      format: "bo1",
      teamAName: imported.entry.meta.teamAName,
      teamBName: imported.entry.meta.teamBName,
      veto: null,
      mapAssignments: [
        { order: 1, mapName: imported.entry.meta.mapName, entryId: imported.entry.id },
        { order: 2, mapName: imported.entry.meta.mapName, entryId: duplicateId },
      ],
    });

    try {
      const result = await repairDemoIdentityAndDuplicates();
      const repairedSeries = (await listSeriesRecords()).find((row) => row.id === seriesId);
      const entries = await listDemoEntries();

      expect(result.duplicateGroups).toBe(1);
      expect(result.removed).toBe(1);
      expect(result.rewiredSeries).toBe(1);
      expect(entries.some((entry) => entry.id === imported.entry.id)).toBe(false);
      expect(entries.some((entry) => entry.id === duplicateId)).toBe(true);
      expect(repairedSeries?.entryIds).toEqual([duplicateId]);
      expect(repairedSeries?.mapAssignments?.map((assignment) => assignment.entryId)).toEqual([duplicateId, duplicateId]);
      expect(await getFactsStore().getLineups({ matchIds: [matchIdForEntry(imported.entry)] })).not.toHaveLength(0);
    } finally {
      await deleteSeriesRecord(seriesId);
    }
  });
});
