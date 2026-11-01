/**
 * 赛事包上传隔离区 Worker。
 *
 * HTTP 接口只提供隔离前缀 events/_submissions/ 的上传，路径约束由代码实现。
 * 审核与发布在本地（R2 凭证 + scripts/promote-event-submission.mjs）。
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

class UploadError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const PART_BYTES = 5 * 1024 * 1024;

/** Keep one multipart buffer; await each hash/write before reading more input. */
async function uploadArchive(request: Request, bucket: R2Bucket, key: string, slug: string,
  sha256: string, maxBytes: number, declaredLength: number | null): Promise<number> {
  if (!request.body) throw new UploadError(400, "空请求体");
  const reader = request.body.getReader();
  const digest = new crypto.DigestStream("SHA-256");
  // Observe rejection immediately, including cancellation before the final digest read.
  const digestResult = digest.digest.then(value => ({ value }), error => ({ error }));
  const writer = digest.getWriter();
  let upload: R2MultipartUpload | undefined;
  const parts: R2UploadedPart[] = [];
  const buffer = new Uint8Array(PART_BYTES);
  const magic = new Uint8Array(4);
  let magicLength = 0;
  let used = 0;
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new UploadError(413, `超过上限 ${(maxBytes / 1024 / 1024).toFixed(0)}MB`);
      if (declaredLength !== null && size > declaredLength) throw new UploadError(400, "请求体长度与声明不符");
      if (magicLength < 4) {
        const length = Math.min(4 - magicLength, value.byteLength);
        magic.set(value.subarray(0, length), magicLength);
        magicLength += length;
        if (magicLength === 4 && !(magic[0] === 0x50 && magic[1] === 0x4b &&
          ((magic[2] === 0x03 && magic[3] === 0x04) || (magic[2] === 0x05 && magic[3] === 0x06)))) {
          throw new UploadError(415, "不是 zip 文件");
        }
      }
      await writer.write(value);
      let offset = 0;
      while (offset < value.byteLength) {
        const count = Math.min(PART_BYTES - used, value.byteLength - offset);
        buffer.set(value.subarray(offset, offset + count), used);
        used += count;
        offset += count;
        if (used === PART_BYTES) {
          upload ??= await bucket.createMultipartUpload(key, {
            httpMetadata: { contentType: "application/zip" },
            customMetadata: { slug, sha256 },
          });
          parts.push(await upload.uploadPart(parts.length + 1, buffer));
          used = 0;
        }
      }
    }
    if (size === 0) throw new UploadError(400, "空请求体");
    if (magicLength < 4) throw new UploadError(415, "不是 zip 文件");
    if (declaredLength !== null && size !== declaredLength) throw new UploadError(400, "请求体长度与声明不符");
    await writer.close();
    const result = await digestResult;
    if ("error" in result) throw result.error;
    const actualSha = [...new Uint8Array(result.value)].map(b => b.toString(16).padStart(2, "0")).join("");
    if (actualSha !== sha256) throw new UploadError(422, "sha256 与声明不符（传输损坏？）");
    if (upload) {
      if (used > 0) parts.push(await upload.uploadPart(parts.length + 1, buffer.subarray(0, used)));
      await upload.complete(parts);
    } else {
      await bucket.put(key, buffer.subarray(0, used), {
        httpMetadata: { contentType: "application/zip" },
        customMetadata: { slug, sha256, size: String(size) },
        sha256,
      });
    }
    return size;
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    await writer.abort(error).catch(() => {});
    if (upload) await upload.abort().catch(() => { console.error("submission multipart abort failed"); });
    throw error;
  } finally {
    reader.releaseLock();
    writer.releaseLock();
  }
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

    const maxBytes = Number(env.MAX_UPLOAD_BYTES || 536870912);
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 536870912) {
      return json({ ok: false, error: "上传大小配置无效" }, 503, cors);
    }
    const declaredSha = (request.headers.get("x-sha256") ?? "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(declaredSha)) return json({ ok: false, error: "缺少或非法 x-sha256" }, 400, cors);
    const lengthHeader = request.headers.get("content-length");
    const declaredLen = lengthHeader === null ? null : Number(lengthHeader);
    if (declaredLen !== null && (!Number.isSafeInteger(declaredLen) || declaredLen < 0)) {
      return json({ ok: false, error: "非法 content-length" }, 400, cors);
    }
    if (declaredLen !== null && declaredLen > maxBytes) {
      return json({ ok: false, error: `超过上限 ${(maxBytes / 1024 / 1024).toFixed(0)}MB` }, 413, cors);
    }

    if (env.TURNSTILE_SECRET) {
      const ip = request.headers.get("cf-connecting-ip");
      const ok = await verifyTurnstile(request.headers.get("cf-turnstile-token"), env.TURNSTILE_SECRET, ip);
      if (!ok) return json({ ok: false, error: "人机校验未通过" }, 403, cors);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const key = `${SUBMISSION_PREFIX}${stamp}-${slug}-${declaredSha.slice(0, 8)}.zip`;
    let size: number;
    try {
      size = await uploadArchive(request, env.ASSETS, key, slug, declaredSha, maxBytes, declaredLen);
    } catch (error) {
      if (error instanceof UploadError) return json({ ok: false, error: error.message }, error.status, cors);
      console.error("submission upload failed");
      return json({ ok: false, error: "上传中断，请重试" }, 503, cors);
    }
    await env.ASSETS.put(`${key}.meta.json`, JSON.stringify({
      slug,
      sha256: declaredSha,
      size,
      note: (request.headers.get("x-note") ?? "").slice(0, 500),
      submittedAt: new Date().toISOString(),
      ua: (request.headers.get("user-agent") ?? "").slice(0, 200),
    }, null, 2), { httpMetadata: { contentType: "application/json" } });

    return json({ ok: true, key, sha256: declaredSha }, 202, cors);
  },
};
