import { normalizeDiagnostic, type SafeDiagnostic } from "@cs2dak/rivalhub-upload";

export async function reportDiagnostic(diagnostic: SafeDiagnostic): Promise<void> {
  try {
    const report = typeof window === "undefined" ? undefined : window.pywebview?.api.report_diagnostic;
    if (report && (await report(diagnostic)).ok) return;
  } catch {
    // Diagnostic delivery must never replace the parser outcome.
  }
  try { console.warn("Studio diagnostic", diagnostic); } catch { /* best-effort sink */ }
}

/** Keep the worker failure primary even when a retry also fails. */
export async function withWorkerFallback<T>(
  failure: unknown,
  stage: string,
  buffer: ArrayBuffer | null,
  fallback: (buffer: ArrayBuffer) => Promise<T>,
  fileId?: string,
): Promise<T> {
  const primary = normalizeDiagnostic(failure, { stage, fileId });
  void reportDiagnostic(primary);
  if (buffer === null) {
    throw new Error(`后台解析失败；低内存导入未保留回退字节，请重试该地图：${primary.message}`, { cause: primary });
  }
  try {
    return await fallback(buffer);
  } catch (error) {
    const secondary = normalizeDiagnostic(error, { stage: `${stage}.fallback`, fileId });
    void reportDiagnostic(secondary);
    throw new Error(`后台解析失败：${primary.message}；主线程重试失败：${secondary.message}`, {
      cause: { ...primary, fallback: secondary },
    });
  }
}
