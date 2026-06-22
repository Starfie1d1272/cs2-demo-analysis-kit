/**
 * 赛事包上传隔离区 Worker。
 *
 * 安全模型：边缘只能「收」到隔离前缀 events/_submissions/，无法 promote、无法列出、无法删除
 * 已发布资产。审核与发布完全在本地（你的 R2 凭证 + scripts/promote-event-submission.mjs）。
 *
 * 端点：
 *   POST /submit?slug=<slug>           上传一个 <slug>.zip 赛事包（请求体 = zip 原始字节）
 *     头：x-sha256（必填，客户端算的 sha256，hex）、x-note（可选，投稿说明）
 *         cf-turnstile-token（当配置 TURNSTILE_SECRET 时必填，人机校验）
 *   OPTIONS /submit                    CORS 预检
 *
 * 返回 202 + { ok, key, sha256 }。落点 key 形如 events/_submissions/<ISO日期>-<slug>-<sha8>.zip，
 * 同时写一个并列的 .meta.json（sha256/size/note/submittedAt/ua）。
 */
export interface Env {
  ASSETS: R2Bucket;
  MAX_UPLOAD_BYTES: string;
  ALLOWED_ORIGINS: string;
  TURNSTILE_SECRET?: string;
}

const SUBMISSION_PREFIX = "events/_submissions/";

function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
  const allowOrigin = list.includes("*") ? "*" : origin && list.includes(origin) ? origin : list[0] ?? "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-sha256, x-note, cf-turnstile-token",
    "access-control-max-age": "86400",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

function sanitizeSlug(raw: string | null): string | null {
  if (!raw) return null;
  const slug = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  return slug.length >= 1 && slug.length <= 80 ? slug : null;
}

async function verifyTurnstile(token: string | null, secret: string, ip: string | null): Promise<boolean> {
  if (!token) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS ?? "*");

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== "/submit" || request.method !== "POST") {
      return json({ ok: false, error: "not found" }, 404, cors);
    }

    const slug = sanitizeSlug(url.searchParams.get("slug") ?? request.headers.get("x-slug"));
    if (!slug) return json({ ok: false, error: "缺少或非法 slug" }, 400, cors);

    const maxBytes = Number(env.MAX_UPLOAD_BYTES) || 536870912;
    const declaredLen = Number(request.headers.get("content-length") ?? 0);
    if (declaredLen > maxBytes) {
      return json({ ok: false, error: `超过上限 ${(maxBytes / 1024 / 1024).toFixed(0)}MB` }, 413, cors);
    }

    if (env.TURNSTILE_SECRET) {
      const ip = request.headers.get("cf-connecting-ip");
      const ok = await verifyTurnstile(request.headers.get("cf-turnstile-token"), env.TURNSTILE_SECRET, ip);
      if (!ok) return json({ ok: false, error: "人机校验未通过" }, 403, cors);
    }

    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0) return json({ ok: false, error: "空请求体" }, 400, cors);
    if (bytes.byteLength > maxBytes) {
      return json({ ok: false, error: `超过上限 ${(maxBytes / 1024 / 1024).toFixed(0)}MB` }, 413, cors);
    }

    // zip 魔数校验：PK\x03\x04 或空档案 PK\x05\x06。挡掉明显非 zip 的投稿，深度校验在 promote 时做。
    const head = new Uint8Array(bytes.slice(0, 4));
    const isZip = head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05);
    if (!isZip) return json({ ok: false, error: "不是 zip 文件" }, 415, cors);

    const actualSha = await sha256Hex(bytes);
    const declaredSha = (request.headers.get("x-sha256") ?? "").toLowerCase();
    if (declaredSha && declaredSha !== actualSha) {
      return json({ ok: false, error: "sha256 与声明不符（传输损坏？）" }, 422, cors);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const key = `${SUBMISSION_PREFIX}${stamp}-${slug}-${actualSha.slice(0, 8)}.zip`;
    await env.ASSETS.put(key, bytes, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: { slug, sha256: actualSha, size: String(bytes.byteLength) },
    });
    await env.ASSETS.put(`${key}.meta.json`, JSON.stringify({
      slug,
      sha256: actualSha,
      size: bytes.byteLength,
      note: (request.headers.get("x-note") ?? "").slice(0, 500),
      submittedAt: new Date().toISOString(),
      ua: (request.headers.get("user-agent") ?? "").slice(0, 200),
    }, null, 2), { httpMetadata: { contentType: "application/json" } });

    return json({ ok: true, key, sha256: actualSha }, 202, cors);
  },
};
