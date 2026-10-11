/** Safe diagnostic projection: never serialize arbitrary rejection objects or response bodies. */
export interface DiagnosticContext { stage?: string; fileId?: string; attempt?: number }
export interface SafeDiagnostic extends DiagnosticContext { code: string; message: string; cause?: string; status?: number; requestId?: string }
export function sanitizeDiagnosticText(value: string, maxLength = 500): string {
  return value
    .replace(/((?:"|')?(?:device[_-]?code|pairing[_-]?code|access[_-]?token|refresh[_-]?token|poll[_-]?token|token|authorization|password|secret|(?:set-)?cookie|api[_-]?key)(?:"|')?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi, "$1[redacted]")
    .replace(/\b(?:set-cookie|cookie|authorization)\s*[:=]\s*[^\r\n]+/gi, "[credentials redacted]")
    .replace(/https?:\/\/[^\s<>"']+/gi, "[url]")
    .replace(/file:\/\/[^\r\n<>"']+/gi, "[path]")
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
    .replace(/((?:"|')?(?:device[_-]?code|pairing[_-]?code|access[_-]?token|refresh[_-]?token|poll[_-]?token|token|authorization|password|secret|cookie|api[_-]?key)(?:"|')?\s*[=:]\s*)[^\s,;}]+/gi, "$1[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\r\n<>"']+/g, "[path]")
    .replace(/(["'])(?:[A-Za-z]:[\\/]|\/)[^\r\n]*?\1/g, "[path]")
    .replace(/(?<![\w:])\/(?:[^/\r\n"'<>]+\/)+[^\r\n"'<>:,]+/g, "[path]")
    .replace(/(?<![\w:])\/(?:[^\s"'<>:,]+\/)*[^\s"'<>:,]+/g, "[path]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maxLength);
}
function field(value: unknown, key: string): unknown {
  try { return value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined; } catch { return undefined; }
}
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? sanitizeDiagnosticText(value) : undefined; }
function identifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value) && sanitizeDiagnosticText(value) === value ? value : undefined;
}
export function normalizeDiagnostic(error: unknown, context: DiagnosticContext = {}): SafeDiagnostic {
  const message = text(field(error, "message")) ?? text(error) ?? "操作失败：未提供错误详情";
  const code = identifier(field(error, "code")) ?? /^([A-Z][A-Z_0-9]+)(?:[：:]|$)/.exec(message)?.[1] ?? "UPLOAD_FAILED";
  const status = field(error, "status");
  const cause = field(error, "cause");
  const causes: string[] = [];
  let current = cause;
  for (let depth = 0; depth < 3 && current != null && current !== error; depth++) {
    const item = text(field(current, "message")) ?? text(current);
    if (item) causes.push(item);
    const next = field(current, "cause");
    if (next === current) break;
    current = next;
  }
  const structuredCauses = field(error, "causes");
  if (!causes.length && Array.isArray(structuredCauses)) {
    for (let index = 0; index < 3; index++) {
      const item = field(structuredCauses, String(index));
      const message = text(field(item, "message")) ?? text(item);
      if (message) causes.push(message);
    }
  }
  const stage = text(field(context, "stage")) ?? text(field(error, "stage"));
  const fileId = identifier(field(context, "fileId")) ?? identifier(field(error, "fileId"));
  const attempt = field(context, "attempt") ?? field(error, "attempt");
  const requestId = identifier(field(error, "requestId"));
  return {
    code, message, ...(causes.length ? { cause: causes.join(" → ").slice(0, 500) } : {}),
    ...(typeof status === "number" && Number.isInteger(status) && status >= 0 && status <= 599 ? { status } : {}),
    ...(requestId ? { requestId } : {}),
    ...(stage ? { stage: sanitizeDiagnosticText(stage, 80) } : {}),
    ...(identifier(fileId) ? { fileId } : {}),
    ...(typeof attempt === "number" && Number.isSafeInteger(attempt) && attempt > 0 ? { attempt } : {}),
  };
}
