export interface BuildInfo {
  releaseVersion: string;
  buildRevision: string | null;
  buildDirty: boolean | null;
  versionSync: string;
  packageMode: string;
  artifactId: string;
  candidateTag?: string;
}
export function readBuildInfo(root: string, options?: { versionSync?: string; releaseTag?: string; candidateTag?: string }): BuildInfo;
