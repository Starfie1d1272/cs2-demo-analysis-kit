import type { AnalysisFinding } from "@cs2dak/presentation";
import type { AnalysisContext } from "./analysis-context";

export interface FindingSnapshotV1 {
  snapshotVersion: "finding-snapshot/1";
  sourceIdentity: {
    capability: AnalysisFinding["capability"];
    findingKey: string;
    producerVersion: string;
  };
  producerRevision: string | null;
  analysisContextFingerprint: string;
  sourcePackageHashes: Record<string, string | null>;
  capturedAt: number;
  finding: AnalysisFinding;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonicalize(item)]));
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function captureFindingSnapshot(
  finding: AnalysisFinding,
  context: AnalysisContext,
  sourcePackageHashes: Record<string, string | null>,
  producerRevision: string | null = finding.producerVersion ?? null,
): Promise<FindingSnapshotV1> {
  return {
    snapshotVersion: "finding-snapshot/1",
    sourceIdentity: { capability: finding.capability, findingKey: finding.key, producerVersion: finding.producerVersion },
    producerRevision,
    analysisContextFingerprint: await sha256(context),
    sourcePackageHashes: { ...sourcePackageHashes },
    capturedAt: Date.now(),
    finding: structuredClone(finding),
  };
}
