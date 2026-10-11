export interface BuildInfo {
  releaseVersion: string;
  buildRevision: string | null;
  buildDirty: boolean | null;
  versionSync: string;
  packageMode: string;
  artifactId: string;
}
export function readBuildInfo(root: string, options?: { versionSync?: string; releaseTag?: string }): BuildInfo;
