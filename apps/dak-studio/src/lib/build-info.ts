declare const __BUILD_INFO__: {
  releaseVersion: string;
  buildRevision: string | null;
  buildDirty: boolean | null;
};

export const BUILD_INFO = typeof __BUILD_INFO__ !== "undefined" ? __BUILD_INFO__ : {
  releaseVersion: "0.0.0", buildRevision: null, buildDirty: null,
};
export const BUILD_LABEL = `build: ${BUILD_INFO.buildRevision?.slice(0, 12) ?? "unknown"} · source: ${
  BUILD_INFO.buildDirty === null ? "unknown" : BUILD_INFO.buildDirty ? "dirty" : "clean"
}`;
