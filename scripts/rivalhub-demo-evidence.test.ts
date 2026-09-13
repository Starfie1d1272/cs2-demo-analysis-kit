import { describe, expect, it } from "vitest";
import { buildRivalHubDemoEvidenceV1 } from "./rivalhub-demo-evidence";

describe("RivalHub evidence producer", () => {
  it("fails fast when the DemoPackage hash is missing instead of inventing one", () => {
    const pkg = { manifest: { demo: {} } } as never;
    expect(() => buildRivalHubDemoEvidenceV1(pkg, {} as never, new Map())).toThrow("manifest.demo.hash");
  });
});
