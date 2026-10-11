import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { loadDemoPackageFromZip, type OptionalInputDiagnostic } from "./loader";

async function fixtureZip() {
  const zip = await JSZip.loadAsync(await readFile("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip"));
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  delete manifest.files.replay;
  delete manifest.files.duels;
  manifest.files.shots = "optional-shots.json";
  zip.file("manifest.json", JSON.stringify(manifest));
  return zip;
}

describe("optional ZIP input observations", () => {
  it("distinguishes absent, malformed and unreadable optional JSON without changing facts", async () => {
    const zip = await fixtureZip();
    const zipSpy = vi.spyOn(JSZip, "loadAsync").mockResolvedValue(zip);
    const observations: OptionalInputDiagnostic[] = [];
    try {
      const options = { onDiagnostic: (diagnostic: OptionalInputDiagnostic) => observations.push(diagnostic) };
      const absent = await loadDemoPackageFromZip(new Uint8Array(), options);
      expect(observations[0]).toMatchObject({ code: "OPTIONAL_INPUT_MISSING", stage: "package.optional.shots.read" });
      observations.length = 0;
      zip.file("optional-shots.json", "{broken json");
      const invalid = await loadDemoPackageFromZip(new Uint8Array(), options);
      expect(observations[0]).toMatchObject({ code: "OPTIONAL_INPUT_INVALID", stage: "package.optional.shots.parse", cause: expect.objectContaining({ name: "SyntaxError", message: expect.stringContaining("SyntaxError:") }) });
      expect(invalid).toEqual(absent);
      observations.length = 0;
      const failure = new Error("zip decompression failed");
      const read = vi.spyOn(zip.file("optional-shots.json")!, "async").mockRejectedValue(failure);
      const unreadable = await loadDemoPackageFromZip(new Uint8Array(), options);
      expect(observations[0]).toMatchObject({ code: "OPTIONAL_INPUT_READ_FAILED", cause: failure });
      expect(unreadable).toEqual(absent);
      read.mockRestore();
      await expect(loadDemoPackageFromZip(new Uint8Array(), { onDiagnostic: () => { throw new Error("sink failed"); } })).resolves.toEqual(absent);
    } finally { zipSpy.mockRestore(); }
  });

  it("records deliberate evidence-profile skips without accessing the optional files", async () => {
    const zip = await fixtureZip();
    zip.file("optional-shots.json", "{broken json");
    const read = vi.spyOn(zip.file("optional-shots.json")!, "async");
    const zipSpy = vi.spyOn(JSZip, "loadAsync").mockResolvedValue(zip);
    const observations: OptionalInputDiagnostic[] = [];
    try {
      const pkg = await loadDemoPackageFromZip(new Uint8Array(), { profile: "evidence", onDiagnostic: diagnostic => observations.push(diagnostic) });
      expect(read).not.toHaveBeenCalled();
      expect(observations.map(diagnostic => diagnostic.code)).toEqual(Array(3).fill("OPTIONAL_INPUT_SKIPPED"));
      expect(pkg.shots).toBeUndefined();
      expect(pkg).not.toHaveProperty("diagnostics");
    } finally { zipSpy.mockRestore(); read.mockRestore(); }
  });
});
