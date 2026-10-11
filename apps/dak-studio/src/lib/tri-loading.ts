import { buildTriangleBvh, parseAwpyTri, type TriangleBvh } from "@cs2dak/maps";
import { normalizeDiagnostic, type SafeDiagnostic } from "@cs2dak/rivalhub-upload";

export type TriDiagnosticSink = (diagnostic: SafeDiagnostic) => void;
export function triDiagnostic(sink: TriDiagnosticSink, mapName: string, code: string, stage: string, message: string, cause?: unknown, status?: number): void {
  try { sink(normalizeDiagnostic({ code, message, cause, status }, { stage: `tri.${stage}`, fileId: mapName })); }
  catch { /* Diagnostic sinks cannot change an optional asset outcome. */ }
}
export function isValidTriBuffer(buffer: ArrayBuffer): boolean {
  return buffer.byteLength > 0 && buffer.byteLength % 36 === 0;
}

/** Shared browser/worker transport. Only absence/SPA fallback is a normal missing asset. */
export async function fetchTriBuffer(mapName: string, baseUrl: string, sink: TriDiagnosticSink): Promise<ArrayBuffer | null> {
  let response: Response;
  try { response = await fetch(`${baseUrl}${mapName}.tri`); }
  catch (error) { triDiagnostic(sink, mapName, "TRI_FETCH_FAILED", "fetch", "Optional tri asset request failed", error); return null; }
  if (!response.ok) {
    const missing = response.status === 404;
    triDiagnostic(sink, mapName, missing ? "TRI_MISSING" : "TRI_FETCH_FAILED", "fetch", missing ? "Optional tri asset is absent" : "Optional tri asset returned an HTTP error", undefined, response.status);
    return null;
  }
  if ((response.headers.get("content-type") ?? "").includes("text/html")) {
    triDiagnostic(sink, mapName, "TRI_MISSING", "fetch", "Optional tri asset returned the SPA fallback");
    return null;
  }
  let buffer: ArrayBuffer;
  try { buffer = await response.arrayBuffer(); }
  catch (error) { triDiagnostic(sink, mapName, "TRI_READ_FAILED", "read", "Optional tri response could not be read", error); return null; }
  if (!isValidTriBuffer(buffer)) {
    triDiagnostic(sink, mapName, "TRI_INVALID", "parse", "Optional tri asset has an invalid byte length");
    return null;
  }
  return buffer;
}

export function buildTriBvh(buffer: ArrayBuffer, mapName: string, sink: TriDiagnosticSink): TriangleBvh | null {
  try { return buildTriangleBvh(parseAwpyTri(buffer)); }
  catch (error) { triDiagnostic(sink, mapName, "TRI_INVALID", "parse", "Optional tri asset could not be parsed", error); return null; }
}
