import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import JSZip from "jszip";
import { afterEach, expect, it, vi } from "vitest";
import { loadDemoPackageFromZip, type OptionalInputDiagnostic } from "@cs2dak/core";
import { normalizeDiagnostic, type SafeDiagnostic } from "@cs2dak/rivalhub-upload";
import { loadTrisManifest } from "./tri-assets";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(["opaque_private_payload_sentinel", "sk_live_synthetic_private_payload", '{\n"x":1,\n}'])("keeps both real parse failures safe through native log/export: %s", async payload => {
  const diagnostics: SafeDiagnostic[] = [];
  const observations: OptionalInputDiagnostic[] = [];
  const zip = await JSZip.loadAsync(await readFile("fixtures/input/sample-2026-05-17_de_ancient_Team_Spirit_13-10_Team_Falcons.zip"));
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  delete manifest.files.replay; delete manifest.files.duels;
  manifest.files.shots = "optional-shots.json";
  zip.file("manifest.json", JSON.stringify(manifest));
  zip.file("optional-shots.json", payload);
  const spy = vi.spyOn(JSZip, "loadAsync").mockResolvedValue(zip);
  await loadDemoPackageFromZip(new Uint8Array(), { onDiagnostic: diagnostic => {
    if (diagnostic.code === "OPTIONAL_INPUT_INVALID") {
      observations.push(diagnostic);
      diagnostics.push(normalizeDiagnostic(diagnostic));
    }
  } });
  spy.mockRestore();
  // The core observation itself must already exclude raw SyntaxError text.
  expect(observations).toHaveLength(1);
  expect(observations[0]!.cause).toMatchObject({ name: "SyntaxError" });
  expect(JSON.stringify(observations)).not.toMatch(/opaque_pri|sk_live_/);
  vi.stubGlobal("window", { pywebview: { api: { report_diagnostic: async (diagnostic: SafeDiagnostic) => { diagnostics.push(diagnostic); return { ok: true }; } } } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(payload, { headers: { "content-type": "application/json" } })));
  await expect(loadTrisManifest()).resolves.toBeNull();
  expect(diagnostics).toHaveLength(2);
  expect(diagnostics.map(diagnostic => [diagnostic.code, diagnostic.stage])).toEqual([
    ["OPTIONAL_INPUT_INVALID", "package.optional.shots.parse"],
    ["TRI_MANIFEST_INVALID", "tri.manifest.parse"],
  ]);
  for (const diagnostic of diagnostics) expect(diagnostic.cause).toContain("SyntaxError:");
  const output = spawnSync(process.platform === "win32" ? "python" : "python3", ["-c", `
import sys, json, logging, tempfile
from pathlib import Path
sys.path.insert(0, 'python/src')
from cs2dak.diagnostics import SafeFormatter, safe_metadata, export_logs
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    logger = logging.getLogger('parse-export-test')
    logger.setLevel(logging.INFO)
    logger.propagate = False
    handler = logging.FileHandler(root / 'diagnostics.log', encoding='utf-8')
    handler.setFormatter(SafeFormatter('%(message)s'))
    logger.addHandler(handler)
    try:
        for diagnostic in json.load(sys.stdin):
            logger.info('%s', json.dumps(safe_metadata(diagnostic)))
        handler.flush()
        assert export_logs(logger, root / 'export.log')
        print(json.dumps({'log': (root / 'diagnostics.log').read_text(), 'export': (root / 'export.log').read_text()}))
    finally:
        handler.close()
        logger.removeHandler(handler)
`], { input: JSON.stringify(diagnostics), encoding: "utf8", timeout: 20_000 });
  expect(output.status).toBe(0);
  const persisted = JSON.parse(output.stdout) as { log: string; export: string };
  for (const text of Object.values(persisted)) {
    expect(text).not.toMatch(/opaque_pri|sk_live_/);
    expect(text).toContain("SyntaxError:");
    expect(text).toContain("package.optional.shots.parse");
    expect(text).toContain("tri.manifest.parse");
    if (payload.startsWith("{")) expect(text).toContain("position 9, line 3, column 1");
  }
});
